/**
 * Ntfy Service - Sends push notifications via ntfy.sh
 *
 * Provides integration with ntfy.sh for push notifications.
 * Supports custom servers, authentication, tags, emojis, and click actions.
 *
 * @see https://docs.ntfy.sh/publish/
 */

import { createLogger } from '@automaker/utils';
import type { NtfyEndpointConfig, EventHookContext } from '@automaker/types';

const logger = createLogger('Ntfy');

/** Default timeout for ntfy HTTP requests (10 seconds) */
const DEFAULT_NTFY_TIMEOUT = 10000;

// Re-export EventHookContext as NtfyContext for backward compatibility
export type NtfyContext = EventHookContext;

/**
 * Ntfy Service
 *
 * Handles sending notifications to ntfy.sh endpoints.
 */
export class NtfyService {
  /**
   * Send a notification to a ntfy.sh endpoint
   *
   * @param endpoint The ntfy.sh endpoint configuration
   * @param options Notification options (title, body, tags, etc.)
   * @param context Context for variable substitution
   */
  async sendNotification(
    endpoint: NtfyEndpointConfig,
    options: {
      title?: string;
      body?: string;
      tags?: string;
      emoji?: string;
      clickUrl?: string;
      priority?: 1 | 2 | 3 | 4 | 5;
    },
    context: NtfyContext
  ): Promise<{ success: boolean; error?: string }> {
    if (!endpoint.enabled) {
      logger.warn(`Ntfy endpoint "${endpoint.name}" is disabled, skipping notification`);
      return { success: false, error: 'Endpoint is disabled' };
    }

    // Validate endpoint configuration
    const validationError = this.validateEndpoint(endpoint);
    if (validationError) {
      logger.error(`Invalid ntfy endpoint configuration: ${validationError}`);
      return { success: false, error: validationError };
    }

    // Build URL
    const serverUrl = endpoint.serverUrl.replace(/\/$/, ''); // Remove trailing slash
    const url = `${serverUrl}/${encodeURIComponent(endpoint.topic)}`;

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'text/plain; charset=utf-8',
    };

    // Title (with variable substitution)
    const title = this.substituteVariables(options.title || this.getDefaultTitle(context), context);
    if (title) {
      headers['Title'] = title;
    }

    // Priority
    const priority = options.priority || 3;
    headers['Priority'] = String(priority);

    // Tags and emoji
    const tags = this.buildTags(
      options.tags || endpoint.defaultTags,
      options.emoji || endpoint.defaultEmoji
    );
    if (tags) {
      headers['Tags'] = tags;
    }

    // Click action URL
    const clickUrl = this.substituteVariables(
      options.clickUrl || endpoint.defaultClickUrl || '',
      context
    );
    if (clickUrl) {
      headers['Click'] = clickUrl;
    }

    // Authentication
    this.addAuthHeaders(headers, endpoint);

    // Message body (with variable substitution)
    const body = this.substituteVariables(options.body || this.getDefaultBody(context), context);

    logger.info(`Sending ntfy notification to ${endpoint.name}: ${title}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_NTFY_TIMEOUT);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        logger.error(`Ntfy notification failed with status ${response.status}: ${errorText}`);
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      logger.info(`Ntfy notification sent successfully to ${endpoint.name}`);
      return { success: true };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.error(`Ntfy notification timed out after ${DEFAULT_NTFY_TIMEOUT}ms`);
        return { success: false, error: 'Request timed out' };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Ntfy notification failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Validate an ntfy endpoint configuration
   */
  validateEndpoint(endpoint: NtfyEndpointConfig): string | null {
    // Validate server URL
    if (!endpoint.serverUrl) {
      return 'Server URL is required';
    }

    try {
      new URL(endpoint.serverUrl);
    } catch {
      return 'Invalid server URL format';
    }

    // Validate topic
    if (!endpoint.topic) {
      return 'Topic is required';
    }

    if (endpoint.topic.includes(' ') || endpoint.topic.includes('\t')) {
      return 'Topic cannot contain spaces';
    }

    // Validate authentication
    if (endpoint.authType === 'basic') {
      if (!endpoint.username || !endpoint.password) {
        return 'Username and password are required for basic authentication';
      }
    } else if (endpoint.authType === 'token') {
      if (!endpoint.token) {
        return 'Access token is required for token authentication';
      }
    }

    return null;
  }

  /**
   * Build tags string from tags and emoji
   */
  private buildTags(tags?: string, emoji?: string): string {
    const tagList: string[] = [];

    if (tags) {
      // Split by comma and trim whitespace
      const parsedTags = tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      tagList.push(...parsedTags);
    }

    if (emoji) {
      // Add emoji as first tag if it looks like a shortcode
      if (emoji.startsWith(':') && emoji.endsWith(':')) {
        tagList.unshift(emoji.slice(1, -1));
      } else if (!emoji.includes(' ')) {
        // If it's a single emoji or shortcode without colons, add as-is
        tagList.unshift(emoji);
      }
    }

    return tagList.join(',');
  }

  /**
   * Add authentication headers based on auth type
   */
  private addAuthHeaders(headers: Record<string, string>, endpoint: NtfyEndpointConfig): void {
    if (endpoint.authType === 'basic' && endpoint.username && endpoint.password) {
      const credentials = Buffer.from(`${endpoint.username}:${endpoint.password}`).toString(
        'base64'
      );
      headers['Authorization'] = `Basic ${credentials}`;
    } else if (endpoint.authType === 'token' && endpoint.token) {
      headers['Authorization'] = `Bearer ${endpoint.token}`;
    }
  }

  /**
   * Get default title based on event context
   */
  private getDefaultTitle(context: NtfyContext): string {
    const eventName = this.formatEventName(context.eventType);
    if (context.featureName) {
      return `${eventName}: ${context.featureName}`;
    }
    return eventName;
  }

  /**
   * Get default body based on event context
   */
  private getDefaultBody(context: NtfyContext): string {
    const lines: string[] = [];

    if (context.featureName) {
      lines.push(`Feature: ${context.featureName}`);
    }
    if (context.featureId) {
      lines.push(`ID: ${context.featureId}`);
    }
    if (context.projectName) {
      lines.push(`Project: ${context.projectName}`);
    }
    if (context.error) {
      lines.push(`Error: ${context.error}`);
    }
    lines.push(`Time: ${context.timestamp}`);

    return lines.join('\n');
  }

  /**
   * Format event type to human-readable name
   */
  private formatEventName(eventType: string): string {
    const eventNames: Record<string, string> = {
      feature_created: 'Feature Created',
      feature_success: 'Feature Completed',
      feature_error: 'Feature Failed',
      auto_mode_complete: 'Auto Mode Complete',
      auto_mode_error: 'Auto Mode Error',
    };
    return eventNames[eventType] || eventType;
  }

  /**
   * Substitute {{variable}} placeholders in a string
   */
  private substituteVariables(template: string, context: NtfyContext): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      const value = context[variable as keyof NtfyContext];
      if (value === undefined || value === null) {
        return '';
      }
      return String(value);
    });
  }
}

// Singleton instance
export const ntfyService = new NtfyService();
