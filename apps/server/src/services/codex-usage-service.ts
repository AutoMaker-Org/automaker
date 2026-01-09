import * as os from 'os';
import { findCodexCliPath } from '@automaker/platform';
import { checkCodexAuthentication } from '../lib/codex-auth.js';
import { spawnProcess } from '@automaker/platform';
import * as fs from 'fs';
import * as path from 'path';

export interface CodexRateLimitWindow {
  limit: number;
  used: number;
  remaining: number;
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: number;
}

export interface CodexCreditsSnapshot {
  balance?: string;
  unlimited?: boolean;
  hasCredits?: boolean;
}

export type CodexPlanType = 'free' | 'plus' | 'pro' | 'team' | 'enterprise' | 'edu' | 'unknown';

export interface CodexUsageData {
  rateLimits: {
    primary?: CodexRateLimitWindow;
    secondary?: CodexRateLimitWindow;
    credits?: CodexCreditsSnapshot;
    planType?: CodexPlanType;
  } | null;
  lastUpdated: string;
}

/**
 * Codex Usage Service
 *
 * Attempts to fetch usage data from Codex CLI and OpenAI API.
 * Codex CLI doesn't provide a direct usage command, but we can:
 * 1. Parse usage info from error responses (rate limit errors contain plan info)
 * 2. Check for OpenAI API usage if API key is available
 */
export class CodexUsageService {
  private codexBinary = 'codex';
  private isWindows = os.platform() === 'win32';
  private cachedCliPath: string | null = null;

  /**
   * Check if Codex CLI is available on the system
   */
  async isAvailable(): Promise<boolean> {
    this.cachedCliPath = await findCodexCliPath();
    return Boolean(this.cachedCliPath);
  }

  /**
   * Attempt to fetch usage data
   *
   * Tries multiple approaches:
   * 1. Check for OpenAI API key in environment
   * 2. Make a test request to capture rate limit headers
   * 3. Parse usage info from error responses
   */
  async fetchUsageData(): Promise<CodexUsageData> {
    const cliPath = this.cachedCliPath || (await findCodexCliPath());

    if (!cliPath) {
      throw new Error('Codex CLI not found. Please install it with: npm install -g @openai/codex');
    }

    // Check if user has an API key that we can use
    const hasApiKey = !!process.env.OPENAI_API_KEY;

    if (hasApiKey) {
      // Try to get usage from OpenAI API
      const openaiUsage = await this.fetchOpenAIUsage();
      if (openaiUsage) {
        return openaiUsage;
      }
    }

    // Try to get usage from Codex CLI by making a simple request
    const codexUsage = await this.fetchCodexUsage(cliPath);
    if (codexUsage) {
      return codexUsage;
    }

    // Fallback: try to parse usage from auth file
    const authUsage = await this.fetchFromAuthFile();
    if (authUsage) {
      return authUsage;
    }

    // If all else fails, return a message with helpful information
    throw new Error(
      'Codex usage statistics require additional configuration. ' +
        'To enable usage tracking:\n\n' +
        '1. Set your OpenAI API key in the environment:\n' +
        '   export OPENAI_API_KEY=sk-...\n\n' +
        '2. Or check your usage at:\n' +
        '   https://platform.openai.com/usage\n\n' +
        'Note: If using Codex CLI with ChatGPT OAuth authentication, ' +
        'usage data must be queried through your OpenAI account.'
    );
  }

  /**
   * Try to fetch usage from OpenAI API using the API key
   */
  private async fetchOpenAIUsage(): Promise<CodexUsageData | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    try {
      const endTime = Math.floor(Date.now() / 1000);
      const startTime = endTime - 7 * 24 * 60 * 60; // Last 7 days

      const response = await fetch(
        `https://api.openai.com/v1/organization/usage/completions?start_time=${startTime}&end_time=${endTime}&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        return this.parseOpenAIUsage(data);
      }
    } catch (error) {
      console.log('[CodexUsage] Failed to fetch from OpenAI API:', error);
    }

    return null;
  }

  /**
   * Parse OpenAI usage API response
   */
  private parseOpenAIUsage(data: any): CodexUsageData {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    if (data.data && Array.isArray(data.data)) {
      for (const bucket of data.data) {
        if (bucket.results && Array.isArray(bucket.results)) {
          for (const result of bucket.results) {
            totalInputTokens += result.input_tokens || 0;
            totalOutputTokens += result.output_tokens || 0;
          }
        }
      }
    }

    return {
      rateLimits: {
        planType: 'unknown',
        credits: {
          hasCredits: true,
        },
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Try to fetch usage by making a test request to Codex CLI
   * and parsing rate limit information from the response
   */
  private async fetchCodexUsage(cliPath: string): Promise<CodexUsageData | null> {
    try {
      // Make a simple request to trigger rate limit info if at limit
      const result = await spawnProcess({
        command: cliPath,
        args: ['exec', '--', 'echo', 'test'],
        cwd: process.cwd(),
        env: {
          ...process.env,
          TERM: 'dumb',
        },
        timeout: 10000,
      });

      // Parse the output for rate limit information
      const combinedOutput = (result.stdout + result.stderr).toLowerCase();

      // Check if we got a rate limit error
      const rateLimitMatch = combinedOutput.match(
        /usage_limit_reached.*?"plan_type":"([^"]+)".*?"resets_at":(\d+).*?"resets_in_seconds":(\d+)/
      );

      if (rateLimitMatch) {
        const planType = rateLimitMatch[1] as CodexPlanType;
        const resetsAt = parseInt(rateLimitMatch[2], 10);
        const resetsInSeconds = parseInt(rateLimitMatch[3], 10);

        return {
          rateLimits: {
            planType,
            primary: {
              limit: 0,
              used: 0,
              remaining: 0,
              usedPercent: 100,
              windowDurationMins: Math.ceil(resetsInSeconds / 60),
              resetsAt,
            },
          },
          lastUpdated: new Date().toISOString(),
        };
      }

      // If no rate limit, return basic info
      return {
        rateLimits: {
          planType: 'plus',
          credits: {
            hasCredits: true,
            unlimited: false,
          },
        },
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.log('[CodexUsage] Failed to fetch from Codex CLI:', error);
    }

    return null;
  }

  /**
   * Try to extract usage info from the Codex auth file
   */
  private async fetchFromAuthFile(): Promise<CodexUsageData | null> {
    try {
      const authFilePath = path.join(os.homedir(), '.codex', 'auth.json');

      if (fs.existsSync(authFilePath)) {
        const authContent = fs.readFileSync(authFilePath, 'utf-8');
        const authData = JSON.parse(authContent);

        // Extract plan type from the ID token claims
        if (authData.tokens?.id_token) {
          const idToken = authData.tokens.id_token;
          const claims = this.parseJwt(idToken);

          const planType = claims?.['https://chatgpt.com/account_type'] || 'unknown';
          const isPlus = planType === 'plus';

          return {
            rateLimits: {
              planType: planType as CodexPlanType,
              credits: {
                hasCredits: true,
                unlimited: !isPlus,
              },
            },
            lastUpdated: new Date().toISOString(),
          };
        }
      }
    } catch (error) {
      console.log('[CodexUsage] Failed to parse auth file:', error);
    }

    return null;
  }

  /**
   * Parse JWT token to extract claims
   */
  private parseJwt(token: string): any {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  }

  /**
   * Check if Codex is authenticated
   */
  private async checkAuthentication(): Promise<boolean> {
    const cliPath = this.cachedCliPath || (await findCodexCliPath());
    const authCheck = await checkCodexAuthentication(cliPath);
    return authCheck.authenticated;
  }
}
