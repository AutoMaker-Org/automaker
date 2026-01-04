import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LogLevel,
  createLogger,
  getLogLevel,
  setLogLevel,
  setColorsEnabled,
  setTimestampsEnabled,
} from '@automaker/utils';

describe('logger.ts', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };
  let originalLogLevel: LogLevel;

  beforeEach(() => {
    originalLogLevel = getLogLevel();
    // Disable colors and timestamps for predictable test output
    setColorsEnabled(false);
    setTimestampsEnabled(false);
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    setLogLevel(originalLogLevel);
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('LogLevel enum', () => {
    it('should have correct numeric values', () => {
      expect(LogLevel.ERROR).toBe(0);
      expect(LogLevel.WARN).toBe(1);
      expect(LogLevel.INFO).toBe(2);
      expect(LogLevel.DEBUG).toBe(3);
    });
  });

  describe('setLogLevel and getLogLevel', () => {
    it('should set and get log level', () => {
      setLogLevel(LogLevel.DEBUG);
      expect(getLogLevel()).toBe(LogLevel.DEBUG);

      setLogLevel(LogLevel.ERROR);
      expect(getLogLevel()).toBe(LogLevel.ERROR);
    });
  });

  describe('createLogger', () => {
    it('should create a logger with context prefix', () => {
      setLogLevel(LogLevel.INFO);
      const logger = createLogger('TestContext');

      logger.info('test message');

      // New format: 'LEVEL [Context]' as first arg, then message
      expect(consoleSpy.log).toHaveBeenCalledWith('INFO  [TestContext]', 'test message');
    });

    it('should log error at all log levels', () => {
      const logger = createLogger('Test');

      setLogLevel(LogLevel.ERROR);
      logger.error('error message');
      expect(consoleSpy.error).toHaveBeenCalledWith('ERROR [Test]', 'error message');
    });

    it('should log warn when level is WARN or higher', () => {
      const logger = createLogger('Test');

      setLogLevel(LogLevel.ERROR);
      logger.warn('warn message 1');
      expect(consoleSpy.log).not.toHaveBeenCalled();

      setLogLevel(LogLevel.WARN);
      logger.warn('warn message 2');
      // Note: warn uses console.log in Node.js implementation
      expect(consoleSpy.log).toHaveBeenCalledWith('WARN  [Test]', 'warn message 2');
    });

    it('should log info when level is INFO or higher', () => {
      const logger = createLogger('Test');

      setLogLevel(LogLevel.WARN);
      logger.info('info message 1');
      expect(consoleSpy.log).not.toHaveBeenCalled();

      setLogLevel(LogLevel.INFO);
      logger.info('info message 2');
      expect(consoleSpy.log).toHaveBeenCalledWith('INFO  [Test]', 'info message 2');
    });

    it('should log debug only when level is DEBUG', () => {
      const logger = createLogger('Test');

      setLogLevel(LogLevel.INFO);
      logger.debug('debug message 1');
      expect(consoleSpy.log).not.toHaveBeenCalled();

      setLogLevel(LogLevel.DEBUG);
      logger.debug('debug message 2');
      expect(consoleSpy.log).toHaveBeenCalledWith('DEBUG [Test]', 'debug message 2');
    });

    it('should pass multiple arguments to log functions', () => {
      setLogLevel(LogLevel.DEBUG);
      const logger = createLogger('Multi');

      logger.info('message', { data: 'value' }, 123);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        'INFO  [Multi]',
        'message',
        { data: 'value' },
        123
      );
    });

    it('should include timestamps when enabled', () => {
      setTimestampsEnabled(true);
      setLogLevel(LogLevel.INFO);
      const logger = createLogger('Timestamp');

      logger.info('test');

      // First arg should contain ISO timestamp format
      const firstArg = consoleSpy.log.mock.calls[0][0];
      expect(firstArg).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z INFO  \[Timestamp\]$/);
      expect(consoleSpy.log.mock.calls[0][1]).toBe('test');

      setTimestampsEnabled(false);
    });
  });
});
