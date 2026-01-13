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

const initialState: AuthState = {
  authChecked: false,
  isAuthenticated: false,
  settingsLoaded: false,
};

/**
 * Web authentication state.
 *
 * Intentionally NOT persisted: source of truth is server session cookie.
 */
export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  ...initialState,
  setAuthState: (state) => {
    set({ ...state });
  },
  resetAuth: () => set(initialState),
}));
