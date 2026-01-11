/**
 * HTTP API Client for web mode
 *
 * This client provides the same API as the Electron IPC bridge,
 * but communicates with the backend server via HTTP/WebSocket.
 */

import { createLogger } from '@automaker/utils/logger';
import type {
  ElectronAPI,
  FileResult,
  WriteResult,
  ReaddirResult,
  StatResult,
  DialogResult,
  SaveImageResult,
  AutoModeAPI,
  FeaturesAPI,
  SuggestionsAPI,
  SpecRegenerationAPI,
  AutoModeEvent,
  SuggestionsEvent,
  SpecRegenerationEvent,
  SuggestionType,
  GitHubAPI,
  IssueValidationInput,
  IssueValidationEvent,
  IdeationAPI,
  IdeaCategory,
  AnalysisSuggestion,
  StartSessionOptions,
  CreateIdeaInput,
  UpdateIdeaInput,
  ConvertToFeatureOptions,
} from './electron';
import type { Message, SessionListItem } from '@/types/electron';
import type { Feature, ClaudeUsageResponse, CodexUsageResponse } from '@/store/app-store';
import type { WorktreeAPI, GitAPI, ModelDefinition, ProviderStatus } from '@/types/electron';
import { getGlobalFileBrowser } from '@/contexts/file-browser-context';

const logger = createLogger('HttpClient');
const NO_STORE_CACHE_MODE: RequestCache = 'no-store';

// Cached server URL (set during initialization in Electron mode)
let cachedServerUrl: string | null = null;

/**
 * Notify the UI that the current session is no longer valid.
 * Used to redirect the user to a logged-out route on 401/403 responses.
 */
const notifyLoggedOut = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('automaker:logged-out'));
  } catch {
    // Ignore - navigation will still be handled by failed requests in most cases
  }
};

/**
 * Handle an unauthorized response in cookie/session auth flows.
 * Clears in-memory token and attempts to clear the cookie (best-effort),
 * then notifies the UI to redirect.
 */
const handleUnauthorized = (): void => {
  clearSessionToken();
  // Best-effort cookie clear (avoid throwing)
  fetch(`${getServerUrl()}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: '{}',
    cache: NO_STORE_CACHE_MODE,
  }).catch(() => {});
  notifyLoggedOut();
};

/**
 * Notify the UI that the server is offline/unreachable.
 * Used to redirect the user to the login page which will show server unavailable.
 */
const notifyServerOffline = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('automaker:server-offline'));
  } catch {
    // Ignore
  }
};

/**
 * Check if an error is a connection error (server offline/unreachable).
 * These are typically TypeError with 'Failed to fetch' or similar network errors.
 */
export const isConnectionError = (error: unknown): boolean => {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    return (
      message.includes('failed to fetch') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('connection refused')
    );
  }
  // Check for error objects with message property
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message).toLowerCase();
    return (
      message.includes('failed to fetch') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('connection refused')
    );
  }
  return false;
};

/**
 * Handle a server offline error by notifying the UI to redirect.
 * Call this when a connection error is detected.
 */
export const handleServerOffline = (): void => {
  logger.error('Server appears to be offline, redirecting to login...');
  notifyServerOffline();
};

/**
 * Initialize server URL from Electron IPC.
 * Must be called early in Electron mode before making API requests.
 */
export const initServerUrl = async (): Promise<void> => {
  // window.electronAPI is typed as ElectronAPI, but some Electron-only helpers
  // (like getServerUrl) are not part of the shared interface. Narrow via `any`.
  const electron = typeof window !== 'undefined' ? (window.electronAPI as any) : null;
  if (electron?.getServerUrl) {
    try {
      cachedServerUrl = await electron.getServerUrl();
      logger.info('Server URL from Electron:', cachedServerUrl);
    } catch (error) {
      logger.warn('Failed to get server URL from Electron:', error);
    }
  }
};

// Server URL - uses cached value from IPC or environment variable
const getServerUrl = (): string => {
  // Use cached URL from Electron IPC if available
  if (cachedServerUrl) {
    return cachedServerUrl;
  }

  if (typeof window !== 'undefined') {
    const envUrl = import.meta.env.VITE_SERVER_URL;
    if (envUrl) return envUrl;
  }
  return 'http://localhost:3008';
};

/**
 * Get the server URL (exported for use in other modules)
 */
export const getServerUrlSync = (): string => getServerUrl();

// Cached API key for authentication (Electron mode only)
let cachedApiKey: string | null = null;
let apiKeyInitialized = false;
let apiKeyInitPromise: Promise<void> | null = null;

// Cached session token for authentication (Web mode - explicit header auth)
// Only used in-memory after fresh login; on refresh we rely on HTTP-only cookies
let cachedSessionToken: string | null = null;

// Get API key for Electron mode (returns cached value after initialization)
// Exported for use in WebSocket connections that need auth
export const getApiKey = (): string | null => cachedApiKey;

/**
 * Wait for API key initialization to complete.
 * Returns immediately if already initialized.
 */
export const waitForApiKeyInit = (): Promise<void> => {
  if (apiKeyInitialized) return Promise.resolve();
  if (apiKeyInitPromise) return apiKeyInitPromise;
  // If not started yet, start it now
  return initApiKey();
};

// Get session token for Web mode (returns cached value after login)
export const getSessionToken = (): string | null => cachedSessionToken;

// Set session token (called after login)
export const setSessionToken = (token: string | null): void => {
  cachedSessionToken = token;
};

// Clear session token (called on logout)
export const clearSessionToken = (): void => {
  cachedSessionToken = null;
};

/**
 * Check if we're running in Electron mode
 */
export const isElectronMode = (): boolean => {
  if (typeof window === 'undefined') return false;

  // Prefer a stable runtime marker from preload.
  // In some dev/electron setups, method availability can be temporarily undefined
  // during early startup, but `isElectron` remains reliable.
  const api = window.electronAPI as any;
  return api?.isElectron === true || !!api?.getApiKey;
};

// Cached external server mode flag
let cachedExternalServerMode: boolean | null = null;

/**
 * Check if running in external server mode (Docker API)
 * In this mode, Electron uses session-based auth like web mode
 */
export const checkExternalServerMode = async (): Promise<boolean> => {
  if (cachedExternalServerMode !== null) {
    return cachedExternalServerMode;
  }

  if (typeof window !== 'undefined') {
    const api = window.electronAPI as any;
    if (api?.isExternalServerMode) {
      try {
        cachedExternalServerMode = Boolean(await api.isExternalServerMode());
        return cachedExternalServerMode;
      } catch (error) {
        logger.warn('Failed to check external server mode:', error);
      }
    }
  }

  cachedExternalServerMode = false;
  return false;
};

/**
 * Get cached external server mode (synchronous, returns null if not yet checked)
 */
export const isExternalServerMode = (): boolean | null => cachedExternalServerMode;

/**
 * Initialize API key and server URL for Electron mode authentication.
 * In web mode, authentication uses HTTP-only cookies instead.
 *
 * This should be called early in app initialization.
 */
export const initApiKey = async (): Promise<void> => {
  // Return existing promise if already in progress
  if (apiKeyInitPromise) return apiKeyInitPromise;

  // Return immediately if already initialized
  if (apiKeyInitialized) return;

  // Create and store the promise so concurrent calls wait for the same initialization
  apiKeyInitPromise = (async () => {
    try {
      // Initialize server URL from Electron IPC first (needed for API requests)
      await initServerUrl();

      // Only Electron mode uses API key header auth
      if (typeof window !== 'undefined' && window.electronAPI?.getApiKey) {
        try {
          cachedApiKey = await window.electronAPI.getApiKey();
          if (cachedApiKey) {
            logger.info('Using API key from Electron');
            return;
          }
        } catch (error) {
          logger.warn('Failed to get API key from Electron:', error);
        }
      }

      // In web mode, authentication is handled via HTTP-only cookies
      logger.info('Web mode - using cookie-based authentication');
    } finally {
      // Mark as initialized after completion, regardless of success or failure
      apiKeyInitialized = true;
    }
  })();

  return apiKeyInitPromise;
};

/**
 * Check authentication status with the server
 */
export const checkAuthStatus = async (): Promise<{
  authenticated: boolean;
  required: boolean;
}> => {
  try {
    const response = await fetch(`${getServerUrl()}/api/auth/status`, {
      credentials: 'include',
      headers: getApiKey() ? { 'X-API-Key': getApiKey()! } : undefined,
      cache: NO_STORE_CACHE_MODE,
    });
    const data = await response.json();
    return {
      authenticated: data.authenticated ?? false,
      required: data.required ?? true,
    };
  } catch (error) {
    logger.error('Failed to check auth status:', error);
    return { authenticated: false, required: true };
  }
};

/**
 * Login with API key (for web mode)
 * After login succeeds, verifies the session is actually working by making
 * a request to an authenticated endpoint.
 */
export const login = async (
  apiKey: string
): Promise<{ success: boolean; error?: string; token?: string }> => {
  try {
    const response = await fetch(`${getServerUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ apiKey }),
      cache: NO_STORE_CACHE_MODE,
    });
    const data = await response.json();

    // Store the session token if login succeeded
    if (data.success && data.token) {
      setSessionToken(data.token);
      logger.info('Session token stored after login');

      // Verify the session is actually working by making a request to an authenticated endpoint
      const verified = await verifySession();
      if (!verified) {
        logger.error('Login appeared successful but session verification failed');
        return {
          success: false,
          error: 'Session verification failed. Please try again.',
        };
      }
      logger.info('Login verified successfully');
    }

    return data;
  } catch (error) {
    logger.error('Login failed:', error);
    return { success: false, error: 'Network error' };
  }
};

/**
 * Check if the session cookie is still valid by making a request to an authenticated endpoint.
 * Note: This does NOT retrieve the session token - on page refresh we rely on cookies alone.
 * The session token is only available after a fresh login.
 */
export const fetchSessionToken = async (): Promise<boolean> => {
  // On page refresh, we can't retrieve the session token (it's stored in HTTP-only cookie).
  // We just verify the cookie is valid by checking auth status.
  // The session token is only stored in memory after a fresh login.
  try {
    const response = await fetch(`${getServerUrl()}/api/auth/status`, {
      credentials: 'include', // Send the session cookie
      cache: NO_STORE_CACHE_MODE,
    });

    if (!response.ok) {
      logger.info('Failed to check auth status');
      return false;
    }

    const data = await response.json();
    if (data.success && data.authenticated) {
      logger.info('Session cookie is valid');
      return true;
    }

    logger.info('Session cookie is not authenticated');
    return false;
  } catch (error) {
    logger.error('Failed to check session:', error);
    return false;
  }
};

/**
 * Logout (for web mode)
 */
export const logout = async (): Promise<{ success: boolean }> => {
  try {
    const response = await fetch(`${getServerUrl()}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      cache: NO_STORE_CACHE_MODE,
    });

    // Clear the cached session token
    clearSessionToken();
    logger.info('Session token cleared on logout');

    return await response.json();
  } catch (error) {
    logger.error('Logout failed:', error);
    return { success: false };
  }
};

/**
 * Verify that the current session is still valid by making a request to an authenticated endpoint.
 * If the session has expired or is invalid, clears the session and returns false.
 * This should be called:
 * 1. After login to verify the cookie was set correctly
 * 2. On app load to verify the session hasn't expired
 *
 * Returns:
 * - true: Session is valid
 * - false: Session is definitively invalid (401/403 auth failure)
 * - throws: Network error or server not ready (caller should retry)
 */
export const verifySession = async (): Promise<boolean> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Electron mode: use API key header
  const apiKey = getApiKey();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  // Add session token header if available (web mode)
  const sessionToken = getSessionToken();
  if (sessionToken) {
    headers['X-Session-Token'] = sessionToken;
  }

  // Make a request to an authenticated endpoint to verify the session
  // We use /api/settings/status as it requires authentication and is lightweight
  // Note: fetch throws on network errors, which we intentionally let propagate
  const response = await fetch(`${getServerUrl()}/api/settings/status`, {
    headers,
    credentials: 'include',
    cache: NO_STORE_CACHE_MODE,
    // Avoid hanging indefinitely during backend reloads or network issues
    signal: AbortSignal.timeout(2500),
  });

  // Check for authentication errors - these are definitive "invalid session" responses
  if (response.status === 401 || response.status === 403) {
    logger.warn('Session verification failed - session expired or invalid');
    // Clear the in-memory/localStorage session token since it's no longer valid
    // Note: We do NOT call logout here - that would destroy a potentially valid
    // cookie if the issue was transient (e.g., token not sent due to timing)
    clearSessionToken();
    return false;
  }

  // For other non-ok responses (5xx, etc.), throw to trigger retry
  if (!response.ok) {
    const error = new Error(`Session verification failed with status: ${response.status}`);
    logger.warn('Session verification failed with status:', response.status);
    throw error;
  }

  logger.info('Session verified successfully');
  return true;
};

/**
 * Check if the server is running in a containerized (sandbox) environment.
 * This endpoint is unauthenticated so it can be checked before login.
 */
export const checkSandboxEnvironment = async (): Promise<{
  isContainerized: boolean;
  error?: string;
}> => {
  try {
    const response = await fetch(`${getServerUrl()}/api/health/environment`, {
      method: 'GET',
      cache: NO_STORE_CACHE_MODE,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn('Failed to check sandbox environment');
      return { isContainerized: false, error: 'Failed to check environment' };
    }

    const data = await response.json();
    return { isContainerized: data.isContainerized ?? false };
  } catch (error) {
    logger.error('Sandbox environment check failed:', error);
    return { isContainerized: false, error: 'Network error' };
  }
};

type EventType =
  | 'agent:stream'
  | 'auto-mode:event'
  | 'suggestions:event'
  | 'spec-regeneration:event'
  | 'issue-validation:event'
  | 'backlog-plan:event'
  | 'ideation:stream'
  | 'ideation:analysis'
  | 'worktree:init-started'
  | 'worktree:init-output'
  | 'worktree:init-completed';

type EventCallback = (payload: unknown) => void;

interface EnhancePromptResult {
  success: boolean;
  enhancedText?: string;
  error?: string;
}

/**
 * HTTP API Client that implements ElectronAPI interface
 */
export class HttpApiClient implements ElectronAPI {
  private serverUrl: string;
  private ws: WebSocket | null = null;
  private eventCallbacks: Map<EventType, Set<EventCallback>> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;

  constructor() {
    this.serverUrl = getServerUrl();
    // Electron mode: connect WebSocket immediately once API key is ready.
    // Web mode: defer WebSocket connection until a consumer subscribes to events,
    // to avoid noisy 401s on first-load/login/setup routes.
    if (isElectronMode()) {
      waitForApiKeyInit()
        .then(() => {
          this.connectWebSocket();
        })
        .catch((error) => {
          logger.error('API key initialization failed:', error);
          // Still attempt WebSocket connection - it may work with cookie auth
          this.connectWebSocket();
        });
    }
  }

  /**
   * Fetch a short-lived WebSocket token from the server
   * Used for secure WebSocket authentication without exposing session tokens in URLs
   */
  private async fetchWsToken(): Promise<string | null> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add session token header if available
      const sessionToken = getSessionToken();
      if (sessionToken) {
        headers['X-Session-Token'] = sessionToken;
      }

      const response = await fetch(`${this.serverUrl}/api/auth/token`, {
        headers,
        credentials: 'include',
        cache: NO_STORE_CACHE_MODE,
      });

      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return null;
      }

      if (!response.ok) {
        logger.warn('Failed to fetch wsToken:', response.status);
        return null;
      }

      const data = await response.json();
      if (data.success && data.token) {
        return data.token;
      }

      return null;
    } catch (error) {
      logger.error('Error fetching wsToken:', error);
      return null;
    }
  }

  private connectWebSocket(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;

    // Wait for API key initialization to complete before attempting connection
    // This prevents race conditions during app startup
    waitForApiKeyInit()
      .then(() => this.doConnectWebSocketInternal())
      .catch((error) => {
        logger.error('Failed to initialize for WebSocket connection:', error);
        this.isConnecting = false;
      });
  }

  private doConnectWebSocketInternal(): void {
    // Electron mode typically authenticates with the injected API key.
    // However, in external-server/cookie-auth flows, the API key may be unavailable.
    // In that case, fall back to the same wsToken/cookie authentication used in web mode
    // so the UI still receives real-time events (running tasks, logs, etc.).
    if (isElectronMode()) {
      const apiKey = getApiKey();
      if (!apiKey) {
        logger.warn('Electron mode: API key missing, attempting wsToken/cookie auth for WebSocket');
        this.fetchWsToken()
          .then((wsToken) => {
            const wsUrl = this.serverUrl.replace(/^http/, 'ws') + '/api/events';
            if (wsToken) {
              this.establishWebSocket(`${wsUrl}?wsToken=${encodeURIComponent(wsToken)}`);
            } else {
              // Fallback: try connecting without token (will fail if not authenticated)
              logger.warn('No wsToken available, attempting WebSocket connection anyway');
              this.establishWebSocket(wsUrl);
            }
          })
          .catch((error) => {
            logger.error('Failed to prepare WebSocket connection (electron fallback):', error);
            this.isConnecting = false;
          });
        return;
      }

      const wsUrl = this.serverUrl.replace(/^http/, 'ws') + '/api/events';
      this.establishWebSocket(`${wsUrl}?apiKey=${encodeURIComponent(apiKey)}`);
      return;
    }

    // In web mode, fetch a short-lived wsToken first
    this.fetchWsToken()
      .then((wsToken) => {
        const wsUrl = this.serverUrl.replace(/^http/, 'ws') + '/api/events';
        if (wsToken) {
          this.establishWebSocket(`${wsUrl}?wsToken=${encodeURIComponent(wsToken)}`);
        } else {
          // Fallback: try connecting without token (will fail if not authenticated)
          logger.warn('No wsToken available, attempting connection anyway');
          this.establishWebSocket(wsUrl);
        }
      })
      .catch((error) => {
        logger.error('Failed to prepare WebSocket connection:', error);
        this.isConnecting = false;
      });
  }

  /**
   * Establish the actual WebSocket connection
   */
  private establishWebSocket(wsUrl: string): void {
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        logger.info('WebSocket connected');
        this.isConnecting = false;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          logger.info(
            'WebSocket message:',
            data.type,
            'hasPayload:',
            !!data.payload,
            'callbacksRegistered:',
            this.eventCallbacks.has(data.type)
          );
          const callbacks = this.eventCallbacks.get(data.type);
          if (callbacks) {
            logger.info('Dispatching to', callbacks.size, 'callbacks');
            callbacks.forEach((cb) => cb(data.payload));
          }
        } catch (error) {
          logger.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        logger.info('WebSocket disconnected');
        this.isConnecting = false;
        this.ws = null;
        // Attempt to reconnect after 5 seconds
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectWebSocket();
          }, 5000);
        }
      };

      this.ws.onerror = (error) => {
        logger.error('WebSocket error:', error);
        this.isConnecting = false;
      };
    } catch (error) {
      logger.error('Failed to create WebSocket:', error);
      this.isConnecting = false;
    }
  }

  private subscribeToEvent(type: EventType, callback: EventCallback): () => void {
    if (!this.eventCallbacks.has(type)) {
      this.eventCallbacks.set(type, new Set());
    }
    this.eventCallbacks.get(type)!.add(callback);

    // Ensure WebSocket is connected
    this.connectWebSocket();

    return () => {
      const callbacks = this.eventCallbacks.get(type);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
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

  private async post<T>(endpoint: string, body?: unknown): Promise<T> {
    // Ensure API key is initialized before making request
    await waitForApiKeyInit();
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      credentials: 'include', // Include cookies for session auth
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401 || response.status === 403) {
      handleUnauthorized();
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // If parsing JSON fails, use status text
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  private async get<T>(endpoint: string): Promise<T> {
    // Ensure API key is initialized before making request
    await waitForApiKeyInit();
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      headers: this.getHeaders(),
      credentials: 'include', // Include cookies for session auth
      cache: NO_STORE_CACHE_MODE,
    });

    if (response.status === 401 || response.status === 403) {
      handleUnauthorized();
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // If parsing JSON fails, use status text
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  private async put<T>(endpoint: string, body?: unknown): Promise<T> {
    // Ensure API key is initialized before making request
    await waitForApiKeyInit();
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      credentials: 'include', // Include cookies for session auth
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401 || response.status === 403) {
      handleUnauthorized();
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // If parsing JSON fails, use status text
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  private async httpDelete<T>(endpoint: string, body?: unknown): Promise<T> {
    // Ensure API key is initialized before making request
    await waitForApiKeyInit();
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      credentials: 'include', // Include cookies for session auth
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401 || response.status === 403) {
      handleUnauthorized();
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // If parsing JSON fails, use status text
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Basic operations
  async ping(): Promise<string> {
    const result = await this.get<{ status: string }>('/api/health');
    return result.status === 'ok' ? 'pong' : 'error';
  }

  async openExternalLink(url: string): Promise<{ success: boolean; error?: string }> {
    // Open in new tab
    window.open(url, '_blank', 'noopener,noreferrer');
    return { success: true };
  }

  async openInEditor(
    filePath: string,
    line?: number,
    column?: number
  ): Promise<{ success: boolean; error?: string }> {
    // Build VS Code URL scheme: vscode://file/path:line:column
    // This works on systems where VS Code's URL handler is registered
    // URL encode the path to handle special characters (spaces, brackets, etc.)
    // Handle both Unix (/) and Windows (\) path separators
    const normalizedPath = filePath.replace(/\\/g, '/');
    const encodedPath = normalizedPath.startsWith('/')
      ? '/' + normalizedPath.slice(1).split('/').map(encodeURIComponent).join('/')
      : normalizedPath.split('/').map(encodeURIComponent).join('/');
    let url = `vscode://file${encodedPath}`;
    if (line !== undefined && line > 0) {
      url += `:${line}`;
      if (column !== undefined && column > 0) {
        url += `:${column}`;
      }
    }

    try {
      // Use anchor click approach which is most reliable for custom URL schemes
      // This triggers the browser's URL handler without navigation issues
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open in editor',
      };
    }
  }

  // File picker - uses server-side file browser dialog
  async openDirectory(): Promise<DialogResult> {
    const fileBrowser = getGlobalFileBrowser();

    if (!fileBrowser) {
      logger.error('File browser not initialized');
      return { canceled: true, filePaths: [] };
    }

    const path = await fileBrowser();

    if (!path) {
      return { canceled: true, filePaths: [] };
    }

    // Validate with server
    const result = await this.post<{
      success: boolean;
      path?: string;
      isAllowed?: boolean;
      error?: string;
    }>('/api/fs/validate-path', { filePath: path });

    if (result.success && result.path && result.isAllowed !== false) {
      return { canceled: false, filePaths: [result.path] };
    }

    logger.error('Invalid directory:', result.error || 'Path not allowed');
    return { canceled: true, filePaths: [] };
  }

  async openFile(_options?: object): Promise<DialogResult> {
    const fileBrowser = getGlobalFileBrowser();

    if (!fileBrowser) {
      logger.error('File browser not initialized');
      return { canceled: true, filePaths: [] };
    }

    // For now, use the same directory browser (could be enhanced for file selection)
    const path = await fileBrowser();

    if (!path) {
      return { canceled: true, filePaths: [] };
    }

    const result = await this.post<{ success: boolean; exists: boolean }>('/api/fs/exists', {
      filePath: path,
    });

    if (result.success && result.exists) {
      return { canceled: false, filePaths: [path] };
    }

    logger.error('File not found');
    return { canceled: true, filePaths: [] };
  }

  // File system operations
  async readFile(filePath: string): Promise<FileResult> {
    return this.post('/api/fs/read', { filePath });
  }

  async writeFile(filePath: string, content: string): Promise<WriteResult> {
    return this.post('/api/fs/write', { filePath, content });
  }

  async mkdir(dirPath: string): Promise<WriteResult> {
    return this.post('/api/fs/mkdir', { dirPath });
  }

  async readdir(dirPath: string): Promise<ReaddirResult> {
    return this.post('/api/fs/readdir', { dirPath });
  }

  async exists(filePath: string): Promise<boolean> {
    const result = await this.post<{ success: boolean; exists: boolean }>('/api/fs/exists', {
      filePath,
    });
    return result.exists;
  }

  async stat(filePath: string): Promise<StatResult> {
    return this.post('/api/fs/stat', { filePath });
  }

  async deleteFile(filePath: string): Promise<WriteResult> {
    return this.post('/api/fs/delete', { filePath });
  }

  async trashItem(filePath: string): Promise<WriteResult> {
    // In web mode, trash is just delete
    return this.deleteFile(filePath);
  }

  async getPath(name: string): Promise<string> {
    // Server provides data directory
    if (name === 'userData') {
      const result = await this.get<{ dataDir: string }>('/api/health/detailed');
      return result.dataDir || '/data';
    }
    return `/data/${name}`;
  }

  async saveImageToTemp(
    data: string,
    filename: string,
    mimeType: string,
    projectPath?: string
  ): Promise<SaveImageResult> {
    return this.post('/api/fs/save-image', {
      data,
      filename,
      mimeType,
      projectPath,
    });
  }

  async saveBoardBackground(
    data: string,
    filename: string,
    mimeType: string,
    projectPath: string
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    return this.post('/api/fs/save-board-background', {
      data,
      filename,
      mimeType,
      projectPath,
    });
  }

  async deleteBoardBackground(projectPath: string): Promise<{ success: boolean; error?: string }> {
    return this.post('/api/fs/delete-board-background', { projectPath });
  }

  // CLI checks - server-side
  async checkClaudeCli(): Promise<{
    success: boolean;
    status?: string;
    method?: string;
    version?: string;
    path?: string;
    recommendation?: string;
    installCommands?: {
      macos?: string;
      windows?: string;
      linux?: string;
      npm?: string;
    };
    error?: string;
  }> {
    return this.get('/api/setup/claude-status');
  }

  // Model API
  model = {
    getAvailable: async (): Promise<{
      success: boolean;
      models?: ModelDefinition[];
      error?: string;
    }> => {
      return this.get('/api/models/available');
    },
    checkProviders: async (): Promise<{
      success: boolean;
      providers?: Record<string, ProviderStatus>;
      error?: string;
    }> => {
      return this.get('/api/models/providers');
    },
  };

  // Setup API
  setup = {
    getClaudeStatus: (): Promise<{
      success: boolean;
      status?: string;
      installed?: boolean;
      method?: string;
      version?: string;
      path?: string;
      auth?: {
        authenticated: boolean;
        method: string;
        hasCredentialsFile?: boolean;
        hasToken?: boolean;
        hasStoredOAuthToken?: boolean;
        hasStoredApiKey?: boolean;
        hasEnvApiKey?: boolean;
        hasEnvOAuthToken?: boolean;
        hasCliAuth?: boolean;
        hasRecentActivity?: boolean;
      };
      error?: string;
    }> => this.get('/api/setup/claude-status'),

    installClaude: (): Promise<{
      success: boolean;
      message?: string;
      error?: string;
    }> => this.post('/api/setup/install-claude'),

    authClaude: (): Promise<{
      success: boolean;
      token?: string;
      requiresManualAuth?: boolean;
      terminalOpened?: boolean;
      command?: string;
      error?: string;
      message?: string;
      output?: string;
    }> => this.post('/api/setup/auth-claude'),

    deauthClaude: (): Promise<{
      success: boolean;
      requiresManualDeauth?: boolean;
      command?: string;
      message?: string;
      error?: string;
    }> => this.post('/api/setup/deauth-claude'),

    storeApiKey: (
      provider: string,
      apiKey: string
    ): Promise<{
      success: boolean;
      error?: string;
    }> => this.post('/api/setup/store-api-key', { provider, apiKey }),

    deleteApiKey: (
      provider: string
    ): Promise<{
      success: boolean;
      error?: string;
      message?: string;
    }> => this.post('/api/setup/delete-api-key', { provider }),

    getApiKeys: (): Promise<{
      success: boolean;
      hasAnthropicKey: boolean;
      hasGoogleKey: boolean;
    }> => this.get('/api/setup/api-keys'),

    getPlatform: (): Promise<{
      success: boolean;
      platform: string;
      arch: string;
      homeDir: string;
      isWindows: boolean;
      isMac: boolean;
      isLinux: boolean;
    }> => this.get('/api/setup/platform'),

    verifyClaudeAuth: (
      authMethod?: 'cli' | 'api_key',
      apiKey?: string
    ): Promise<{
      success: boolean;
      authenticated: boolean;
      error?: string;
    }> => this.post('/api/setup/verify-claude-auth', { authMethod, apiKey }),

    getGhStatus: (): Promise<{
      success: boolean;
      installed: boolean;
      authenticated: boolean;
      version: string | null;
      path: string | null;
      user: string | null;
      error?: string;
    }> => this.get('/api/setup/gh-status'),

    // Cursor CLI methods
    getCursorStatus: (): Promise<{
      success: boolean;
      installed?: boolean;
      version?: string | null;
      path?: string | null;
      auth?: {
        authenticated: boolean;
        method: string;
      };
      installCommand?: string;
      loginCommand?: string;
      error?: string;
    }> => this.get('/api/setup/cursor-status'),

    authCursor: (): Promise<{
      success: boolean;
      token?: string;
      requiresManualAuth?: boolean;
      terminalOpened?: boolean;
      command?: string;
      message?: string;
      output?: string;
    }> => this.post('/api/setup/auth-cursor'),

    deauthCursor: (): Promise<{
      success: boolean;
      requiresManualDeauth?: boolean;
      command?: string;
      message?: string;
      error?: string;
    }> => this.post('/api/setup/deauth-cursor'),

    authOpencode: (): Promise<{
      success: boolean;
      token?: string;
      requiresManualAuth?: boolean;
      terminalOpened?: boolean;
      command?: string;
      message?: string;
      output?: string;
    }> => this.post('/api/setup/auth-opencode'),

    deauthOpencode: (): Promise<{
      success: boolean;
      requiresManualDeauth?: boolean;
      command?: string;
      message?: string;
      error?: string;
    }> => this.post('/api/setup/deauth-opencode'),

    getCursorConfig: (
      projectPath: string
    ): Promise<{
      success: boolean;
      config?: {
        defaultModel?: string;
        models?: string[];
        mcpServers?: string[];
        rules?: string[];
      };
      availableModels?: Array<{
        id: string;
        label: string;
        description: string;
        hasThinking: boolean;
        tier: 'free' | 'pro';
      }>;
      error?: string;
    }> => this.get(`/api/setup/cursor-config?projectPath=${encodeURIComponent(projectPath)}`),

    setCursorDefaultModel: (
      projectPath: string,
      model: string
    ): Promise<{
      success: boolean;
      model?: string;
      error?: string;
    }> => this.post('/api/setup/cursor-config/default-model', { projectPath, model }),

    setCursorModels: (
      projectPath: string,
      models: string[]
    ): Promise<{
      success: boolean;
      models?: string[];
      error?: string;
    }> => this.post('/api/setup/cursor-config/models', { projectPath, models }),

    // Cursor CLI Permissions
    getCursorPermissions: (
      projectPath?: string
    ): Promise<{
      success: boolean;
      globalPermissions?: { allow: string[]; deny: string[] } | null;
      projectPermissions?: { allow: string[]; deny: string[] } | null;
      effectivePermissions?: { allow: string[]; deny: string[] } | null;
      activeProfile?: 'strict' | 'development' | 'custom' | null;
      hasProjectConfig?: boolean;
      availableProfiles?: Array<{
        id: string;
        name: string;
        description: string;
        permissions: { allow: string[]; deny: string[] };
      }>;
      error?: string;
    }> =>
      this.get(
        `/api/setup/cursor-permissions${projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : ''}`
      ),

    applyCursorPermissionProfile: (
      profileId: 'strict' | 'development',
      scope: 'global' | 'project',
      projectPath?: string
    ): Promise<{
      success: boolean;
      message?: string;
      scope?: string;
      profileId?: string;
      error?: string;
    }> => this.post('/api/setup/cursor-permissions/profile', { profileId, scope, projectPath }),

    setCursorCustomPermissions: (
      projectPath: string,
      permissions: { allow: string[]; deny: string[] }
    ): Promise<{
      success: boolean;
      message?: string;
      permissions?: { allow: string[]; deny: string[] };
      error?: string;
    }> => this.post('/api/setup/cursor-permissions/custom', { projectPath, permissions }),

    deleteCursorProjectPermissions: (
      projectPath: string
    ): Promise<{
      success: boolean;
      message?: string;
      error?: string;
    }> =>
      this.httpDelete(
        `/api/setup/cursor-permissions?projectPath=${encodeURIComponent(projectPath)}`
      ),

    getCursorExampleConfig: (
      profileId?: 'strict' | 'development'
    ): Promise<{
      success: boolean;
      profileId?: string;
      config?: string;
      error?: string;
    }> =>
      this.get(
        `/api/setup/cursor-permissions/example${profileId ? `?profileId=${profileId}` : ''}`
      ),

    // Codex CLI methods
    getCodexStatus: (): Promise<{
      success: boolean;
      status?: string;
      installed?: boolean;
      method?: string;
      version?: string;
      path?: string;
      auth?: {
        authenticated: boolean;
        method: string;
        hasAuthFile?: boolean;
        hasOAuthToken?: boolean;
        hasApiKey?: boolean;
        hasStoredApiKey?: boolean;
        hasEnvApiKey?: boolean;
      };
      error?: string;
    }> => this.get('/api/setup/codex-status'),

    installCodex: (): Promise<{
      success: boolean;
      message?: string;
      error?: string;
    }> => this.post('/api/setup/install-codex'),

    authCodex: (): Promise<{
      success: boolean;
      token?: string;
      requiresManualAuth?: boolean;
      terminalOpened?: boolean;
      command?: string;
      error?: string;
      message?: string;
      output?: string;
    }> => this.post('/api/setup/auth-codex'),

    deauthCodex: (): Promise<{
      success: boolean;
      requiresManualDeauth?: boolean;
      command?: string;
      message?: string;
      error?: string;
    }> => this.post('/api/setup/deauth-codex'),

    verifyCodexAuth: (
      authMethod: 'cli' | 'api_key',
      apiKey?: string
    ): Promise<{
      success: boolean;
      authenticated: boolean;
      error?: string;
    }> => this.post('/api/setup/verify-codex-auth', { authMethod, apiKey }),

    // OpenCode CLI methods
    getOpencodeStatus: (): Promise<{
      success: boolean;
      status?: string;
      installed?: boolean;
      method?: string;
      version?: string;
      path?: string;
      recommendation?: string;
      installCommands?: {
        macos?: string;
        linux?: string;
        npm?: string;
      };
      auth?: {
        authenticated: boolean;
        method: string;
        hasAuthFile?: boolean;
        hasOAuthToken?: boolean;
        hasApiKey?: boolean;
        hasStoredApiKey?: boolean;
        hasEnvApiKey?: boolean;
      };
      error?: string;
    }> => this.get('/api/setup/opencode-status'),

    onInstallProgress: (callback: (progress: unknown) => void) => {
      return this.subscribeToEvent('agent:stream', callback);
    },

    onAuthProgress: (callback: (progress: unknown) => void) => {
      return this.subscribeToEvent('agent:stream', callback);
    },
  };

  // Features API
  features: FeaturesAPI & {
    bulkUpdate: (
      projectPath: string,
      featureIds: string[],
      updates: Partial<Feature>
    ) => Promise<{
      success: boolean;
      updatedCount?: number;
      failedCount?: number;
      results?: Array<{ featureId: string; success: boolean; error?: string }>;
      features?: Feature[];
      error?: string;
    }>;
    bulkDelete: (
      projectPath: string,
      featureIds: string[]
    ) => Promise<{
      success: boolean;
      deletedCount?: number;
      failedCount?: number;
      results?: Array<{ featureId: string; success: boolean; error?: string }>;
      error?: string;
    }>;
  } = {
    getAll: (projectPath: string) => this.post('/api/features/list', { projectPath }),
    get: (projectPath: string, featureId: string) =>
      this.post('/api/features/get', { projectPath, featureId }),
    create: (projectPath: string, feature: Feature) =>
      this.post('/api/features/create', { projectPath, feature }),
    update: (
      projectPath: string,
      featureId: string,
      updates: Partial<Feature>,
      descriptionHistorySource?: 'enhance' | 'edit',
      enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer',
      preEnhancementDescription?: string
    ) =>
      this.post('/api/features/update', {
        projectPath,
        featureId,
        updates,
        descriptionHistorySource,
        enhancementMode,
        preEnhancementDescription,
      }),
    delete: (projectPath: string, featureId: string) =>
      this.post('/api/features/delete', { projectPath, featureId }),
    getAgentOutput: (projectPath: string, featureId: string) =>
      this.post('/api/features/agent-output', { projectPath, featureId }),
    generateTitle: (description: string) =>
      this.post('/api/features/generate-title', { description }),
    bulkUpdate: (projectPath: string, featureIds: string[], updates: Partial<Feature>) =>
      this.post('/api/features/bulk-update', { projectPath, featureIds, updates }),
    bulkDelete: (projectPath: string, featureIds: string[]) =>
      this.post('/api/features/bulk-delete', { projectPath, featureIds }),
  };

  // Auto Mode API
  autoMode: AutoModeAPI = {
    start: (projectPath: string, maxConcurrency?: number) =>
      this.post('/api/auto-mode/start', { projectPath, maxConcurrency }),
    stop: (projectPath: string) => this.post('/api/auto-mode/stop', { projectPath }),
    stopFeature: (featureId: string) => this.post('/api/auto-mode/stop-feature', { featureId }),
    status: (projectPath?: string) => this.post('/api/auto-mode/status', { projectPath }),
    runFeature: (
      projectPath: string,
      featureId: string,
      useWorktrees?: boolean,
      worktreePath?: string
    ) =>
      this.post('/api/auto-mode/run-feature', {
        projectPath,
        featureId,
        useWorktrees,
        worktreePath,
      }),
    verifyFeature: (projectPath: string, featureId: string) =>
      this.post('/api/auto-mode/verify-feature', { projectPath, featureId }),
    resumeFeature: (projectPath: string, featureId: string, useWorktrees?: boolean) =>
      this.post('/api/auto-mode/resume-feature', {
        projectPath,
        featureId,
        useWorktrees,
      }),
    contextExists: (projectPath: string, featureId: string) =>
      this.post('/api/auto-mode/context-exists', { projectPath, featureId }),
    analyzeProject: (projectPath: string) =>
      this.post('/api/auto-mode/analyze-project', { projectPath }),
    followUpFeature: (
      projectPath: string,
      featureId: string,
      prompt: string,
      imagePaths?: string[],
      worktreePath?: string
    ) =>
      this.post('/api/auto-mode/follow-up-feature', {
        projectPath,
        featureId,
        prompt,
        imagePaths,
        worktreePath,
      }),
    commitFeature: (projectPath: string, featureId: string, worktreePath?: string) =>
      this.post('/api/auto-mode/commit-feature', {
        projectPath,
        featureId,
        worktreePath,
      }),
    approvePlan: (
      projectPath: string,
      featureId: string,
      approved: boolean,
      editedPlan?: string,
      feedback?: string
    ) =>
      this.post('/api/auto-mode/approve-plan', {
        projectPath,
        featureId,
        approved,
        editedPlan,
        feedback,
      }),
    resumeInterrupted: (projectPath: string) =>
      this.post('/api/auto-mode/resume-interrupted', { projectPath }),
    onEvent: (callback: (event: AutoModeEvent) => void) => {
      return this.subscribeToEvent('auto-mode:event', callback as EventCallback);
    },
  };

  // Enhance Prompt API
  enhancePrompt = {
    enhance: (
      originalText: string,
      enhancementMode: string,
      model?: string,
      thinkingLevel?: string
    ): Promise<EnhancePromptResult> =>
      this.post('/api/enhance-prompt', {
        originalText,
        enhancementMode,
        model,
        thinkingLevel,
      }),
  };

  // Worktree API
  worktree: WorktreeAPI = {
    mergeFeature: (projectPath: string, featureId: string, options?: object) =>
      this.post('/api/worktree/merge', { projectPath, featureId, options }),
    getInfo: (projectPath: string, featureId: string) =>
      this.post('/api/worktree/info', { projectPath, featureId }),
    getStatus: (projectPath: string, featureId: string) =>
      this.post('/api/worktree/status', { projectPath, featureId }),
    list: (projectPath: string) => this.post('/api/worktree/list', { projectPath }),
    listAll: (projectPath: string, includeDetails?: boolean) =>
      this.post('/api/worktree/list', { projectPath, includeDetails }),
    create: (projectPath: string, branchName: string, baseBranch?: string) =>
      this.post('/api/worktree/create', {
        projectPath,
        branchName,
        baseBranch,
      }),
    delete: (projectPath: string, worktreePath: string, deleteBranch?: boolean) =>
      this.post('/api/worktree/delete', {
        projectPath,
        worktreePath,
        deleteBranch,
      }),
    commit: (worktreePath: string, message: string) =>
      this.post('/api/worktree/commit', { worktreePath, message }),
    push: (worktreePath: string, force?: boolean) =>
      this.post('/api/worktree/push', { worktreePath, force }),
    createPR: (worktreePath: string, options?: any) =>
      this.post('/api/worktree/create-pr', { worktreePath, ...options }),
    getDiffs: (projectPath: string, featureId: string) =>
      this.post('/api/worktree/diffs', { projectPath, featureId }),
    getFileDiff: (projectPath: string, featureId: string, filePath: string) =>
      this.post('/api/worktree/file-diff', {
        projectPath,
        featureId,
        filePath,
      }),
    pull: (worktreePath: string) => this.post('/api/worktree/pull', { worktreePath }),
    checkoutBranch: (worktreePath: string, branchName: string) =>
      this.post('/api/worktree/checkout-branch', { worktreePath, branchName }),
    listBranches: (worktreePath: string) =>
      this.post('/api/worktree/list-branches', { worktreePath }),
    switchBranch: (worktreePath: string, branchName: string) =>
      this.post('/api/worktree/switch-branch', { worktreePath, branchName }),
    openInEditor: (worktreePath: string, editorCommand?: string) =>
      this.post('/api/worktree/open-in-editor', { worktreePath, editorCommand }),
    getDefaultEditor: () => this.get('/api/worktree/default-editor'),
    getAvailableEditors: () => this.get('/api/worktree/available-editors'),
    refreshEditors: () => this.post('/api/worktree/refresh-editors', {}),
    initGit: (projectPath: string) => this.post('/api/worktree/init-git', { projectPath }),
    startDevServer: (projectPath: string, worktreePath: string) =>
      this.post('/api/worktree/start-dev', { projectPath, worktreePath }),
    stopDevServer: (worktreePath: string) => this.post('/api/worktree/stop-dev', { worktreePath }),
    listDevServers: () => this.post('/api/worktree/list-dev-servers', {}),
    getPRInfo: (worktreePath: string, branchName: string) =>
      this.post('/api/worktree/pr-info', { worktreePath, branchName }),
    // Init script methods
    getInitScript: (projectPath: string) =>
      this.get(`/api/worktree/init-script?projectPath=${encodeURIComponent(projectPath)}`),
    setInitScript: (projectPath: string, content: string) =>
      this.put('/api/worktree/init-script', { projectPath, content }),
    deleteInitScript: (projectPath: string) =>
      this.httpDelete('/api/worktree/init-script', { projectPath }),
    runInitScript: (projectPath: string, worktreePath: string, branch: string) =>
      this.post('/api/worktree/run-init-script', { projectPath, worktreePath, branch }),
    onInitScriptEvent: (
      callback: (event: {
        type: 'worktree:init-started' | 'worktree:init-output' | 'worktree:init-completed';
        payload: unknown;
      }) => void
    ) => {
      // Note: subscribeToEvent callback receives (payload) not (_, payload)
      const unsub1 = this.subscribeToEvent('worktree:init-started', (payload) =>
        callback({ type: 'worktree:init-started', payload })
      );
      const unsub2 = this.subscribeToEvent('worktree:init-output', (payload) =>
        callback({ type: 'worktree:init-output', payload })
      );
      const unsub3 = this.subscribeToEvent('worktree:init-completed', (payload) =>
        callback({ type: 'worktree:init-completed', payload })
      );
      return () => {
        unsub1();
        unsub2();
        unsub3();
      };
    },
  };

  // Git API
  git: GitAPI = {
    getDiffs: (projectPath: string) => this.post('/api/git/diffs', { projectPath }),
    getFileDiff: (projectPath: string, filePath: string) =>
      this.post('/api/git/file-diff', { projectPath, filePath }),
  };

  // Suggestions API
  suggestions: SuggestionsAPI = {
    generate: (
      projectPath: string,
      suggestionType?: SuggestionType,
      model?: string,
      thinkingLevel?: string
    ) =>
      this.post('/api/suggestions/generate', { projectPath, suggestionType, model, thinkingLevel }),
    stop: () => this.post('/api/suggestions/stop'),
    status: () => this.get('/api/suggestions/status'),
    onEvent: (callback: (event: SuggestionsEvent) => void) => {
      return this.subscribeToEvent('suggestions:event', callback as EventCallback);
    },
  };

  // Spec Regeneration API
  specRegeneration: SpecRegenerationAPI = {
    create: (
      projectPath: string,
      projectOverview: string,
      generateFeatures?: boolean,
      analyzeProject?: boolean,
      maxFeatures?: number
    ) =>
      this.post('/api/spec-regeneration/create', {
        projectPath,
        projectOverview,
        generateFeatures,
        analyzeProject,
        maxFeatures,
      }),
    generate: (
      projectPath: string,
      projectDefinition: string,
      generateFeatures?: boolean,
      analyzeProject?: boolean,
      maxFeatures?: number
    ) =>
      this.post('/api/spec-regeneration/generate', {
        projectPath,
        projectDefinition,
        generateFeatures,
        analyzeProject,
        maxFeatures,
      }),
    generateFeatures: (projectPath: string, maxFeatures?: number) =>
      this.post('/api/spec-regeneration/generate-features', {
        projectPath,
        maxFeatures,
      }),
    stop: (projectPath?: string) => this.post('/api/spec-regeneration/stop', { projectPath }),
    status: (projectPath?: string) =>
      this.get(
        projectPath
          ? `/api/spec-regeneration/status?projectPath=${encodeURIComponent(projectPath)}`
          : '/api/spec-regeneration/status'
      ),
    onEvent: (callback: (event: SpecRegenerationEvent) => void) => {
      return this.subscribeToEvent('spec-regeneration:event', callback as EventCallback);
    },
  };

  // Running Agents API
  runningAgents = {
    getAll: (): Promise<{
      success: boolean;
      runningAgents?: Array<{
        featureId: string;
        projectPath: string;
        projectName: string;
        isAutoMode: boolean;
      }>;
      totalCount?: number;
      error?: string;
    }> => this.get('/api/running-agents'),
  };

  // GitHub API
  github: GitHubAPI = {
    checkRemote: (projectPath: string) => this.post('/api/github/check-remote', { projectPath }),
    listIssues: (projectPath: string) => this.post('/api/github/issues', { projectPath }),
    listPRs: (projectPath: string) => this.post('/api/github/prs', { projectPath }),
    validateIssue: (
      projectPath: string,
      issue: IssueValidationInput,
      model?: string,
      thinkingLevel?: string
    ) => this.post('/api/github/validate-issue', { projectPath, ...issue, model, thinkingLevel }),
    getValidationStatus: (projectPath: string, issueNumber?: number) =>
      this.post('/api/github/validation-status', { projectPath, issueNumber }),
    stopValidation: (projectPath: string, issueNumber: number) =>
      this.post('/api/github/validation-stop', { projectPath, issueNumber }),
    getValidations: (projectPath: string, issueNumber?: number) =>
      this.post('/api/github/validations', { projectPath, issueNumber }),
    markValidationViewed: (projectPath: string, issueNumber: number) =>
      this.post('/api/github/validation-mark-viewed', { projectPath, issueNumber }),
    onValidationEvent: (callback: (event: IssueValidationEvent) => void) =>
      this.subscribeToEvent('issue-validation:event', callback as EventCallback),
    getIssueComments: (projectPath: string, issueNumber: number, cursor?: string) =>
      this.post('/api/github/issue-comments', { projectPath, issueNumber, cursor }),
  };

  // Workspace API
  workspace = {
    getConfig: (): Promise<{
      success: boolean;
      configured: boolean;
      workspaceDir?: string;
      defaultDir?: string | null;
      error?: string;
    }> => this.get('/api/workspace/config'),

    getDirectories: (): Promise<{
      success: boolean;
      directories?: Array<{ name: string; path: string }>;
      error?: string;
    }> => this.get('/api/workspace/directories'),
  };

  // Agent API
  agent = {
    start: (
      sessionId: string,
      workingDirectory?: string
    ): Promise<{
      success: boolean;
      messages?: Message[];
      error?: string;
    }> => this.post('/api/agent/start', { sessionId, workingDirectory }),

    send: (
      sessionId: string,
      message: string,
      workingDirectory?: string,
      imagePaths?: string[],
      model?: string,
      thinkingLevel?: string
    ): Promise<{ success: boolean; error?: string }> =>
      this.post('/api/agent/send', {
        sessionId,
        message,
        workingDirectory,
        imagePaths,
        model,
        thinkingLevel,
      }),

    getHistory: (
      sessionId: string
    ): Promise<{
      success: boolean;
      messages?: Message[];
      isRunning?: boolean;
      error?: string;
    }> => this.post('/api/agent/history', { sessionId }),

    stop: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
      this.post('/api/agent/stop', { sessionId }),

    clear: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
      this.post('/api/agent/clear', { sessionId }),

    onStream: (callback: (data: unknown) => void): (() => void) => {
      return this.subscribeToEvent('agent:stream', callback as EventCallback);
    },

    // Queue management
    queueAdd: (
      sessionId: string,
      message: string,
      imagePaths?: string[],
      model?: string,
      thinkingLevel?: string
    ): Promise<{
      success: boolean;
      queuedPrompt?: {
        id: string;
        message: string;
        imagePaths?: string[];
        model?: string;
        thinkingLevel?: string;
        addedAt: string;
      };
      error?: string;
    }> =>
      this.post('/api/agent/queue/add', { sessionId, message, imagePaths, model, thinkingLevel }),

    queueList: (
      sessionId: string
    ): Promise<{
      success: boolean;
      queue?: Array<{
        id: string;
        message: string;
        imagePaths?: string[];
        model?: string;
        thinkingLevel?: string;
        addedAt: string;
      }>;
      error?: string;
    }> => this.post('/api/agent/queue/list', { sessionId }),

    queueRemove: (
      sessionId: string,
      promptId: string
    ): Promise<{ success: boolean; error?: string }> =>
      this.post('/api/agent/queue/remove', { sessionId, promptId }),

    queueClear: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
      this.post('/api/agent/queue/clear', { sessionId }),
  };

  // Templates API
  templates = {
    clone: (
      repoUrl: string,
      projectName: string,
      parentDir: string
    ): Promise<{
      success: boolean;
      projectPath?: string;
      projectName?: string;
      error?: string;
    }> => this.post('/api/templates/clone', { repoUrl, projectName, parentDir }),
  };

  // Settings API - persistent file-based settings
  settings = {
    // Get settings status (check if migration needed)
    getStatus: (): Promise<{
      success: boolean;
      hasGlobalSettings: boolean;
      hasCredentials: boolean;
      dataDir: string;
      needsMigration: boolean;
    }> => this.get('/api/settings/status'),

    // Global settings
    getGlobal: (): Promise<{
      success: boolean;
      settings?: {
        version: number;
        theme: string;
        sidebarOpen: boolean;
        chatHistoryOpen: boolean;
        maxConcurrency: number;
        defaultSkipTests: boolean;
        enableDependencyBlocking: boolean;
        useWorktrees: boolean;
        defaultPlanningMode: string;
        defaultRequirePlanApproval: boolean;
        muteDoneSound: boolean;
        enhancementModel: string;
        keyboardShortcuts: Record<string, string>;
        projects: unknown[];
        trashedProjects: unknown[];
        projectHistory: string[];
        projectHistoryIndex: number;
        lastProjectDir?: string;
        recentFolders: string[];
        worktreePanelCollapsed: boolean;
        lastSelectedSessionByProject: Record<string, string>;
        mcpServers?: Array<{
          id: string;
          name: string;
          description?: string;
          type?: 'stdio' | 'sse' | 'http';
          command?: string;
          args?: string[];
          env?: Record<string, string>;
          url?: string;
          headers?: Record<string, string>;
          enabled?: boolean;
        }>;
      };
      error?: string;
    }> => this.get('/api/settings/global'),

    updateGlobal: (
      updates: Record<string, unknown>
    ): Promise<{
      success: boolean;
      settings?: Record<string, unknown>;
      error?: string;
    }> => this.put('/api/settings/global', updates),

    // Credentials (masked for security)
    getCredentials: (): Promise<{
      success: boolean;
      credentials?: {
        anthropic: { configured: boolean; masked: string };
        google: { configured: boolean; masked: string };
        openai: { configured: boolean; masked: string };
      };
      error?: string;
    }> => this.get('/api/settings/credentials'),

    updateCredentials: (updates: {
      apiKeys?: { anthropic?: string; google?: string; openai?: string };
    }): Promise<{
      success: boolean;
      credentials?: {
        anthropic: { configured: boolean; masked: string };
        google: { configured: boolean; masked: string };
        openai: { configured: boolean; masked: string };
      };
      error?: string;
    }> => this.put('/api/settings/credentials', updates),

    // Project settings
    getProject: (
      projectPath: string
    ): Promise<{
      success: boolean;
      settings?: {
        version: number;
        theme?: string;
        useWorktrees?: boolean;
        currentWorktree?: { path: string | null; branch: string };
        worktrees?: Array<{
          path: string;
          branch: string;
          isMain: boolean;
          hasChanges?: boolean;
          changedFilesCount?: number;
        }>;
        boardBackground?: {
          imagePath: string | null;
          imageVersion?: number;
          cardOpacity: number;
          columnOpacity: number;
          columnBorderEnabled: boolean;
          cardGlassmorphism: boolean;
          cardBorderEnabled: boolean;
          cardBorderOpacity: number;
          hideScrollbar: boolean;
        };
        worktreePanelVisible?: boolean;
        lastSelectedSessionId?: string;
      };
      error?: string;
    }> => this.post('/api/settings/project', { projectPath }),

    updateProject: (
      projectPath: string,
      updates: Record<string, unknown>
    ): Promise<{
      success: boolean;
      settings?: Record<string, unknown>;
      error?: string;
    }> => this.put('/api/settings/project', { projectPath, updates }),

    // Migration from localStorage
    migrate: (data: {
      'automaker-storage'?: string;
      'automaker-setup'?: string;
      'worktree-panel-collapsed'?: string;
      'file-browser-recent-folders'?: string;
      'automaker:lastProjectDir'?: string;
    }): Promise<{
      success: boolean;
      migratedGlobalSettings: boolean;
      migratedCredentials: boolean;
      migratedProjectCount: number;
      errors: string[];
    }> => this.post('/api/settings/migrate', { data }),

    // Filesystem agents discovery (read-only)
    discoverAgents: (
      projectPath?: string,
      sources?: Array<'user' | 'project'>
    ): Promise<{
      success: boolean;
      agents?: Array<{
        name: string;
        definition: {
          description: string;
          prompt: string;
          tools?: string[];
          model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
        };
        source: 'user' | 'project';
        filePath: string;
      }>;
      error?: string;
    }> => this.post('/api/settings/agents/discover', { projectPath, sources }),
  };

  // Sessions API
  sessions = {
    list: (
      includeArchived?: boolean
    ): Promise<{
      success: boolean;
      sessions?: SessionListItem[];
      error?: string;
    }> => this.get(`/api/sessions?includeArchived=${includeArchived || false}`),

    create: (
      name: string,
      projectPath: string,
      workingDirectory?: string
    ): Promise<{
      success: boolean;
      session?: {
        id: string;
        name: string;
        projectPath: string;
        workingDirectory?: string;
        createdAt: string;
        updatedAt: string;
      };
      error?: string;
    }> => this.post('/api/sessions', { name, projectPath, workingDirectory }),

    update: (
      sessionId: string,
      name?: string,
      tags?: string[]
    ): Promise<{ success: boolean; error?: string }> =>
      this.put(`/api/sessions/${sessionId}`, { name, tags }),

    archive: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
      this.post(`/api/sessions/${sessionId}/archive`, {}),

    unarchive: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
      this.post(`/api/sessions/${sessionId}/unarchive`, {}),

    delete: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
      this.httpDelete(`/api/sessions/${sessionId}`),
  };

  // Claude API
  claude = {
    getUsage: (): Promise<ClaudeUsageResponse> => this.get('/api/claude/usage'),
  };

  // Codex API
  codex = {
    getUsage: (): Promise<CodexUsageResponse> => this.get('/api/codex/usage'),
    getModels: (
      refresh = false
    ): Promise<{
      success: boolean;
      models?: Array<{
        id: string;
        label: string;
        description: string;
        hasThinking: boolean;
        supportsVision: boolean;
        tier: 'premium' | 'standard' | 'basic';
        isDefault: boolean;
      }>;
      cachedAt?: number;
      error?: string;
    }> => {
      const url = `/api/codex/models${refresh ? '?refresh=true' : ''}`;
      return this.get(url);
    },
  };

  // Context API
  context = {
    describeImage: (
      imagePath: string
    ): Promise<{
      success: boolean;
      description?: string;
      error?: string;
    }> => this.post('/api/context/describe-image', { imagePath }),

    describeFile: (
      filePath: string
    ): Promise<{
      success: boolean;
      description?: string;
      error?: string;
    }> => this.post('/api/context/describe-file', { filePath }),
  };

  // Backlog Plan API
  backlogPlan = {
    generate: (
      projectPath: string,
      prompt: string,
      model?: string
    ): Promise<{ success: boolean; error?: string }> =>
      this.post('/api/backlog-plan/generate', { projectPath, prompt, model }),

    stop: (): Promise<{ success: boolean; error?: string }> =>
      this.post('/api/backlog-plan/stop', {}),

    status: (): Promise<{ success: boolean; isRunning?: boolean; error?: string }> =>
      this.get('/api/backlog-plan/status'),

    apply: (
      projectPath: string,
      plan: {
        changes: Array<{
          type: 'add' | 'update' | 'delete';
          featureId?: string;
          feature?: Record<string, unknown>;
          reason: string;
        }>;
        summary: string;
        dependencyUpdates: Array<{
          featureId: string;
          removedDependencies: string[];
          addedDependencies: string[];
        }>;
      },
      branchName?: string
    ): Promise<{ success: boolean; appliedChanges?: string[]; error?: string }> =>
      this.post('/api/backlog-plan/apply', { projectPath, plan, branchName }),

    onEvent: (callback: (data: unknown) => void): (() => void) => {
      return this.subscribeToEvent('backlog-plan:event', callback as EventCallback);
    },
  };

  // Ideation API - brainstorming and idea management
  ideation: IdeationAPI = {
    startSession: (projectPath: string, options?: StartSessionOptions) =>
      this.post('/api/ideation/session/start', { projectPath, options }),

    getSession: (projectPath: string, sessionId: string) =>
      this.post('/api/ideation/session/get', { projectPath, sessionId }),

    sendMessage: (
      sessionId: string,
      message: string,
      options?: { imagePaths?: string[]; model?: string }
    ) => this.post('/api/ideation/session/message', { sessionId, message, options }),

    stopSession: (sessionId: string) => this.post('/api/ideation/session/stop', { sessionId }),

    listIdeas: (projectPath: string) => this.post('/api/ideation/ideas/list', { projectPath }),

    createIdea: (projectPath: string, idea: CreateIdeaInput) =>
      this.post('/api/ideation/ideas/create', { projectPath, idea }),

    getIdea: (projectPath: string, ideaId: string) =>
      this.post('/api/ideation/ideas/get', { projectPath, ideaId }),

    updateIdea: (projectPath: string, ideaId: string, updates: UpdateIdeaInput) =>
      this.post('/api/ideation/ideas/update', { projectPath, ideaId, updates }),

    deleteIdea: (projectPath: string, ideaId: string) =>
      this.post('/api/ideation/ideas/delete', { projectPath, ideaId }),

    analyzeProject: (projectPath: string) => this.post('/api/ideation/analyze', { projectPath }),

    generateSuggestions: (
      projectPath: string,
      promptId: string,
      category: IdeaCategory,
      count?: number
    ) =>
      this.post('/api/ideation/suggestions/generate', { projectPath, promptId, category, count }),

    convertToFeature: (projectPath: string, ideaId: string, options?: ConvertToFeatureOptions) =>
      this.post('/api/ideation/convert', { projectPath, ideaId, ...options }),

    addSuggestionToBoard: (
      projectPath: string,
      suggestion: AnalysisSuggestion
    ): Promise<{ success: boolean; featureId?: string; error?: string }> =>
      this.post('/api/ideation/add-suggestion', { projectPath, suggestion }),

    getPrompts: () => this.get('/api/ideation/prompts'),

    onStream: (callback: (event: any) => void): (() => void) => {
      return this.subscribeToEvent('ideation:stream', callback as EventCallback);
    },

    onAnalysisEvent: (callback: (event: any) => void): (() => void) => {
      return this.subscribeToEvent('ideation:analysis', callback as EventCallback);
    },
  };

  // MCP API - Test MCP server connections and list tools
  // SECURITY: Only accepts serverId, not arbitrary serverConfig, to prevent
  // drive-by command execution attacks. Servers must be saved first.
  mcp = {
    testServer: (
      serverId: string
    ): Promise<{
      success: boolean;
      tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
        enabled: boolean;
      }>;
      error?: string;
      connectionTime?: number;
      serverInfo?: {
        name?: string;
        version?: string;
      };
    }> => this.post('/api/mcp/test', { serverId }),

    listTools: (
      serverId: string
    ): Promise<{
      success: boolean;
      tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
        enabled: boolean;
      }>;
      error?: string;
    }> => this.post('/api/mcp/tools', { serverId }),
  };

  // Pipeline API - custom workflow pipeline steps
  pipeline = {
    getConfig: (
      projectPath: string
    ): Promise<{
      success: boolean;
      config?: {
        version: 1;
        steps: Array<{
          id: string;
          name: string;
          order: number;
          instructions: string;
          colorClass: string;
          createdAt: string;
          updatedAt: string;
        }>;
      };
      error?: string;
    }> => this.post('/api/pipeline/config', { projectPath }),

    saveConfig: (
      projectPath: string,
      config: {
        version: 1;
        steps: Array<{
          id: string;
          name: string;
          order: number;
          instructions: string;
          colorClass: string;
          createdAt: string;
          updatedAt: string;
        }>;
      }
    ): Promise<{ success: boolean; error?: string }> =>
      this.post('/api/pipeline/config/save', { projectPath, config }),

    addStep: (
      projectPath: string,
      step: {
        name: string;
        order: number;
        instructions: string;
        colorClass: string;
      }
    ): Promise<{
      success: boolean;
      step?: {
        id: string;
        name: string;
        order: number;
        instructions: string;
        colorClass: string;
        createdAt: string;
        updatedAt: string;
      };
      error?: string;
    }> => this.post('/api/pipeline/steps/add', { projectPath, step }),

    updateStep: (
      projectPath: string,
      stepId: string,
      updates: Partial<{
        name: string;
        order: number;
        instructions: string;
        colorClass: string;
      }>
    ): Promise<{
      success: boolean;
      step?: {
        id: string;
        name: string;
        order: number;
        instructions: string;
        colorClass: string;
        createdAt: string;
        updatedAt: string;
      };
      error?: string;
    }> => this.post('/api/pipeline/steps/update', { projectPath, stepId, updates }),

    deleteStep: (
      projectPath: string,
      stepId: string
    ): Promise<{ success: boolean; error?: string }> =>
      this.post('/api/pipeline/steps/delete', { projectPath, stepId }),

    reorderSteps: (
      projectPath: string,
      stepIds: string[]
    ): Promise<{ success: boolean; error?: string }> =>
      this.post('/api/pipeline/steps/reorder', { projectPath, stepIds }),
  };
}

// Singleton instance
let httpApiClientInstance: HttpApiClient | null = null;

export function getHttpApiClient(): HttpApiClient {
  if (!httpApiClientInstance) {
    httpApiClientInstance = new HttpApiClient();
  }
  return httpApiClientInstance;
}

// Start API key initialization immediately when this module is imported
// This ensures the init promise is created early, even before React components mount
// The actual async work happens in the background and won't block module loading
initApiKey().catch((error) => {
  logger.error('Failed to initialize API key:', error);
});
