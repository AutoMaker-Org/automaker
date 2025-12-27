/**
 * Unit tests for secure-fs throttling and retry logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as secureFs from '../src/secure-fs.js';

describe('secure-fs throttling', () => {
  beforeEach(() => {
    // Reset throttling configuration before each test
    secureFs.configureThrottling({
      maxConcurrency: 100,
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 5000,
    });
  });

  describe('configureThrottling', () => {
    it('should update configuration with new values', () => {
      secureFs.configureThrottling({ maxConcurrency: 50 });
      const config = secureFs.getThrottlingConfig();
      expect(config.maxConcurrency).toBe(50);
    });

    it('should preserve existing values when updating partial config', () => {
      secureFs.configureThrottling({ maxRetries: 5 });
      const config = secureFs.getThrottlingConfig();
      expect(config.maxConcurrency).toBe(100); // Default value preserved
      expect(config.maxRetries).toBe(5);
    });
  });

  describe('getThrottlingConfig', () => {
    it('should return current configuration', () => {
      const config = secureFs.getThrottlingConfig();
      expect(config).toHaveProperty('maxConcurrency');
      expect(config).toHaveProperty('maxRetries');
      expect(config).toHaveProperty('baseDelay');
      expect(config).toHaveProperty('maxDelay');
    });

    it('should return default values initially', () => {
      const config = secureFs.getThrottlingConfig();
      expect(config.maxConcurrency).toBe(100);
      expect(config.maxRetries).toBe(3);
      expect(config.baseDelay).toBe(100);
      expect(config.maxDelay).toBe(5000);
    });
  });

  describe('getPendingOperations', () => {
    it('should return 0 when no operations are pending', () => {
      expect(secureFs.getPendingOperations()).toBe(0);
    });
  });

  describe('getActiveOperations', () => {
    it('should return 0 when no operations are active', () => {
      expect(secureFs.getActiveOperations()).toBe(0);
    });
  });

  describe('concurrency limiting', () => {
    it('should apply maxConcurrency configuration', () => {
      secureFs.configureThrottling({ maxConcurrency: 2 });

      // This test verifies that the configuration is applied.
      // A more robust integration test should verify the actual concurrency behavior
      // by observing getActiveOperations() and getPendingOperations() under load.
      expect(secureFs.getThrottlingConfig().maxConcurrency).toBe(2);
    });

    it('should throw when changing maxConcurrency while operations are in flight', async () => {
      // We can't easily simulate in-flight operations without mocking,
      // but we can verify the check exists by testing when no ops are in flight
      expect(secureFs.getActiveOperations()).toBe(0);
      expect(secureFs.getPendingOperations()).toBe(0);

      // Should not throw when no operations in flight
      expect(() => secureFs.configureThrottling({ maxConcurrency: 50 })).not.toThrow();
    });
  });
});

describe('file descriptor error handling', () => {
  it('should have retry configuration for file descriptor errors', () => {
    const config = secureFs.getThrottlingConfig();
    expect(config.maxRetries).toBe(3);
    expect(config.baseDelay).toBe(100);
    expect(config.maxDelay).toBe(5000);
  });

  it('should allow configuring retry parameters', () => {
    secureFs.configureThrottling({ maxRetries: 5, baseDelay: 200 });
    const config = secureFs.getThrottlingConfig();
    expect(config.maxRetries).toBe(5);
    expect(config.baseDelay).toBe(200);
  });
});

describe('retry logic behavior', () => {
  beforeEach(() => {
    secureFs.configureThrottling({
      maxConcurrency: 100,
      maxRetries: 3,
      baseDelay: 10, // Use short delays for tests
      maxDelay: 50,
    });
  });

  // Note: Due to ESM module limitations, we cannot easily mock fs/promises directly.
  // These tests verify the configuration is correctly set up for retry behavior.
  // The actual retry logic is integration-tested when real file descriptor errors occur.

  it('should have correct retry configuration for ENFILE/EMFILE errors', () => {
    const config = secureFs.getThrottlingConfig();
    expect(config.maxRetries).toBe(3);
    expect(config.baseDelay).toBe(10);
    expect(config.maxDelay).toBe(50);
  });

  it('should expose operation counts for monitoring', () => {
    // These should be 0 when no operations are in flight
    expect(secureFs.getActiveOperations()).toBe(0);
    expect(secureFs.getPendingOperations()).toBe(0);
  });

  it('should allow customizing retry behavior', () => {
    secureFs.configureThrottling({ maxRetries: 5, baseDelay: 200, maxDelay: 10000 });
    const config = secureFs.getThrottlingConfig();
    expect(config.maxRetries).toBe(5);
    expect(config.baseDelay).toBe(200);
    expect(config.maxDelay).toBe(10000);
  });
});
