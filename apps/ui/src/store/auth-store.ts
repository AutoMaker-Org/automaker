import { create } from 'zustand';

interface AuthState {
  /** Whether we've attempted to determine auth status for this page load */
  authChecked: boolean;
  /** Whether the user is currently authenticated (web mode: valid session cookie) */
  isAuthenticated: boolean;
  /** Whether settings have been loaded and hydrated from server */
  settingsLoaded: boolean;
}

interface AuthActions {
  setAuthState: (state: Partial<AuthState>) => void;
  resetAuth: () => void;
}

/**
 * Pre-flight check: if localStorage has cached settings with projects AND setup is
 * complete, we can optimistically mark auth as complete on the very first render,
 * skipping the spinner entirely. The background verify in __root.tsx will correct
 * this if the session is invalid.
 *
 * This runs synchronously at module load time — before createRoot().render() —
 * so the first React render never shows the !authChecked spinner for returning users.
 *
 * We only set settingsLoaded=true when setupComplete is also true in the cache.
 * If setupComplete is false, settingsLoaded stays false so the routing effect in
 * __root.tsx doesn't immediately redirect to /setup before the setup store is hydrated.
 * In practice, returning users who completed setup have both flags in their cache.
 *
 * Intentionally minimal: only checks for the key existence and basic structure.
 * Full hydration (project data, settings) is handled by __root.tsx after mount.
 */
function getInitialAuthState(): AuthState {
  try {
    const raw = localStorage.getItem('automaker-settings-cache');
    if (raw) {
      const parsed = JSON.parse(raw) as {
        projects?: unknown[];
        setupComplete?: boolean;
      };
      if (parsed?.projects && Array.isArray(parsed.projects) && parsed.projects.length > 0) {
        // Returning user with cached settings — optimistically mark as authenticated.
        // Only mark settingsLoaded=true when setupComplete is confirmed in cache,
        // preventing premature /setup redirects before the setup store is hydrated.
        // Background verify in __root.tsx will fix isAuthenticated if session expired.
        const setupDone = parsed.setupComplete === true;
        return {
          authChecked: true,
          isAuthenticated: true,
          settingsLoaded: setupDone,
        };
      }
    }
  } catch {
    // Corrupted localStorage or JSON parse error — fall through to cold start
  }
  return { authChecked: false, isAuthenticated: false, settingsLoaded: false };
}

const initialState: AuthState = getInitialAuthState();

/**
 * Web authentication state.
 *
 * Intentionally NOT persisted: source of truth is server session cookie.
 * Initial state is optimistically set from localStorage cache for returning users,
 * then verified against the server in the background by __root.tsx.
 */
export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  ...initialState,
  setAuthState: (state) => {
    set({ ...state });
  },
  resetAuth: () => set({ authChecked: false, isAuthenticated: false, settingsLoaded: false }),
}));
