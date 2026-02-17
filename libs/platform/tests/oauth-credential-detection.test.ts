/**
 * Unit tests for OAuth credential detection scenarios
 *
 * Tests the various Claude credential detection formats including:
 * - Claude Code CLI OAuth format (claudeAiOauth)
 * - Legacy OAuth token format (oauth_token, access_token)
 * - API key format (api_key)
 * - Invalid/malformed credential files
 *
 * These tests use real temp directories to avoid complex fs mocking issues.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('OAuth Credential Detection', () => {
  let tempDir: string;
  let originalHomedir: () => string;
  let mockClaudeDir: string;
  let mockCodexDir: string;
  let mockOpenCodeDir: string;

  beforeEach(async () => {
    // Reset modules to get fresh state
    vi.resetModules();

    // Create a temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oauth-detection-test-'));

    // Create mock home directory structure
    mockClaudeDir = path.join(tempDir, '.claude');
    mockCodexDir = path.join(tempDir, '.codex');
    mockOpenCodeDir = path.join(tempDir, '.local', 'share', 'opencode');

    await fs.mkdir(mockClaudeDir, { recursive: true });
    await fs.mkdir(mockCodexDir, { recursive: true });
    await fs.mkdir(mockOpenCodeDir, { recursive: true });

    // Mock os.homedir to return our temp directory
    originalHomedir = os.homedir;
    vi.spyOn(os, 'homedir').mockReturnValue(tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getClaudeAuthIndicators', () => {
    it('should detect Claude Code CLI OAuth format (claudeAiOauth)', async () => {
      const credentialsContent = JSON.stringify({
        claudeAiOauth: {
          accessToken: 'oauth-access-token-12345',
          refreshToken: 'oauth-refresh-token-67890',
          expiresAt: Date.now() + 3600000,
        },
      });

      await fs.writeFile(path.join(mockClaudeDir, '.credentials.json'), credentialsContent);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      expect(indicators.hasCredentialsFile).toBe(true);
      expect(indicators.credentials).not.toBeNull();
      expect(indicators.credentials?.hasOAuthToken).toBe(true);
      expect(indicators.credentials?.hasApiKey).toBe(false);
    });

    it('should detect legacy OAuth token format (oauth_token)', async () => {
      const credentialsContent = JSON.stringify({
        oauth_token: 'legacy-oauth-token-abcdef',
      });

      await fs.writeFile(path.join(mockClaudeDir, '.credentials.json'), credentialsContent);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      expect(indicators.hasCredentialsFile).toBe(true);
      expect(indicators.credentials?.hasOAuthToken).toBe(true);
      expect(indicators.credentials?.hasApiKey).toBe(false);
    });

    it('should detect legacy access_token format', async () => {
      const credentialsContent = JSON.stringify({
        access_token: 'legacy-access-token-xyz',
      });

      await fs.writeFile(path.join(mockClaudeDir, '.credentials.json'), credentialsContent);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      expect(indicators.hasCredentialsFile).toBe(true);
      expect(indicators.credentials?.hasOAuthToken).toBe(true);
      expect(indicators.credentials?.hasApiKey).toBe(false);
    });

    it('should detect API key format', async () => {
      const credentialsContent = JSON.stringify({
        api_key: 'sk-ant-api03-xxxxxxxxxxxx',
      });

      await fs.writeFile(path.join(mockClaudeDir, '.credentials.json'), credentialsContent);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      expect(indicators.hasCredentialsFile).toBe(true);
      expect(indicators.credentials?.hasOAuthToken).toBe(false);
      expect(indicators.credentials?.hasApiKey).toBe(true);
    });

    it('should detect both OAuth and API key when present', async () => {
      const credentialsContent = JSON.stringify({
        claudeAiOauth: {
          accessToken: 'oauth-token',
          refreshToken: 'refresh-token',
        },
        api_key: 'sk-ant-api03-xxxxxxxxxxxx',
      });

      await fs.writeFile(path.join(mockClaudeDir, '.credentials.json'), credentialsContent);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      expect(indicators.hasCredentialsFile).toBe(true);
      expect(indicators.credentials?.hasOAuthToken).toBe(true);
      expect(indicators.credentials?.hasApiKey).toBe(true);
    });

    it('should handle missing credentials file gracefully', async () => {
      // No credentials file created
      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      expect(indicators.hasCredentialsFile).toBe(false);
      expect(indicators.credentials).toBeNull();
      expect(indicators.checks.credentialFiles).toBeDefined();
      expect(indicators.checks.credentialFiles.length).toBeGreaterThan(0);
      expect(indicators.checks.credentialFiles[0].exists).toBe(false);
    });

    it('should handle malformed JSON in credentials file', async () => {
      const malformedContent = '{ invalid json }';

      await fs.writeFile(path.join(mockClaudeDir, '.credentials.json'), malformedContent);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      // File exists but parsing fails
      expect(indicators.hasCredentialsFile).toBe(false);
      expect(indicators.credentials).toBeNull();
      expect(indicators.checks.credentialFiles[0].exists).toBe(true);
      expect(indicators.checks.credentialFiles[0].error).toContain('JSON parse error');
    });

    it('should handle empty credentials file', async () => {
      const emptyContent = JSON.stringify({});

      await fs.writeFile(path.join(mockClaudeDir, '.credentials.json'), emptyContent);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      // Empty credentials file ({}) should NOT be treated as having credentials
      // because it contains no actual tokens. This allows the system to continue
      // checking subsequent credential paths that might have valid tokens.
      expect(indicators.hasCredentialsFile).toBe(false);
      expect(indicators.credentials).toBeNull();
      // But the file should still show as existing and readable in the checks
      expect(indicators.checks.credentialFiles[0].exists).toBe(true);
      expect(indicators.checks.credentialFiles[0].readable).toBe(true);
    });

    it('should handle credentials file with null values', async () => {
      const nullContent = JSON.stringify({
        claudeAiOauth: null,
        api_key: null,
        oauth_token: null,
      });

      await fs.writeFile(path.join(mockClaudeDir, '.credentials.json'), nullContent);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      // File with all null values should NOT be treated as having credentials
      // because null values are not valid tokens
      expect(indicators.hasCredentialsFile).toBe(false);
      expect(indicators.credentials).toBeNull();
    });

    it('should handle credentials with empty string values', async () => {
      const emptyStrings = JSON.stringify({
        claudeAiOauth: {
          accessToken: '',
          refreshToken: '',
        },
        api_key: '',
      });

      await fs.writeFile(path.join(mockClaudeDir, '.credentials.json'), emptyStrings);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      // Empty strings should NOT be treated as having credentials
      // This allows checking subsequent credential paths for valid tokens
      expect(indicators.hasCredentialsFile).toBe(false);
      expect(indicators.credentials).toBeNull();
    });

    it('should detect settings file presence', async () => {
      await fs.writeFile(
        path.join(mockClaudeDir, 'settings.json'),
        JSON.stringify({ theme: 'dark' })
      );

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      expect(indicators.hasSettingsFile).toBe(true);
      expect(indicators.checks.settingsFile.exists).toBe(true);
      expect(indicators.checks.settingsFile.readable).toBe(true);
    });

    it('should detect stats cache with activity', async () => {
      const statsContent = JSON.stringify({
        dailyActivity: [
          { date: '2025-01-15', messagesCount: 10 },
          { date: '2025-01-16', messagesCount: 5 },
        ],
      });

      await fs.writeFile(path.join(mockClaudeDir, 'stats-cache.json'), statsContent);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      expect(indicators.hasStatsCacheWithActivity).toBe(true);
      expect(indicators.checks.statsCache.exists).toBe(true);
      expect(indicators.checks.statsCache.hasDailyActivity).toBe(true);
    });

    it('should detect stats cache without activity', async () => {
      const statsContent = JSON.stringify({
        dailyActivity: [],
      });

      await fs.writeFile(path.join(mockClaudeDir, 'stats-cache.json'), statsContent);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      expect(indicators.hasStatsCacheWithActivity).toBe(false);
      expect(indicators.checks.statsCache.exists).toBe(true);
      expect(indicators.checks.statsCache.hasDailyActivity).toBe(false);
    });

    it('should detect project sessions', async () => {
      const projectsDir = path.join(mockClaudeDir, 'projects');
      await fs.mkdir(projectsDir, { recursive: true });
      await fs.mkdir(path.join(projectsDir, 'session-1'));
      await fs.mkdir(path.join(projectsDir, 'session-2'));

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      expect(indicators.hasProjectsSessions).toBe(true);
      expect(indicators.checks.projectsDir.exists).toBe(true);
      expect(indicators.checks.projectsDir.entryCount).toBe(2);
    });

    it('should return comprehensive check details', async () => {
      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      // Verify all check detail objects are present
      expect(indicators.checks).toBeDefined();
      expect(indicators.checks.settingsFile).toBeDefined();
      expect(indicators.checks.settingsFile.path).toContain('settings.json');
      expect(indicators.checks.statsCache).toBeDefined();
      expect(indicators.checks.statsCache.path).toContain('stats-cache.json');
      expect(indicators.checks.projectsDir).toBeDefined();
      expect(indicators.checks.projectsDir.path).toContain('projects');
      expect(indicators.checks.credentialFiles).toBeDefined();
      expect(Array.isArray(indicators.checks.credentialFiles)).toBe(true);
    });

    it('should try both .credentials.json and credentials.json paths', async () => {
      // Write to credentials.json (without leading dot)
      const credentialsContent = JSON.stringify({
        api_key: 'sk-test-key',
      });

      await fs.writeFile(path.join(mockClaudeDir, 'credentials.json'), credentialsContent);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      // Should find credentials in the second path
      expect(indicators.hasCredentialsFile).toBe(true);
      expect(indicators.credentials?.hasApiKey).toBe(true);
    });

    it('should prefer first credentials file if both exist', async () => {
      // Write OAuth to .credentials.json (first path checked)
      await fs.writeFile(
        path.join(mockClaudeDir, '.credentials.json'),
        JSON.stringify({
          claudeAiOauth: {
            accessToken: 'oauth-token',
            refreshToken: 'refresh-token',
          },
        })
      );

      // Write API key to credentials.json (second path)
      await fs.writeFile(
        path.join(mockClaudeDir, 'credentials.json'),
        JSON.stringify({
          api_key: 'sk-test-key',
        })
      );

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      // Should use first file (.credentials.json) which has OAuth
      expect(indicators.hasCredentialsFile).toBe(true);
      expect(indicators.credentials?.hasOAuthToken).toBe(true);
      expect(indicators.credentials?.hasApiKey).toBe(false);
    });

    it('should check second credentials file if first file has no tokens', async () => {
      // Write empty/token-less content to .credentials.json (first path checked)
      // This tests the bug fix: previously, an empty JSON file would stop the search
      await fs.writeFile(path.join(mockClaudeDir, '.credentials.json'), JSON.stringify({}));

      // Write actual credentials to credentials.json (second path)
      await fs.writeFile(
        path.join(mockClaudeDir, 'credentials.json'),
        JSON.stringify({
          api_key: 'sk-test-key-from-second-file',
        })
      );

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      // Should find credentials in second file since first file has no tokens
      expect(indicators.hasCredentialsFile).toBe(true);
      expect(indicators.credentials?.hasApiKey).toBe(true);
    });
  });

  describe('getCodexAuthIndicators', () => {
    it('should detect OAuth token in Codex auth file', async () => {
      const authContent = JSON.stringify({
        access_token: 'codex-oauth-token-12345',
      });

      await fs.writeFile(path.join(mockCodexDir, 'auth.json'), authContent);

      const { getCodexAuthIndicators } = await import('../src/system-paths');
      const indicators = await getCodexAuthIndicators();

      expect(indicators.hasAuthFile).toBe(true);
      expect(indicators.hasOAuthToken).toBe(true);
      expect(indicators.hasApiKey).toBe(false);
    });

    it('should detect API key in Codex auth file', async () => {
      const authContent = JSON.stringify({
        OPENAI_API_KEY: 'sk-xxxxxxxxxxxxxxxx',
      });

      await fs.writeFile(path.join(mockCodexDir, 'auth.json'), authContent);

      const { getCodexAuthIndicators } = await import('../src/system-paths');
      const indicators = await getCodexAuthIndicators();

      expect(indicators.hasAuthFile).toBe(true);
      expect(indicators.hasOAuthToken).toBe(false);
      expect(indicators.hasApiKey).toBe(true);
    });

    it('should detect nested tokens in Codex auth file', async () => {
      const authContent = JSON.stringify({
        tokens: {
          oauth_token: 'nested-oauth-token',
        },
      });

      await fs.writeFile(path.join(mockCodexDir, 'auth.json'), authContent);

      const { getCodexAuthIndicators } = await import('../src/system-paths');
      const indicators = await getCodexAuthIndicators();

      expect(indicators.hasAuthFile).toBe(true);
      expect(indicators.hasOAuthToken).toBe(true);
    });

    it('should handle missing Codex auth file', async () => {
      // No auth file created
      const { getCodexAuthIndicators } = await import('../src/system-paths');
      const indicators = await getCodexAuthIndicators();

      expect(indicators.hasAuthFile).toBe(false);
      expect(indicators.hasOAuthToken).toBe(false);
      expect(indicators.hasApiKey).toBe(false);
    });

    it('should detect api_key field in Codex auth', async () => {
      const authContent = JSON.stringify({
        api_key: 'sk-api-key-value',
      });

      await fs.writeFile(path.join(mockCodexDir, 'auth.json'), authContent);

      const { getCodexAuthIndicators } = await import('../src/system-paths');
      const indicators = await getCodexAuthIndicators();

      expect(indicators.hasAuthFile).toBe(true);
      expect(indicators.hasApiKey).toBe(true);
    });
  });

  describe('getOpenCodeAuthIndicators', () => {
    it('should detect provider-specific OAuth credentials', async () => {
      const authContent = JSON.stringify({
        anthropic: {
          type: 'oauth',
          access: 'oauth-access-token',
          refresh: 'oauth-refresh-token',
        },
      });

      await fs.writeFile(path.join(mockOpenCodeDir, 'auth.json'), authContent);

      const { getOpenCodeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getOpenCodeAuthIndicators();

      expect(indicators.hasAuthFile).toBe(true);
      expect(indicators.hasOAuthToken).toBe(true);
      expect(indicators.hasApiKey).toBe(false);
    });

    it('should detect GitHub Copilot refresh token as OAuth', async () => {
      const authContent = JSON.stringify({
        'github-copilot': {
          type: 'oauth',
          access: '', // Empty access token
          refresh: 'gh-refresh-token', // But has refresh token
        },
      });

      await fs.writeFile(path.join(mockOpenCodeDir, 'auth.json'), authContent);

      const { getOpenCodeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getOpenCodeAuthIndicators();

      expect(indicators.hasAuthFile).toBe(true);
      expect(indicators.hasOAuthToken).toBe(true);
    });

    it('should detect provider-specific API key credentials', async () => {
      const authContent = JSON.stringify({
        openai: {
          type: 'api_key',
          key: 'sk-xxxxxxxxxxxx',
        },
      });

      await fs.writeFile(path.join(mockOpenCodeDir, 'auth.json'), authContent);

      const { getOpenCodeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getOpenCodeAuthIndicators();

      expect(indicators.hasAuthFile).toBe(true);
      expect(indicators.hasOAuthToken).toBe(false);
      expect(indicators.hasApiKey).toBe(true);
    });

    it('should detect multiple providers', async () => {
      const authContent = JSON.stringify({
        anthropic: {
          type: 'oauth',
          access: 'anthropic-token',
          refresh: 'refresh-token',
        },
        openai: {
          type: 'api_key',
          key: 'sk-xxxxxxxxxxxx',
        },
      });

      await fs.writeFile(path.join(mockOpenCodeDir, 'auth.json'), authContent);

      const { getOpenCodeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getOpenCodeAuthIndicators();

      expect(indicators.hasAuthFile).toBe(true);
      expect(indicators.hasOAuthToken).toBe(true);
      expect(indicators.hasApiKey).toBe(true);
    });

    it('should handle missing OpenCode auth file', async () => {
      // No auth file created
      const { getOpenCodeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getOpenCodeAuthIndicators();

      expect(indicators.hasAuthFile).toBe(false);
      expect(indicators.hasOAuthToken).toBe(false);
      expect(indicators.hasApiKey).toBe(false);
    });

    it('should handle legacy top-level OAuth keys', async () => {
      const authContent = JSON.stringify({
        access_token: 'legacy-access-token',
      });

      await fs.writeFile(path.join(mockOpenCodeDir, 'auth.json'), authContent);

      const { getOpenCodeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getOpenCodeAuthIndicators();

      expect(indicators.hasAuthFile).toBe(true);
      expect(indicators.hasOAuthToken).toBe(true);
    });

    it('should detect copilot provider OAuth', async () => {
      const authContent = JSON.stringify({
        copilot: {
          type: 'oauth',
          access: 'copilot-access-token',
          refresh: 'copilot-refresh-token',
        },
      });

      await fs.writeFile(path.join(mockOpenCodeDir, 'auth.json'), authContent);

      const { getOpenCodeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getOpenCodeAuthIndicators();

      expect(indicators.hasAuthFile).toBe(true);
      expect(indicators.hasOAuthToken).toBe(true);
    });
  });

  describe('Credential path helpers', () => {
    it('should return correct Claude credential paths', async () => {
      const { getClaudeCredentialPaths, getClaudeConfigDir } = await import('../src/system-paths');

      const configDir = getClaudeConfigDir();
      expect(configDir).toContain('.claude');

      const credPaths = getClaudeCredentialPaths();
      expect(credPaths.length).toBeGreaterThan(0);
      expect(credPaths.some((p) => p.includes('.credentials.json'))).toBe(true);
      expect(credPaths.some((p) => p.includes('credentials.json'))).toBe(true);
    });

    it('should return correct Codex auth path', async () => {
      const { getCodexAuthPath, getCodexConfigDir } = await import('../src/system-paths');

      const configDir = getCodexConfigDir();
      expect(configDir).toContain('.codex');

      const authPath = getCodexAuthPath();
      expect(authPath).toContain('.codex');
      expect(authPath).toContain('auth.json');
    });

    it('should return correct OpenCode auth path', async () => {
      const { getOpenCodeAuthPath, getOpenCodeConfigDir } = await import('../src/system-paths');

      const configDir = getOpenCodeConfigDir();
      expect(configDir).toContain('opencode');

      const authPath = getOpenCodeAuthPath();
      expect(authPath).toContain('opencode');
      expect(authPath).toContain('auth.json');
    });
  });

  describe('Edge cases for credential detection', () => {
    it('should handle credentials file with unexpected structure', async () => {
      const unexpectedContent = JSON.stringify({
        someUnexpectedKey: 'value',
        nested: {
          deeply: {
            unexpected: true,
          },
        },
      });

      await fs.writeFile(path.join(mockClaudeDir, '.credentials.json'), unexpectedContent);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      // File with unexpected structure but no valid tokens should NOT be treated as having credentials
      expect(indicators.hasCredentialsFile).toBe(false);
      expect(indicators.credentials).toBeNull();
    });

    it('should handle array instead of object in credentials', async () => {
      const arrayContent = JSON.stringify(['token1', 'token2']);

      await fs.writeFile(path.join(mockClaudeDir, '.credentials.json'), arrayContent);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      // Array is valid JSON but wrong structure - no valid tokens, so not treated as credentials file
      expect(indicators.hasCredentialsFile).toBe(false);
      expect(indicators.credentials).toBeNull();
    });

    it('should handle numeric values in credential fields', async () => {
      const numericContent = JSON.stringify({
        api_key: 12345,
        oauth_token: 67890,
      });

      await fs.writeFile(path.join(mockClaudeDir, '.credentials.json'), numericContent);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      // Note: Current implementation uses JavaScript truthiness which accepts numbers
      // This documents the actual behavior - ideally would validate string type
      expect(indicators.hasCredentialsFile).toBe(true);
      // The implementation checks truthiness, not strict string type
      expect(indicators.credentials?.hasOAuthToken).toBe(true);
      expect(indicators.credentials?.hasApiKey).toBe(true);
    });

    it('should handle boolean values in credential fields', async () => {
      const booleanContent = JSON.stringify({
        api_key: true,
        oauth_token: false,
      });

      await fs.writeFile(path.join(mockClaudeDir, '.credentials.json'), booleanContent);

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      // Note: Current implementation uses JavaScript truthiness
      // api_key: true is truthy, oauth_token: false is falsy
      expect(indicators.hasCredentialsFile).toBe(true);
      expect(indicators.credentials?.hasOAuthToken).toBe(false); // false is falsy
      expect(indicators.credentials?.hasApiKey).toBe(true); // true is truthy
    });

    it('should handle malformed stats-cache.json gracefully', async () => {
      await fs.writeFile(path.join(mockClaudeDir, 'stats-cache.json'), '{ invalid json }');

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      expect(indicators.hasStatsCacheWithActivity).toBe(false);
      expect(indicators.checks.statsCache.exists).toBe(true);
      expect(indicators.checks.statsCache.error).toBeDefined();
    });

    it('should handle empty projects directory', async () => {
      const projectsDir = path.join(mockClaudeDir, 'projects');
      await fs.mkdir(projectsDir, { recursive: true });

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      expect(indicators.hasProjectsSessions).toBe(false);
      expect(indicators.checks.projectsDir.exists).toBe(true);
      expect(indicators.checks.projectsDir.entryCount).toBe(0);
    });
  });

  describe('Combined authentication scenarios', () => {
    it('should detect CLI authenticated state with settings + sessions', async () => {
      // Create settings file
      await fs.writeFile(
        path.join(mockClaudeDir, 'settings.json'),
        JSON.stringify({ theme: 'dark' })
      );

      // Create projects directory with sessions
      const projectsDir = path.join(mockClaudeDir, 'projects');
      await fs.mkdir(projectsDir, { recursive: true });
      await fs.mkdir(path.join(projectsDir, 'session-1'));

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      expect(indicators.hasSettingsFile).toBe(true);
      expect(indicators.hasProjectsSessions).toBe(true);
    });

    it('should detect recent activity indicating working auth', async () => {
      // Create stats cache with recent activity
      await fs.writeFile(
        path.join(mockClaudeDir, 'stats-cache.json'),
        JSON.stringify({
          dailyActivity: [{ date: new Date().toISOString().split('T')[0], messagesCount: 10 }],
        })
      );

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      expect(indicators.hasStatsCacheWithActivity).toBe(true);
    });

    it('should handle complete auth setup', async () => {
      // Create all auth indicators
      await fs.writeFile(
        path.join(mockClaudeDir, '.credentials.json'),
        JSON.stringify({
          claudeAiOauth: {
            accessToken: 'token',
            refreshToken: 'refresh',
          },
        })
      );
      await fs.writeFile(
        path.join(mockClaudeDir, 'settings.json'),
        JSON.stringify({ theme: 'dark' })
      );
      await fs.writeFile(
        path.join(mockClaudeDir, 'stats-cache.json'),
        JSON.stringify({ dailyActivity: [{ date: '2025-01-15', messagesCount: 5 }] })
      );
      const projectsDir = path.join(mockClaudeDir, 'projects');
      await fs.mkdir(projectsDir, { recursive: true });
      await fs.mkdir(path.join(projectsDir, 'session-1'));

      const { getClaudeAuthIndicators } = await import('../src/system-paths');
      const indicators = await getClaudeAuthIndicators();

      expect(indicators.hasCredentialsFile).toBe(true);
      expect(indicators.hasSettingsFile).toBe(true);
      expect(indicators.hasStatsCacheWithActivity).toBe(true);
      expect(indicators.hasProjectsSessions).toBe(true);
      expect(indicators.credentials?.hasOAuthToken).toBe(true);
    });
  });
});
