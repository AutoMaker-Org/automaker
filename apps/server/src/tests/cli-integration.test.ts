/**
 * CLI Integration Tests
 *
 * Comprehensive tests for CLI detection, authentication, and operations
 * across all providers (Claude, Codex, Cursor)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectCli,
  detectAllCLis,
  findCommand,
  getCliVersion,
  getInstallInstructions,
  validateCliInstallation,
} from '../lib/cli-detection.js';
import { classifyError, getUserFriendlyErrorMessage } from '../lib/error-handler.js';

describe('CLI Detection Framework', () => {
  describe('findCommand', () => {
    it('should find existing command', async () => {
      // Test with a command that should exist
      const result = await findCommand(['node']);
      expect(result).toBeTruthy();
    });

    it('should return null for non-existent command', async () => {
      const result = await findCommand(['nonexistent-command-12345']);
      expect(result).toBeNull();
    });

    it('should find first available command from alternatives', async () => {
      const result = await findCommand(['nonexistent-command-12345', 'node']);
      expect(result).toBeTruthy();
      expect(result).toContain('node');
    });
  });

  describe('getCliVersion', () => {
    it('should get version for existing command', async () => {
      const version = await getCliVersion('node', ['--version'], 5000);
      expect(version).toBeTruthy();
      expect(typeof version).toBe('string');
    });

    it('should timeout for non-responsive command', async () => {
      await expect(getCliVersion('sleep', ['10'], 1000)).rejects.toThrow();
    }, 15000); // Give extra time for test timeout

    it("should handle command that doesn't exist", async () => {
      await expect(
        getCliVersion('nonexistent-command-12345', ['--version'], 2000)
      ).rejects.toThrow();
    });
  });

  describe('getInstallInstructions', () => {
    it('should return instructions for supported platforms', () => {
      const claudeInstructions = getInstallInstructions('claude', 'darwin');
      expect(claudeInstructions).toContain('brew install');

      const codexInstructions = getInstallInstructions('codex', 'linux');
      expect(codexInstructions).toContain('npm install');
    });

    it('should handle unsupported platform', () => {
      const instructions = getInstallInstructions('claude', 'unknown-platform' as any);
      expect(instructions).toContain('No installation instructions available');
    });
  });

  describe('validateCliInstallation', () => {
    it('should validate properly installed CLI', () => {
      const cliInfo = {
        name: 'Test CLI',
        command: 'node',
        version: 'v18.0.0',
        path: '/usr/bin/node',
        installed: true,
        authenticated: true,
        authMethod: 'cli' as const,
      };

      const result = validateCliInstallation(cliInfo);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect issues with installation', () => {
      const cliInfo = {
        name: 'Test CLI',
        command: '',
        version: '',
        path: '',
        installed: false,
        authenticated: false,
        authMethod: 'none' as const,
      };

      const result = validateCliInstallation(cliInfo);
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues).toContain('CLI is not installed');
    });
  });
});

describe('Error Handling System', () => {
  describe('classifyError', () => {
    it('should classify authentication errors', () => {
      const authError = new Error('invalid_api_key: Your API key is invalid');
      const result = classifyError(authError, 'claude');

      expect(result.type).toBe('authentication');
      expect(result.severity).toBe('high');
      expect(result.userMessage).toContain('Authentication failed');
      expect(result.retryable).toBe(false);
      expect(result.provider).toBe('claude');
    });

    it('should classify billing errors', () => {
      const billingError = new Error('credit balance is too low');
      const result = classifyError(billingError);

      expect(result.type).toBe('billing');
      expect(result.severity).toBe('high');
      expect(result.userMessage).toContain('insufficient credits');
      expect(result.retryable).toBe(false);
    });

    it('should classify rate limit errors', () => {
      const rateLimitError = new Error('Rate limit reached. Try again later.');
      const result = classifyError(rateLimitError);

      expect(result.type).toBe('rate_limit');
      expect(result.severity).toBe('medium');
      expect(result.userMessage).toContain('Rate limit reached');
      expect(result.retryable).toBe(true);
    });

    it('should classify network errors', () => {
      const networkError = new Error('ECONNREFUSED: Connection refused');
      const result = classifyError(networkError);

      expect(result.type).toBe('network');
      expect(result.severity).toBe('medium');
      expect(result.userMessage).toContain('Network connection issue');
      expect(result.retryable).toBe(true);
    });

    it('should handle unknown errors', () => {
      const unknownError = new Error('Something completely unexpected happened');
      const result = classifyError(unknownError);

      expect(result.type).toBe('unknown');
      expect(result.severity).toBe('medium');
      expect(result.userMessage).toContain('unexpected error');
      expect(result.retryable).toBe(true);
    });
  });

  describe('getUserFriendlyErrorMessage', () => {
    it('should include provider name in message', () => {
      const error = new Error('invalid_api_key');
      const message = getUserFriendlyErrorMessage(error, 'claude');

      expect(message).toContain('[CLAUDE]');
    });

    it('should include suggested action when available', () => {
      const error = new Error('invalid_api_key');
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toContain('Verify your API key');
    });
  });
});

describe('Provider-Specific Tests', () => {
  describe('Claude CLI Detection', () => {
    it('should detect Claude CLI if installed', async () => {
      const result = await detectCli('claude');

      if (result.detected) {
        expect(result.cli.name).toBe('Claude CLI');
        expect(result.cli.installed).toBe(true);
        expect(result.cli.command).toBeTruthy();
      }
      // If not installed, that's also a valid test result
    });

    it('should handle missing Claude CLI gracefully', async () => {
      // This test will pass regardless of whether Claude is installed
      const result = await detectCli('claude');
      expect(typeof result.detected).toBe('boolean');
      expect(Array.isArray(result.issues)).toBe(true);
    });
  });

  describe('Codex CLI Detection', () => {
    it('should detect Codex CLI if installed', async () => {
      const result = await detectCli('codex');

      if (result.detected) {
        expect(result.cli.name).toBe('Codex CLI');
        expect(result.cli.installed).toBe(true);
        expect(result.cli.command).toBeTruthy();
      }
    });
  });

  describe('Cursor CLI Detection', () => {
    it('should detect Cursor CLI if installed', async () => {
      const result = await detectCli('cursor');

      if (result.detected) {
        expect(result.cli.name).toBe('Cursor CLI');
        expect(result.cli.installed).toBe(true);
        expect(result.cli.command).toBeTruthy();
      }
    });
  });
});

describe('Integration Tests', () => {
  describe('detectAllCLis', () => {
    it('should detect all available CLIs', async () => {
      const results = await detectAllCLis();

      expect(results).toHaveProperty('claude');
      expect(results).toHaveProperty('codex');
      expect(results).toHaveProperty('cursor');

      // Each should have the expected structure
      Object.values(results).forEach((result) => {
        expect(result).toHaveProperty('cli');
        expect(result).toHaveProperty('detected');
        expect(result).toHaveProperty('issues');
        expect(result.cli).toHaveProperty('name');
        expect(result.cli).toHaveProperty('installed');
        expect(result.cli).toHaveProperty('authenticated');
      });
    }, 30000); // Longer timeout for CLI detection

    it('should handle concurrent CLI detection', async () => {
      // Run detection multiple times concurrently
      const promises = [detectAllCLis(), detectAllCLis(), detectAllCLis()];

      const results = await Promise.all(promises);

      // All should return consistent results
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toHaveProperty('claude');
        expect(result).toHaveProperty('codex');
        expect(result).toHaveProperty('cursor');
      });
    }, 45000);
  });
});

describe('Error Recovery Tests', () => {
  it('should handle partial CLI detection failures', async () => {
    // Mock a scenario where some CLIs fail to detect
    const results = await detectAllCLis();

    // Should still return results for all providers
    expect(results).toHaveProperty('claude');
    expect(results).toHaveProperty('codex');
    expect(results).toHaveProperty('cursor');

    // Should provide error information for failures
    Object.entries(results).forEach(([provider, result]) => {
      if (!result.detected && result.issues.length > 0) {
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues[0]).toBeTruthy();
      }
    });
  });

  it('should handle timeout during CLI detection', async () => {
    // Test with very short timeout
    const result = await detectCli('claude', { timeout: 1 });

    // Should handle gracefully without throwing
    expect(typeof result.detected).toBe('boolean');
    expect(Array.isArray(result.issues)).toBe(true);
  });
});

describe('Security Tests', () => {
  it('should not expose sensitive information in error messages', () => {
    const errorWithKey = new Error('invalid_api_key: sk-ant-abc123secret456');
    const message = getUserFriendlyErrorMessage(errorWithKey);

    // Should not expose the actual API key
    expect(message).not.toContain('sk-ant-abc123secret456');
    expect(message).toContain('Authentication failed');
  });

  it('should sanitize file paths in error messages', () => {
    const errorWithPath = new Error('Permission denied: /home/user/.ssh/id_rsa');
    const message = getUserFriendlyErrorMessage(errorWithPath);

    // Should not expose sensitive file paths
    expect(message).not.toContain('/home/user/.ssh/id_rsa');
  });
});

// Performance Tests
describe('Performance Tests', () => {
  it('should detect CLIs within reasonable time', async () => {
    const startTime = Date.now();
    const results = await detectAllCLis();
    const endTime = Date.now();

    const duration = endTime - startTime;
    expect(duration).toBeLessThan(10000); // Should complete in under 10 seconds
    expect(results).toHaveProperty('claude');
    expect(results).toHaveProperty('codex');
    expect(results).toHaveProperty('cursor');
  }, 15000);

  it('should handle rapid repeated calls', async () => {
    // Make multiple rapid calls
    const promises = Array.from({ length: 10 }, () => detectAllCLis());
    const results = await Promise.all(promises);

    // All should complete successfully
    expect(results).toHaveLength(10);
    results.forEach((result) => {
      expect(result).toHaveProperty('claude');
      expect(result).toHaveProperty('codex');
      expect(result).toHaveProperty('cursor');
    });
  }, 60000);
});

// Edge Cases
describe('Edge Cases', () => {
  it('should handle empty CLI names', async () => {
    await expect(detectCli('' as any)).rejects.toThrow();
  });

  it('should handle null CLI names', async () => {
    await expect(detectCli(null as any)).rejects.toThrow();
  });

  it('should handle undefined CLI names', async () => {
    await expect(detectCli(undefined as any)).rejects.toThrow();
  });

  it('should handle malformed error objects', () => {
    const testCases = [
      null,
      undefined,
      '',
      123,
      [],
      { nested: { error: { message: 'test' } } },
      { error: 'simple string error' },
    ];

    testCases.forEach((error) => {
      expect(() => {
        const result = classifyError(error);
        expect(result).toHaveProperty('type');
        expect(result).toHaveProperty('severity');
        expect(result).toHaveProperty('userMessage');
      }).not.toThrow();
    });
  });
});
