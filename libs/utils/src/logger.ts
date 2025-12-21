/**
 * Simple logger utility with log levels
 * Configure via LOG_LEVEL environment variable: error, warn, info, debug
 * Defaults to 'info' if not set
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

const LOG_LEVEL_NAMES: Record<string, LogLevel> = {
  error: LogLevel.ERROR,
  warn: LogLevel.WARN,
  info: LogLevel.INFO,
  debug: LogLevel.DEBUG,
};

let currentLogLevel: LogLevel = LogLevel.INFO;

// Initialize log level from environment variable
const envLogLevel = process.env.LOG_LEVEL?.toLowerCase();
if (envLogLevel && LOG_LEVEL_NAMES[envLogLevel] !== undefined) {
  currentLogLevel = LOG_LEVEL_NAMES[envLogLevel];
}

/**
 * Create a logger instance with a context prefix
 */
export function createLogger(context: string) {
  const prefix = `[${context}]`;

  return {
    error: (...args: unknown[]): void => {
      if (currentLogLevel >= LogLevel.ERROR) {
        console.error(prefix, ...args);
      }
    },

    warn: (...args: unknown[]): void => {
      if (currentLogLevel >= LogLevel.WARN) {
        console.warn(prefix, ...args);
      }
    },

    info: (...args: unknown[]): void => {
      if (currentLogLevel >= LogLevel.INFO) {
        console.log(prefix, ...args);
      }
    },

    debug: (...args: unknown[]): void => {
      if (currentLogLevel >= LogLevel.DEBUG) {
        console.log(prefix, "[DEBUG]", ...args);
      }
    },
  };
}

/**
 * Get the current log level
 */
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

/**
 * Set the log level programmatically (useful for testing)
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}
