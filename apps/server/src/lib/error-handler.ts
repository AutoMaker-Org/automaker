/**
 * Unified Error Handling System for CLI Providers
 *
 * Provides consistent error classification, user-friendly messages, and debugging support
 * across all AI providers (Claude, Codex, Cursor)
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('ErrorHandler');

export enum ErrorType {
  AUTHENTICATION = 'authentication',
  BILLING = 'billing',
  RATE_LIMIT = 'rate_limit',
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  VALIDATION = 'validation',
  PERMISSION = 'permission',
  CLI_NOT_FOUND = 'cli_not_found',
  CLI_NOT_INSTALLED = 'cli_not_installed',
  MODEL_NOT_SUPPORTED = 'model_not_supported',
  INVALID_REQUEST = 'invalid_request',
  SERVER_ERROR = 'server_error',
  UNKNOWN = 'unknown',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorClassification {
  type: ErrorType;
  severity: ErrorSeverity;
  userMessage: string;
  technicalMessage: string;
  suggestedAction?: string;
  retryable: boolean;
  provider?: string;
  context?: Record<string, any>;
}

export interface ErrorPattern {
  type: ErrorType;
  severity: ErrorSeverity;
  patterns: RegExp[];
  userMessage: string;
  suggestedAction?: string;
  retryable: boolean;
}

/**
 * Error patterns for different types of errors
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // Authentication errors
  {
    type: ErrorType.AUTHENTICATION,
    severity: ErrorSeverity.HIGH,
    patterns: [
      /unauthorized/i,
      /authentication.*fail/i,
      /invalid_api_key/i,
      /invalid api key/i,
      /not authenticated/i,
      /please.*log/i,
      /token.*revoked/i,
      /oauth.*error/i,
      /credentials.*invalid/i,
    ],
    userMessage: 'Authentication failed. Please check your API key or login credentials.',
    suggestedAction:
      "Verify your API key is correct and hasn't expired, or run the CLI login command.",
    retryable: false,
  },

  // Billing errors
  {
    type: ErrorType.BILLING,
    severity: ErrorSeverity.HIGH,
    patterns: [
      /credit.*balance.*low/i,
      /insufficient.*credit/i,
      /billing.*issue/i,
      /payment.*required/i,
      /usage.*exceeded/i,
      /quota.*exceeded/i,
      /add.*credit/i,
    ],
    userMessage: 'Account has insufficient credits or billing issues.',
    suggestedAction: 'Please add credits to your account or check your billing settings.',
    retryable: false,
  },

  // Rate limit errors
  {
    type: ErrorType.RATE_LIMIT,
    severity: ErrorSeverity.MEDIUM,
    patterns: [
      /rate.*limit/i,
      /too.*many.*request/i,
      /limit.*reached/i,
      /try.*later/i,
      /429/i,
      /reset.*time/i,
      /upgrade.*plan/i,
    ],
    userMessage: 'Rate limit reached. Please wait before trying again.',
    suggestedAction: 'Wait a few minutes before retrying, or consider upgrading your plan.',
    retryable: true,
  },

  // Network errors
  {
    type: ErrorType.NETWORK,
    severity: ErrorSeverity.MEDIUM,
    patterns: [/network/i, /connection/i, /dns/i, /timeout/i, /econnrefused/i, /enotfound/i],
    userMessage: 'Network connection issue.',
    suggestedAction: 'Check your internet connection and try again.',
    retryable: true,
  },

  // Timeout errors
  {
    type: ErrorType.TIMEOUT,
    severity: ErrorSeverity.MEDIUM,
    patterns: [/timeout/i, /aborted/i, /time.*out/i],
    userMessage: 'Operation timed out.',
    suggestedAction: 'Try again with a simpler request or check your connection.',
    retryable: true,
  },

  // Permission errors
  {
    type: ErrorType.PERMISSION,
    severity: ErrorSeverity.HIGH,
    patterns: [/permission.*denied/i, /access.*denied/i, /forbidden/i, /403/i, /not.*authorized/i],
    userMessage: 'Permission denied.',
    suggestedAction: 'Check if you have the required permissions for this operation.',
    retryable: false,
  },

  // CLI not found
  {
    type: ErrorType.CLI_NOT_FOUND,
    severity: ErrorSeverity.HIGH,
    patterns: [/command not found/i, /not recognized/i, /not.*installed/i, /ENOENT/i],
    userMessage: 'CLI tool not found.',
    suggestedAction: "Please install the required CLI tool and ensure it's in your PATH.",
    retryable: false,
  },

  // Model not supported
  {
    type: ErrorType.MODEL_NOT_SUPPORTED,
    severity: ErrorSeverity.HIGH,
    patterns: [/model.*not.*support/i, /unknown.*model/i, /invalid.*model/i],
    userMessage: 'Model not supported.',
    suggestedAction: 'Check available models and use a supported one.',
    retryable: false,
  },

  // Server errors
  {
    type: ErrorType.SERVER_ERROR,
    severity: ErrorSeverity.HIGH,
    patterns: [/internal.*server/i, /server.*error/i, /500/i, /502/i, /503/i, /504/i],
    userMessage: 'Server error occurred.',
    suggestedAction: 'Try again in a few minutes or contact support if the issue persists.',
    retryable: true,
  },
];

/**
 * Classify an error into a specific type with user-friendly message
 */
export function classifyError(
  error: unknown,
  provider?: string,
  context?: Record<string, any>
): ErrorClassification {
  const errorText = getErrorText(error);

  // Try to match against known patterns
  for (const pattern of ERROR_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(errorText)) {
        return {
          type: pattern.type,
          severity: pattern.severity,
          userMessage: pattern.userMessage,
          technicalMessage: errorText,
          suggestedAction: pattern.suggestedAction,
          retryable: pattern.retryable,
          provider,
          context,
        };
      }
    }
  }

  // Unknown error
  return {
    type: ErrorType.UNKNOWN,
    severity: ErrorSeverity.MEDIUM,
    userMessage: 'An unexpected error occurred.',
    technicalMessage: errorText,
    suggestedAction: 'Please try again or contact support if the issue persists.',
    retryable: true,
    provider,
    context,
  };
}

/**
 * Get a user-friendly error message
 */
export function getUserFriendlyErrorMessage(error: unknown, provider?: string): string {
  const classification = classifyError(error, provider);

  let message = classification.userMessage;

  if (classification.suggestedAction) {
    message += ` ${classification.suggestedAction}`;
  }

  // Add provider-specific context if available
  if (provider) {
    message = `[${provider.toUpperCase()}] ${message}`;
  }

  return message;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const classification = classifyError(error);
  return classification.retryable;
}

/**
 * Check if an error is authentication-related
 */
export function isAuthenticationError(error: unknown): boolean {
  const classification = classifyError(error);
  return classification.type === ErrorType.AUTHENTICATION;
}

/**
 * Check if an error is billing-related
 */
export function isBillingError(error: unknown): boolean {
  const classification = classifyError(error);
  return classification.type === ErrorType.BILLING;
}

/**
 * Check if an error is rate limit related
 */
export function isRateLimitError(error: unknown): boolean {
  const classification = classifyError(error);
  return classification.type === ErrorType.RATE_LIMIT;
}

/**
 * Get error text from various error types
 */
function getErrorText(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    // Handle structured error objects
    const errorObj = error as any;

    if (errorObj.message) {
      return errorObj.message;
    }

    if (errorObj.error?.message) {
      return errorObj.error.message;
    }

    if (errorObj.error) {
      return typeof errorObj.error === 'string' ? errorObj.error : JSON.stringify(errorObj.error);
    }

    return JSON.stringify(error);
  }

  return String(error);
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: unknown,
  provider?: string,
  context?: Record<string, any>
): {
  success: false;
  error: string;
  errorType: ErrorType;
  severity: ErrorSeverity;
  retryable: boolean;
  suggestedAction?: string;
} {
  const classification = classifyError(error, provider, context);

  return {
    success: false,
    error: classification.userMessage,
    errorType: classification.type,
    severity: classification.severity,
    retryable: classification.retryable,
    suggestedAction: classification.suggestedAction,
  };
}

/**
 * Log error with full context
 */
export function logError(
  error: unknown,
  provider?: string,
  operation?: string,
  additionalContext?: Record<string, any>
): void {
  const classification = classifyError(error, provider, {
    operation,
    ...additionalContext,
  });

  logger.error(`Error in ${provider || 'unknown'}${operation ? ` during ${operation}` : ''}`, {
    type: classification.type,
    severity: classification.severity,
    message: classification.userMessage,
    technicalMessage: classification.technicalMessage,
    retryable: classification.retryable,
    suggestedAction: classification.suggestedAction,
    context: classification.context,
  });
}

/**
 * Provider-specific error handlers
 */
export const ProviderErrorHandler = {
  claude: {
    classify: (error: unknown) => classifyError(error, 'claude'),
    getUserMessage: (error: unknown) => getUserFriendlyErrorMessage(error, 'claude'),
    isAuth: (error: unknown) => isAuthenticationError(error),
    isBilling: (error: unknown) => isBillingError(error),
    isRateLimit: (error: unknown) => isRateLimitError(error),
  },

  codex: {
    classify: (error: unknown) => classifyError(error, 'codex'),
    getUserMessage: (error: unknown) => getUserFriendlyErrorMessage(error, 'codex'),
    isAuth: (error: unknown) => isAuthenticationError(error),
    isBilling: (error: unknown) => isBillingError(error),
    isRateLimit: (error: unknown) => isRateLimitError(error),
  },

  cursor: {
    classify: (error: unknown) => classifyError(error, 'cursor'),
    getUserMessage: (error: unknown) => getUserFriendlyErrorMessage(error, 'cursor'),
    isAuth: (error: unknown) => isAuthenticationError(error),
    isBilling: (error: unknown) => isBillingError(error),
    isRateLimit: (error: unknown) => isRateLimitError(error),
  },
};

/**
 * Create a retry handler for retryable errors
 */
export function createRetryHandler(maxRetries: number = 3, baseDelay: number = 1000) {
  return async function <T>(
    operation: () => Promise<T>,
    shouldRetry: (error: unknown) => boolean = isRetryableError
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries || !shouldRetry(error)) {
          throw error;
        }

        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        logger.debug(`Retrying operation in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  };
}
