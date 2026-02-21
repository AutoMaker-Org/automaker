import { Component, type ReactNode, type ErrorInfo } from 'react';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('AppErrorBoundary');

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isCrashLoop: boolean;
}

/** Key used to track recent crash timestamps for crash loop detection */
const CRASH_TIMESTAMPS_KEY = 'automaker-crash-timestamps';
/** Number of crashes within the time window that constitutes a crash loop */
const CRASH_LOOP_THRESHOLD = 3;
/** Time window in ms for crash loop detection (30 seconds) */
const CRASH_LOOP_WINDOW_MS = 30_000;

/**
 * Root-level error boundary for the entire application.
 *
 * Catches uncaught React errors that would otherwise show TanStack Router's
 * default "Something went wrong!" screen with a raw error message.
 *
 * Provides a user-friendly error screen with a reload button to recover.
 * This is especially important for transient errors during initial app load
 * (e.g., race conditions during auth/hydration on fresh browser sessions).
 *
 * Includes crash loop detection: if the app crashes 3+ times within 30 seconds,
 * the UI cache is automatically cleared to break loops caused by stale cached
 * worktree paths or other corrupt persisted state.
 */
export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, isCrashLoop: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Uncaught application error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    // Track crash timestamps to detect crash loops.
    // If the app crashes multiple times in quick succession, it's likely due to
    // stale cached data (e.g., worktree paths that no longer exist on disk).
    try {
      const now = Date.now();
      const raw = sessionStorage.getItem(CRASH_TIMESTAMPS_KEY);
      const timestamps: number[] = raw ? JSON.parse(raw) : [];
      timestamps.push(now);
      // Keep only timestamps within the detection window
      const recent = timestamps.filter((t) => now - t < CRASH_LOOP_WINDOW_MS);
      sessionStorage.setItem(CRASH_TIMESTAMPS_KEY, JSON.stringify(recent));

      if (recent.length >= CRASH_LOOP_THRESHOLD) {
        logger.error(
          `Crash loop detected (${recent.length} crashes in ${CRASH_LOOP_WINDOW_MS}ms) — clearing UI cache`
        );
        // Auto-clear the UI cache to break the loop
        localStorage.removeItem('automaker-ui-cache');
        sessionStorage.removeItem(CRASH_TIMESTAMPS_KEY);
        this.setState({ isCrashLoop: true });
      }
    } catch {
      // Storage may be unavailable — ignore
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearCacheAndReload = () => {
    // Clear the UI cache store that persists worktree selections and other UI state.
    // This breaks crash loops caused by stale worktree paths that no longer exist on disk.
    try {
      localStorage.removeItem('automaker-ui-cache');
    } catch {
      // localStorage may be unavailable in some contexts
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex h-screen w-full flex-col items-center justify-center gap-6 bg-background p-6 text-foreground"
          data-testid="app-error-boundary"
        >
          {/* Logo matching the app shell in index.html */}
          <svg
            className="h-14 w-14 opacity-90"
            viewBox="0 0 256 256"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect
              className="fill-foreground/[0.08]"
              x="16"
              y="16"
              width="224"
              height="224"
              rx="56"
            />
            <g
              className="stroke-foreground/70"
              fill="none"
              strokeWidth="20"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M92 92 L52 128 L92 164" />
              <path d="M144 72 L116 184" />
              <path d="M164 92 L204 128 L164 164" />
            </g>
          </svg>

          <div className="text-center space-y-2">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground max-w-md">
              {this.state.isCrashLoop
                ? 'The application crashed repeatedly, likely due to stale cached data. The cache has been cleared automatically. Reload to continue.'
                : 'The application encountered an unexpected error. This is usually temporary and can be resolved by reloading the page.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <svg
                className="h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
              Reload Page
            </button>

            <button
              type="button"
              onClick={this.handleClearCacheAndReload}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <svg
                className="h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              Clear Cache &amp; Reload
            </button>
          </div>

          {/* Collapsible technical details for debugging */}
          {this.state.error && (
            <details className="text-xs text-muted-foreground max-w-lg w-full">
              <summary className="cursor-pointer hover:text-foreground text-center">
                Technical details
              </summary>
              <pre className="mt-2 p-3 bg-muted/50 rounded-md text-left overflow-auto max-h-32 border border-border">
                {this.state.error.stack || this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
