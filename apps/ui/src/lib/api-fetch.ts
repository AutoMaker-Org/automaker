/**
 * Authenticated fetch utility
 *
 * Provides a wrapper around fetch that automatically includes:
 * - X-API-Key header (for Electron mode)
 * - X-Session-Token header (for web mode with explicit token)
 * - credentials: 'include' (fallback for web mode session cookies)
 *
 * Use this instead of raw fetch() for all authenticated API calls.
 */

import { getApiKey, getSessionToken, getServerUrlSync } from './http-api-client';

// Server URL - uses shared cached URL from http-api-client
const getServerUrl = (): string => getServerUrlSync();
const DEFAULT_CACHE_MODE: RequestCache = 'no-store';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ApiFetchOptions extends Omit<RequestInit, 'method' | 'headers' | 'body'> {
  /** Additional headers to include (merged with auth headers) */
  headers?: Record<string, string>;
  /** Request body - will be JSON stringified if object */
  body?: unknown;
  /** Skip authentication headers (for public endpoints like /api/health) */
  skipAuth?: boolean;
}

/**
 * Build headers for an authenticated request
 */
export function getAuthHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...additionalHeaders,
  };

  // Electron mode: use API key
  const apiKey = getApiKey();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
    return headers;
  }

  // Web mode: use session token if available
  const sessionToken = getSessionToken();
  if (sessionToken) {
    headers['X-Session-Token'] = sessionToken;
  }

  return headers;
}

/**
 * Make an authenticated fetch request to the API
 *
 * @param endpoint - API endpoint (e.g., '/api/fs/browse')
 * @param method - HTTP method
 * @param options - Additional options
 * @returns Response from fetch
 *
 * @example
 * ```ts
 * // Simple GET
 * const response = await apiFetch('/api/terminal/status', 'GET');
 *
 * // POST with body
 * const response = await apiFetch('/api/fs/browse', 'POST', {
 *   body: { dirPath: '/home/user' }
 * });
 *
 * // With additional headers
 * const response = await apiFetch('/api/terminal/sessions', 'POST', {
 *   headers: { 'X-Terminal-Token': token },
 *   body: { cwd: '/home/user' }
 * });
 * ```
 */
export async function apiFetch(
  endpoint: string,
  method: HttpMethod = 'GET',
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { headers: additionalHeaders, body, skipAuth, cache, ...restOptions } = options;

  const headers = skipAuth
    ? { 'Content-Type': 'application/json', ...additionalHeaders }
    : getAuthHeaders(additionalHeaders);

  const fetchOptions: RequestInit = {
    method,
    headers,
    credentials: 'include',
    cache: cache ?? DEFAULT_CACHE_MODE,
    ...restOptions,
  };

  if (body !== undefined) {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${getServerUrl()}${endpoint}`;
  return fetch(url, fetchOptions);
}

/**
 * Make an authenticated GET request
 */
export async function apiGet<T>(
  endpoint: string,
  options: Omit<ApiFetchOptions, 'body'> = {}
): Promise<T> {
  const response = await apiFetch(endpoint, 'GET', options);
  return response.json();
}

/**
 * Make an authenticated POST request
 */
export async function apiPost<T>(
  endpoint: string,
  body?: unknown,
  options: ApiFetchOptions = {}
): Promise<T> {
  const response = await apiFetch(endpoint, 'POST', { ...options, body });
  return response.json();
}

/**
 * Make an authenticated PUT request
 */
export async function apiPut<T>(
  endpoint: string,
  body?: unknown,
  options: ApiFetchOptions = {}
): Promise<T> {
  const response = await apiFetch(endpoint, 'PUT', { ...options, body });
  return response.json();
}

/**
 * Make an authenticated DELETE request
 */
export async function apiDelete<T>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
  const response = await apiFetch(endpoint, 'DELETE', options);
  return response.json();
}

/**
 * Make an authenticated DELETE request (returns raw response for status checking)
 */
export async function apiDeleteRaw(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  return apiFetch(endpoint, 'DELETE', options);
}

/**
 * Build an authenticated image URL for use in <img> tags or CSS background-image
 * Adds authentication via query parameter since headers can't be set for image loads
 *
 * @param path - Image path
 * @param projectPath - Project path
 * @param version - Optional cache-busting version
 * @returns Full URL with auth credentials
 */
export function getAuthenticatedImageUrl(
  path: string,
  projectPath: string,
  version?: string | number
): string {
  const serverUrl = getServerUrl();
  const params = new URLSearchParams({
    path,
    projectPath,
  });

  if (version !== undefined) {
    params.set('v', String(version));
  }

  // Add auth credential as query param (needed for image loads that can't set headers)
  const apiKey = getApiKey();
  if (apiKey) {
    params.set('apiKey', apiKey);
  }
  // Note: Session token auth relies on cookies which are sent automatically by the browser

  return `${serverUrl}/api/fs/image?${params.toString()}`;
}
