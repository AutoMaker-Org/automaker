/**
 * React Query Client Configuration
 *
 * Central configuration for TanStack React Query.
 * Provides default options for queries and mutations including
 * caching, retries, and error handling.
 *
 * Mobile-aware: Automatically extends stale times and garbage collection
 * on mobile devices to reduce unnecessary refetching, which causes
 * blank screens, reloads, and battery drain on flaky mobile connections.
 */

import { QueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createLogger } from '@automaker/utils/logger';
import { isConnectionError, handleServerOffline } from './http-api-client';
import { isMobileDevice } from './mobile-detect';

const logger = createLogger('QueryClient');

/**
 * Mobile multiplier for stale times.
 * On mobile, data stays "fresh" longer to avoid refetching on every
 * component mount, which causes blank flickers and layout shifts.
 * The WebSocket invalidation system still ensures critical updates
 * (feature status changes, agent events) arrive in real-time.
 */
const MOBILE_STALE_MULTIPLIER = isMobileDevice ? 3 : 1;

/**
 * Default stale times for different data types.
 * On mobile, these are multiplied by MOBILE_STALE_MULTIPLIER to reduce
 * unnecessary network requests while WebSocket handles real-time updates.
 */
export const STALE_TIMES = {
  /** Features change frequently during auto-mode */
  FEATURES: 60 * 1000 * MOBILE_STALE_MULTIPLIER, // 1 min (3 min on mobile)
  /** GitHub data is relatively stable */
  GITHUB: 2 * 60 * 1000 * MOBILE_STALE_MULTIPLIER, // 2 min (6 min on mobile)
  /** Running agents state changes very frequently */
  RUNNING_AGENTS: 5 * 1000 * MOBILE_STALE_MULTIPLIER, // 5s (15s on mobile)
  /** Agent output changes during streaming */
  AGENT_OUTPUT: 5 * 1000 * MOBILE_STALE_MULTIPLIER, // 5s (15s on mobile)
  /** Usage data with polling */
  USAGE: 30 * 1000 * MOBILE_STALE_MULTIPLIER, // 30s (90s on mobile)
  /** Models rarely change */
  MODELS: 5 * 60 * 1000 * MOBILE_STALE_MULTIPLIER, // 5 min (15 min on mobile)
  /** CLI status rarely changes */
  CLI_STATUS: 5 * 60 * 1000 * MOBILE_STALE_MULTIPLIER, // 5 min (15 min on mobile)
  /** Settings are relatively stable */
  SETTINGS: 2 * 60 * 1000 * MOBILE_STALE_MULTIPLIER, // 2 min (6 min on mobile)
  /** Worktrees change during feature development */
  WORKTREES: 30 * 1000 * MOBILE_STALE_MULTIPLIER, // 30s (90s on mobile)
  /** Sessions rarely change */
  SESSIONS: 2 * 60 * 1000 * MOBILE_STALE_MULTIPLIER, // 2 min (6 min on mobile)
  /** Default for unspecified queries */
  DEFAULT: 30 * 1000 * MOBILE_STALE_MULTIPLIER, // 30s (90s on mobile)
} as const;

/**
 * Default garbage collection times (gcTime, formerly cacheTime).
 * On mobile, cache is kept longer so data persists across navigations
 * and component unmounts, preventing blank screens on re-mount.
 */
export const GC_TIMES = {
  /** Default garbage collection time - must exceed persist maxAge for cache to survive tab discard */
  DEFAULT: isMobileDevice ? 15 * 60 * 1000 : 10 * 60 * 1000, // 15 min on mobile, 10 min desktop
  /** Extended for expensive queries */
  EXTENDED: isMobileDevice ? 30 * 60 * 1000 : 15 * 60 * 1000, // 30 min on mobile, 15 min desktop
} as const;

/**
 * Global error handler for queries
 */
const handleQueryError = (error: Error) => {
  logger.error('Query error:', error);

  // Check for connection errors (server offline)
  if (isConnectionError(error)) {
    handleServerOffline();
    return;
  }

  // Don't toast for auth errors - those are handled by http-api-client
  if (error.message === 'Unauthorized') {
    return;
  }
};

/**
 * Global error handler for mutations
 */
const handleMutationError = (error: Error) => {
  logger.error('Mutation error:', error);

  // Check for connection errors
  if (isConnectionError(error)) {
    handleServerOffline();
    return;
  }

  // Don't toast for auth errors
  if (error.message === 'Unauthorized') {
    return;
  }

  // Show error toast for other errors
  toast.error('Operation failed', {
    description: error.message || 'An unexpected error occurred',
  });
};

/**
 * Create and configure the QueryClient singleton.
 *
 * Mobile optimizations:
 * - refetchOnWindowFocus disabled on mobile (prevents refetch storms when
 *   switching apps, which causes the blank screen + reload cycle)
 * - refetchOnMount uses 'always' on desktop but only refetches stale data
 *   on mobile (prevents unnecessary network requests on navigation)
 * - Longer stale times and GC times via STALE_TIMES and GC_TIMES above
 * - structuralSharing enabled to minimize re-renders when data hasn't changed
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIMES.DEFAULT,
      gcTime: GC_TIMES.DEFAULT,
      retry: (failureCount, error) => {
        // Don't retry on auth errors
        if (error instanceof Error && error.message === 'Unauthorized') {
          return false;
        }
        // Retry connection errors a few times before declaring server offline.
        // This handles transient network blips without immediately redirecting to login.
        if (isConnectionError(error)) {
          return failureCount < 3;
        }
        // Retry up to 2 times for other errors (3 on mobile for flaky connections)
        return failureCount < (isMobileDevice ? 3 : 2);
      },
      retryDelay: (attemptIndex, error) => {
        // Use shorter delays for connection errors to recover quickly from blips
        if (isConnectionError(error)) {
          return Math.min(1000 * 2 ** attemptIndex, 5000); // 1s, 2s, 4s (capped at 5s)
        }
        return Math.min(1000 * 2 ** attemptIndex, 30000);
      },
      // On mobile, disable refetch on focus to prevent the blank screen + reload
      // cycle that occurs when the user switches back to the app. WebSocket
      // invalidation handles real-time updates; polling handles the rest.
      refetchOnWindowFocus: !isMobileDevice,
      refetchOnReconnect: true,
      // On mobile, only refetch on mount if data is stale (true = refetch only when stale).
      // On desktop, always refetch on mount for freshest data ('always' = refetch even if fresh).
      // This prevents unnecessary network requests when navigating between
      // routes, which was causing blank screen flickers on mobile.
      refetchOnMount: isMobileDevice ? true : 'always',
      // Keep previous data visible while refetching to prevent blank flashes.
      // This is especially important on mobile where network is slower.
      placeholderData: isMobileDevice ? keepPreviousData : undefined,
    },
    mutations: {
      onError: handleMutationError,
      retry: false, // Don't auto-retry mutations
    },
  },
});

/**
 * Set up global query error handling
 * This catches errors that aren't handled by individual queries
 */
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'updated' && event.query.state.status === 'error') {
    const error = event.query.state.error;
    if (error instanceof Error) {
      handleQueryError(error);
    }
  }
});
