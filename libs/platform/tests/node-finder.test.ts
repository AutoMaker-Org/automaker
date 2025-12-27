import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findNodeExecutable, buildEnhancedPath } from '../src/node-finder.js';
import path from 'path';
import fs from 'fs';

describe('node-finder', () => {
  describe('version sorting and pre-release filtering', () => {
    // Test the PRE_RELEASE_PATTERN logic indirectly
    const PRE_RELEASE_PATTERN = /-(beta|rc|alpha|nightly|canary|dev|pre)/i;

    it('should identify pre-release versions correctly', () => {
      const preReleaseVersions = [
        'v20.0.0-beta',
        'v18.17.0-rc1',
        'v19.0.0-alpha',
        'v21.0.0-nightly',
        'v20.0.0-canary',
        'v18.0.0-dev',
        'v17.0.0-pre',
      ];

      for (const version of preReleaseVersions) {
        expect(PRE_RELEASE_PATTERN.test(version)).toBe(true);
      }
    });

    it('should not match stable versions as pre-release', () => {
      const stableVersions = ['v18.17.0', 'v20.10.0', 'v16.20.2', '18.17.0', 'v21.0.0'];

      for (const version of stableVersions) {
        expect(PRE_RELEASE_PATTERN.test(version)).toBe(false);
      }
    });

    it('should sort versions with numeric comparison', () => {
      const versions = ['v18.9.0', 'v18.17.0', 'v20.0.0', 'v8.0.0'];
      const sorted = [...versions].sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })
      );

      expect(sorted).toEqual(['v20.0.0', 'v18.17.0', 'v18.9.0', 'v8.0.0']);
    });

    it('should prefer stable over pre-release when filtering', () => {
      const allVersions = ['v20.0.0-beta', 'v19.9.9', 'v18.17.0', 'v21.0.0-rc1'];

      const stableVersions = allVersions.filter((v) => !PRE_RELEASE_PATTERN.test(v));
      const preReleaseVersions = allVersions.filter((v) => PRE_RELEASE_PATTERN.test(v));
      const prioritized = [...stableVersions, ...preReleaseVersions];

      // Stable versions should come first
      expect(prioritized[0]).toBe('v19.9.9');
      expect(prioritized[1]).toBe('v18.17.0');
      // Pre-release versions should come after
      expect(prioritized[2]).toBe('v20.0.0-beta');
      expect(prioritized[3]).toBe('v21.0.0-rc1');
    });
  });

  describe('findNodeExecutable', () => {
    it("should return 'node' with fallback source when skipSearch is true", () => {
      const result = findNodeExecutable({ skipSearch: true });

      expect(result.nodePath).toBe('node');
      expect(result.source).toBe('fallback');
    });

    it('should call logger when node is found', () => {
      const logger = vi.fn();
      findNodeExecutable({ logger });

      // Logger should be called at least once (either found or fallback message)
      expect(logger).toHaveBeenCalled();
    });

    it('should return a valid NodeFinderResult structure', () => {
      const result = findNodeExecutable();

      expect(result).toHaveProperty('nodePath');
      expect(result).toHaveProperty('source');
      expect(typeof result.nodePath).toBe('string');
      expect(result.nodePath.length).toBeGreaterThan(0);
    });

    it('should find node on the current system', () => {
      // This test verifies that node can be found on the test machine
      const result = findNodeExecutable();

      // Should find node since we're running in Node.js
      expect(result.nodePath).toBeDefined();

      // Source should be one of the valid sources
      const validSources = [
        'homebrew',
        'system',
        'nvm',
        'fnm',
        'nvm-windows',
        'program-files',
        'scoop',
        'chocolatey',
        'which',
        'where',
        'fallback',
      ];
      expect(validSources).toContain(result.source);
    });

    it('should find an executable node binary', () => {
      const result = findNodeExecutable();

      // Skip this test if fallback is used (node not found via path search)
      if (result.source === 'fallback') {
        expect(result.nodePath).toBe('node');
        return;
      }

      // Verify the found path is actually executable
      if (process.platform === 'win32') {
        // On Windows, just check file exists (X_OK is not meaningful)
        expect(() => fs.accessSync(result.nodePath, fs.constants.F_OK)).not.toThrow();
      } else {
        // On Unix-like systems, verify execute permission
        expect(() => fs.accessSync(result.nodePath, fs.constants.X_OK)).not.toThrow();
      }
    });
  });

  describe('buildEnhancedPath', () => {
    const delimiter = path.delimiter;

    it("should return current path unchanged when nodePath is 'node'", () => {
      const currentPath = `/usr/bin${delimiter}/usr/local/bin`;
      const result = buildEnhancedPath('node', currentPath);

      expect(result).toBe(currentPath);
    });

    it("should return empty string when nodePath is 'node' and currentPath is empty", () => {
      const result = buildEnhancedPath('node', '');

      expect(result).toBe('');
    });

    it('should prepend node directory to path', () => {
      const nodePath = '/opt/homebrew/bin/node';
      const currentPath = `/usr/bin${delimiter}/usr/local/bin`;

      const result = buildEnhancedPath(nodePath, currentPath);

      expect(result).toBe(`/opt/homebrew/bin${delimiter}${currentPath}`);
    });

    it('should not duplicate node directory if already in path', () => {
      // Use platform-appropriate paths and delimiter
      const isWindows = process.platform === 'win32';
      const delimiter = path.delimiter;
      const nodePath = '/usr/local/bin/node';
      const currentPath = `/usr/local/bin${delimiter}/usr/bin`;

      if (isWindows) {
        const nodePath = 'C:\\Program Files\\nodejs\\node.exe';
        const currentPath = `C:\\Program Files\\nodejs${delimiter}C:\\Windows\\System32`;

        const result = buildEnhancedPath(nodePath, currentPath);

        expect(result).toBe(currentPath);
      } else {
        const nodePath = '/usr/local/bin/node';
        const currentPath = `/usr/local/bin${delimiter}/usr/bin`;

        const result = buildEnhancedPath(nodePath, currentPath);

        expect(result).toBe(currentPath);
      }
    });

    it('should handle empty currentPath without trailing delimiter', () => {
      const nodePath = '/opt/homebrew/bin/node';

      const result = buildEnhancedPath(nodePath, '');

      expect(result).toBe('/opt/homebrew/bin');
    });

    it('should handle Windows-style paths', () => {
      // On Windows, path.dirname recognizes backslash paths
      // On other platforms, backslash is not a path separator
      const nodePath = 'C:\\Program Files\\nodejs\\node.exe';
      const currentPath = 'C:\\Windows\\System32';

      const result = buildEnhancedPath(nodePath, currentPath);

      if (process.platform === 'win32') {
        // On Windows, should prepend the node directory
        expect(result).toBe(`C:\\Program Files\\nodejs${delimiter}${currentPath}`);
      } else {
        // On non-Windows, backslash paths are treated as relative paths
        // path.dirname returns '.' so the function returns currentPath unchanged
        expect(result).toBe(currentPath);
      }
    });

    it('should use default empty string for currentPath', () => {
      const nodePath = '/usr/local/bin/node';

      const result = buildEnhancedPath(nodePath);

      expect(result).toBe('/usr/local/bin');
    });
  });
});
