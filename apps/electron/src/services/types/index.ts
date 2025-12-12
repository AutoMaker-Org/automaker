/**
 * Common types shared across all services
 */

/**
 * Standard result type for service operations
 */
export interface ServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Subscription handle for event cleanup
 */
export interface Subscription {
  unsubscribe: () => void;
}

/**
 * Service lifecycle interface
 */
export interface IService {
  initialize?(): Promise<void>;
  dispose?(): void;
}
