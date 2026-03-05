/**
 * Automation utility functions
 *
 * Helper functions for automation step editors and configuration handling.
 */

import type { AutomationStep } from '@automaker/types';
import { getApiKey, getServerUrlSync, getSessionToken } from '@/lib/http-api-client';

/** Number of spaces to use for JSON pretty-printing */
const JSON_INDENT_SIZE = 2;

/**
 * Get the 'value' field from a config object as a string for display.
 *
 * The value can be stored as any JSON type (string, number, object, array, etc.),
 * so we need to serialize it properly for display in text inputs/textareas.
 *
 * @param config - The configuration object containing a 'value' property
 * @returns The value as a string suitable for display
 *
 * @example
 * getValueAsString({ value: 'hello' }) // Returns: 'hello'
 * getValueAsString({ value: 42 }) // Returns: '42'
 * getValueAsString({ value: { key: 'value' } }) // Returns: '{\n  "key": "value"\n}'
 * getValueAsString({ value: null }) // Returns: ''
 * getValueAsString({}) // Returns: ''
 */
export function getValueAsString(config: Record<string, unknown>): string {
  const value = config.value;
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  // For non-string values (numbers, objects, arrays), stringify them
  return JSON.stringify(value, null, JSON_INDENT_SIZE);
}

/**
 * Result of parsing a JSON string value from an input field.
 */
export interface ParsedValueResult {
  /** The parsed value (JSON type) or raw string if parsing failed */
  value: unknown;
  /** True if parsing succeeded or string is empty, false if JSON was invalid */
  isValid: boolean;
}

/**
 * Parse a string value from an input field, attempting JSON parsing first.
 *
 * This is useful for fields that accept either JSON values or plain strings.
 * The function attempts to parse the string as JSON; if that fails, it returns
 * the raw string value.
 *
 * @param textValue - The string value from the input field
 * @returns Object containing the parsed value and validity flag
 *
 * @example
 * parseValueFromInput('42') // Returns: { value: 42, isValid: true }
 * parseValueFromInput('"hello"') // Returns: { value: 'hello', isValid: true }
 * parseValueFromInput('{ "key": "value" }') // Returns: { value: { key: 'value' }, isValid: true }
 * parseValueFromInput('plain text') // Returns: { value: 'plain text', isValid: true }
 * parseValueFromInput('{ invalid json') // Returns: { value: '{ invalid json', isValid: false }
 * parseValueFromInput('') // Returns: { value: undefined, isValid: true }
 */
export function parseValueFromInput(textValue: string): ParsedValueResult {
  const trimmed = textValue.trim();

  // Empty string means no value
  if (!trimmed) {
    return { value: undefined, isValid: true };
  }

  // Try to parse as JSON
  try {
    const parsed = JSON.parse(trimmed);
    return { value: parsed, isValid: true };
  } catch {
    // Not valid JSON - return as raw string
    // This allows users to type plain text or use variable syntax like {{workflow.var}}
    return { value: textValue, isValid: false };
  }
}

/**
 * Convert any value to a display string for textarea/input fields.
 *
 * Similar to getValueAsString but works directly on any value rather than
 * extracting from a config object.
 *
 * @param value - The value to convert to string
 * @returns The value as a string suitable for display
 *
 * @example
 * valueToDisplayString(42) // Returns: '42'
 * valueToDisplayString({ key: 'value' }) // Returns: '{\n  "key": "value"\n}'
 * valueToDisplayString(null) // Returns: ''
 */
export function valueToDisplayString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, JSON_INDENT_SIZE);
}

/**
 * Build a one-line summary of a step's configuration for display in step lists.
 */
export function getStepSummary(step: AutomationStep): string {
  const config = step.config ?? {};
  switch (step.type) {
    case 'call-automation':
      return typeof config.automationId === 'string' && config.automationId.trim()
        ? `Automation: ${config.automationId}`
        : 'Missing automation id';
    case 'run-script-exec':
      return typeof config.command === 'string' && config.command.trim()
        ? config.command
        : 'Missing command';
    case 'run-ai-prompt':
      return typeof config.prompt === 'string' && config.prompt.trim()
        ? config.prompt.slice(0, 60)
        : 'Missing prompt';
    case 'call-http-endpoint':
      return typeof config.url === 'string' && config.url.trim()
        ? `${config.method ?? 'GET'} ${config.url}`
        : 'Missing URL';
    case 'if':
      return typeof config.condition === 'string' && config.condition.trim()
        ? config.condition
        : 'Missing condition';
    case 'loop':
      return typeof config.count === 'number' ? `Count: ${config.count}` : 'Iterate items';
    default:
      return step.name?.trim() || step.type;
  }
}

/**
 * Build request headers for automation API calls.
 */
export function getAutomationRequestHeaders(isJson = true): Record<string, string> {
  const headers: Record<string, string> = {};
  const apiKey = getApiKey();
  const sessionToken = getSessionToken();

  if (apiKey) headers['X-API-Key'] = apiKey;
  if (sessionToken) headers['X-Session-Token'] = sessionToken;
  if (isJson) headers['Content-Type'] = 'application/json';

  return headers;
}

/**
 * Make an API request to the automation server with standard error handling.
 */
export async function automationApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getServerUrlSync()}${path}`, {
    credentials: 'include',
    ...init,
  });

  const payload = await response.json().catch(() => ({}) as Record<string, unknown>);
  if (!response.ok) {
    const message =
      typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}
