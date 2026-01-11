/**
 * Login View - Web mode authentication
 *
 * Uses a state machine for clear, maintainable flow:
 *
 * States:
 *   checking_server → server_error (after 5 retries)
 *   checking_server → awaiting_login (401/unauthenticated)
 *   checking_server → checking_setup (authenticated)
 *   awaiting_login → logging_in → login_error | checking_setup
 *   checking_setup → redirecting
 */

import { useReducer, useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  login,
  getHttpApiClient,
  getServerUrlSync,
  getApiKey,
  getSessionToken,
  initApiKey,
  waitForApiKeyInit,
} from '@/lib/http-api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyRound, AlertCircle, Loader2, RefreshCw, ServerCrash } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useSetupStore } from '@/store/setup-store';

// =============================================================================
// State Machine Types
// =============================================================================

type State =
  | { phase: 'checking_server'; attempt: number }
  | { phase: 'server_error'; message: string }
  | { phase: 'awaiting_login'; apiKey: string; error: string | null }
  | { phase: 'logging_in'; apiKey: string }
  | { phase: 'checking_setup' }
  | { phase: 'redirecting'; to: string };

type Action =
  | { type: 'SERVER_CHECK_RETRY'; attempt: number }
  | { type: 'SERVER_ERROR'; message: string }
  | { type: 'AUTH_REQUIRED' }
  | { type: 'AUTH_VALID' }
  | { type: 'UPDATE_API_KEY'; value: string }
  | { type: 'SUBMIT_LOGIN' }
  | { type: 'LOGIN_ERROR'; message: string }
  | { type: 'REDIRECT'; to: string }
  | { type: 'RETRY_SERVER_CHECK' };

const initialState: State = { phase: 'checking_server', attempt: 1 };

// =============================================================================
// State Machine Reducer
// =============================================================================

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SERVER_CHECK_RETRY':
      return { phase: 'checking_server', attempt: action.attempt };

    case 'SERVER_ERROR':
      return { phase: 'server_error', message: action.message };

    case 'AUTH_REQUIRED':
      return { phase: 'awaiting_login', apiKey: '', error: null };

    case 'AUTH_VALID':
      return { phase: 'checking_setup' };

    case 'UPDATE_API_KEY':
      if (state.phase !== 'awaiting_login') return state;
      return { ...state, apiKey: action.value };

    case 'SUBMIT_LOGIN':
      if (state.phase !== 'awaiting_login') return state;
      return { phase: 'logging_in', apiKey: state.apiKey };

    case 'LOGIN_ERROR':
      if (state.phase !== 'logging_in') return state;
      return { phase: 'awaiting_login', apiKey: state.apiKey, error: action.message };

    case 'REDIRECT':
      return { phase: 'redirecting', to: action.to };

    case 'RETRY_SERVER_CHECK':
      return { phase: 'checking_server', attempt: 1 };

    default:
      return state;
  }
}

// =============================================================================
// Constants
// =============================================================================

const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 400;
const NO_STORE_CACHE_MODE: RequestCache = 'no-store';

// =============================================================================
// Imperative Flow Logic (runs once on mount)
// =============================================================================

/**
 * Check auth status without triggering side effects.
 * Unlike the httpClient methods, this does NOT call handleUnauthorized()
 * which would navigate us away to /logged-out.
 *
 * Supports both:
 * - Electron mode: Uses X-API-Key header (API key from IPC)
 * - Web mode: Uses HTTP-only session cookie
 *
 * Returns: { authenticated: true } or { authenticated: false }
 * Throws: on network errors (for retry logic)
 */
async function checkAuthStatusSafe(): Promise<{ authenticated: boolean }> {
  const serverUrl = getServerUrlSync();

  // Wait for API key to be initialized before checking auth
  // This ensures we have a valid API key to send in the header
  await waitForApiKeyInit();

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

  const response = await fetch(`${serverUrl}/api/auth/status`, {
    headers,
    credentials: 'include',
    signal: AbortSignal.timeout(5000),
    cache: NO_STORE_CACHE_MODE,
  });

  // Any response means server is reachable
  const data = await response.json();
  return { authenticated: data.authenticated === true };
}

/**
 * Check if server is reachable and if we have a valid session.
 */
async function checkServerAndSession(
  dispatch: React.Dispatch<Action>,
  setAuthState: (state: { isAuthenticated: boolean; authChecked: boolean }) => void,
  signal?: AbortSignal
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Return early if the component has unmounted
    if (signal?.aborted) {
      return;
    }

    dispatch({ type: 'SERVER_CHECK_RETRY', attempt });

    try {
      const result = await checkAuthStatusSafe();

      // Return early if the component has unmounted
      if (signal?.aborted) {
        return;
      }

      if (result.authenticated) {
        // Server is reachable and we're authenticated
        setAuthState({ isAuthenticated: true, authChecked: true });
        dispatch({ type: 'AUTH_VALID' });
        return;
      }

      // Server is reachable but we need to login
      dispatch({ type: 'AUTH_REQUIRED' });
      return;
    } catch (error: unknown) {
      // Network error - server is not reachable
      console.debug(`Server check attempt ${attempt}/${MAX_RETRIES} failed:`, error);

      if (attempt === MAX_RETRIES) {
        // Return early if the component has unmounted
        if (!signal?.aborted) {
          dispatch({
            type: 'SERVER_ERROR',
            message: 'Unable to connect to server. Please check that the server is running.',
          });
        }
        return;
      }

      // Exponential backoff before retry
      const backoffMs = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}

async function checkSetupStatus(
  dispatch: React.Dispatch<Action>,
  signal?: AbortSignal
): Promise<void> {
  const httpClient = getHttpApiClient();

  try {
    const result = await httpClient.settings.getGlobal();

    // Return early if aborted
    if (signal?.aborted) {
      return;
    }

    if (result.success && result.settings) {
      // Check the setupComplete field from settings
      // This is set to true when user completes the setup wizard
      const setupComplete = (result.settings as { setupComplete?: boolean }).setupComplete === true;

      // IMPORTANT: Update the Zustand store BEFORE redirecting
      // Otherwise __root.tsx routing effect will override our redirect
      // because it reads setupComplete from the store (which defaults to false)
      useSetupStore.getState().setSetupComplete(setupComplete);

      dispatch({ type: 'REDIRECT', to: setupComplete ? '/' : '/setup' });
    } else {
      // No settings yet = first run = need setup
      useSetupStore.getState().setSetupComplete(false);
      dispatch({ type: 'REDIRECT', to: '/setup' });
    }
  } catch {
    // Return early if aborted
    if (signal?.aborted) {
      return;
    }
    // If we can't get settings, go to setup to be safe
    useSetupStore.getState().setSetupComplete(false);
    dispatch({ type: 'REDIRECT', to: '/setup' });
  }
}

async function performLogin(
  apiKey: string,
  dispatch: React.Dispatch<Action>,
  setAuthState: (state: { isAuthenticated: boolean; authChecked: boolean }) => void
): Promise<void> {
  try {
    const result = await login(apiKey.trim());

    if (result.success) {
      setAuthState({ isAuthenticated: true, authChecked: true });
      dispatch({ type: 'AUTH_VALID' });
    } else {
      dispatch({ type: 'LOGIN_ERROR', message: result.error || 'Invalid API key' });
    }
  } catch {
    dispatch({ type: 'LOGIN_ERROR', message: 'Failed to connect to server' });
  }
}

// =============================================================================
// Component
// =============================================================================

export function LoginView() {
  const navigate = useNavigate();
  const setAuthState = useAuthStore((s) => s.setAuthState);
  const [state, dispatch] = useReducer(reducer, initialState);
  const retryControllerRef = useRef<AbortController | null>(null);

  // Initialize API key before checking session
  // This ensures getApiKey() returns a valid value in checkAuthStatusSafe()
  useEffect(() => {
    initApiKey().catch((error) => {
      console.warn('Failed to initialize API key:', error);
    });
  }, []);

  // Run initial server/session check on mount.
  // IMPORTANT: Do not "run once" via a ref guard here.
  // In React StrictMode (dev), effects mount -> cleanup -> mount.
  // If we abort in cleanup and also skip the second run, we'll get stuck forever on "Connecting...".
  useEffect(() => {
    const controller = new AbortController();
    checkServerAndSession(dispatch, setAuthState, controller.signal);

    return () => {
      controller.abort();
      retryControllerRef.current?.abort();
    };
  }, [setAuthState]);

  // When we enter checking_setup phase, check setup status
  useEffect(() => {
    if (state.phase === 'checking_setup') {
      const controller = new AbortController();
      checkSetupStatus(dispatch, controller.signal);

      return () => {
        controller.abort();
      };
    }
  }, [state.phase]);

  // When we enter redirecting phase, navigate
  useEffect(() => {
    if (state.phase === 'redirecting') {
      navigate({ to: state.to });
    }
  }, [state.phase, state.phase === 'redirecting' ? state.to : null, navigate]);

  // Handle login form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (state.phase !== 'awaiting_login' || !state.apiKey.trim()) return;

    dispatch({ type: 'SUBMIT_LOGIN' });
    performLogin(state.apiKey, dispatch, setAuthState);
  };

  // Handle retry button for server errors
  const handleRetry = () => {
    // Abort any previous retry request
    retryControllerRef.current?.abort();

    dispatch({ type: 'RETRY_SERVER_CHECK' });
    const controller = new AbortController();
    retryControllerRef.current = controller;
    checkServerAndSession(dispatch, setAuthState, controller.signal);
  };

  // =============================================================================
  // Render based on current state
  // =============================================================================

  // Checking server connectivity
  if (state.phase === 'checking_server') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">
            Connecting to server
            {state.attempt > 1 ? ` (attempt ${state.attempt}/${MAX_RETRIES})` : '...'}
          </p>
        </div>
      </div>
    );
  }

  // Server unreachable after retries
  if (state.phase === 'server_error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <ServerCrash className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Server Unavailable</h1>
            <p className="text-sm text-muted-foreground">{state.message}</p>
          </div>
          <Button onClick={handleRetry} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }

  // Checking setup status after auth
  if (state.phase === 'checking_setup' || state.phase === 'redirecting') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">
            {state.phase === 'checking_setup' ? 'Loading settings...' : 'Redirecting...'}
          </p>
        </div>
      </div>
    );
  }

  // Login form (awaiting_login or logging_in)
  const isLoggingIn = state.phase === 'logging_in';
  const apiKey = state.phase === 'awaiting_login' ? state.apiKey : state.apiKey;
  const error = state.phase === 'awaiting_login' ? state.error : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight">Authentication Required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the API key shown in the server console to continue.
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="apiKey" className="text-sm font-medium">
              API Key
            </label>
            <Input
              id="apiKey"
              type="password"
              placeholder="Enter API key..."
              value={apiKey}
              onChange={(e) => dispatch({ type: 'UPDATE_API_KEY', value: e.target.value })}
              disabled={isLoggingIn}
              autoFocus
              className="font-mono"
              data-testid="login-api-key-input"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoggingIn || !apiKey.trim()}
            data-testid="login-submit-button"
          >
            {isLoggingIn ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Authenticating...
              </>
            ) : (
              'Login'
            )}
          </Button>
        </form>

        {/* Help Text */}
        <div className="rounded-lg border bg-muted/50 p-4 text-sm">
          <p className="font-medium">Where to find the API key:</p>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
            <li>Look at the server terminal/console output</li>
            <li>Find the box labeled "API Key for Web Mode Authentication"</li>
            <li>Copy the UUID displayed there</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
