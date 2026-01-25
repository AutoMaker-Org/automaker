/**
 * React Query Client Configuration
 *
 * Central configuration for TanStack React Query.
 * Provides default options for queries and mutations including
 * caching, retries, and error handling.
 */

import { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createLogger } from '@automaker/utils/logger';
import { isConnectionError, handleServerOffline } from './http-api-client';

const logger = createLogger('QueryClient');

/**
 * Default stale times for different data types
 */
export const STALE_TIMES = {
  /** Features change frequently during auto-mode */
  FEATURES: 60 * 1000, // 1 minute
  /** GitHub data is relatively stable */
  GITHUB: 2 * 60 * 1000, // 2 minutes
  /** Running agents state changes very frequently */
  RUNNING_AGENTS: 5 * 1000, // 5 seconds
  /** Agent output changes during streaming */
  AGENT_OUTPUT: 5 * 1000, // 5 seconds
  /** Usage data with polling */
  USAGE: 30 * 1000, // 30 seconds
  /** Models rarely change */
  MODELS: 5 * 60 * 1000, // 5 minutes
  /** CLI status rarely changes */
  CLI_STATUS: 5 * 60 * 1000, // 5 minutes
  /** Settings are relatively stable */
  SETTINGS: 2 * 60 * 1000, // 2 minutes
  /** Worktrees change during feature development */
  WORKTREES: 30 * 1000, // 30 seconds
  /** Sessions rarely change */
  SESSIONS: 2 * 60 * 1000, // 2 minutes
  /** Default for unspecified queries */
  DEFAULT: 30 * 1000, // 30 seconds
} as const;

/**
 * Default garbage collection times (gcTime, formerly cacheTime)
 */
export const GC_TIMES = {
  /** Default garbage collection time */
  DEFAULT: 5 * 60 * 1000, // 5 minutes
  /** Extended for expensive queries */
  EXTENDED: 10 * 60 * 1000, // 10 minutes
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
 * Create and configure the QueryClient singleton
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
        // Don't retry on connection errors (server offline)
        if (isConnectionError(error)) {
          return false;
        }
        // Retry up to 2 times for other errors
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // Don't refetch on mount if data is fresh
      refetchOnMount: true,
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
