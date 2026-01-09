import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  getGlobalConfigPath,
  getProjectConfigPath,
  readGlobalConfig,
  writeGlobalConfig,
  readProjectConfig,
  writeProjectConfig,
  deleteProjectConfig,
  getEffectivePermissions,
  applyProfileToProject,
  applyProfileGlobally,
  detectProfile,
  generateExampleConfig,
  hasProjectConfig,
  getAvailableProfiles,
} from '@/services/cursor-config-service.js';

vi.mock('fs/promises');
vi.mock('os');

describe('cursor-config-service.ts', () => {
  const mockHomedir = path.join(path.sep, 'home', 'user');
  const testProjectPath = path.join(path.sep, 'tmp', 'test-project');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue(mockHomedir);
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.CURSOR_CONFIG_DIR;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getGlobalConfigPath', () => {
    it('should return default path using homedir', () => {
      const result = getGlobalConfigPath();
      expect(result).toContain('.cursor');
      expect(result).toContain('cli-config.json');
    });

    it('should use CURSOR_CONFIG_DIR if set', () => {
      const customDir = path.join(path.sep, 'custom', 'cursor', 'config');
      process.env.CURSOR_CONFIG_DIR = customDir;

      const result = getGlobalConfigPath();

      expect(result).toContain('custom');
      expect(result).toContain('cli-config.json');
    });
  });

  describe('getProjectConfigPath', () => {
    it('should return project config path', () => {
      const result = getProjectConfigPath(testProjectPath);
      expect(result).toContain('.cursor');
      expect(result).toContain('cli.json');
    });
  });

  describe('readGlobalConfig', () => {
    it('should read and parse global config', async () => {
      const mockConfig = { version: 1, permissions: { allow: ['*'], deny: [] } };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await readGlobalConfig();

      expect(result).toEqual(mockConfig);
      expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining('cli-config.json'), 'utf-8');
    });

    it('should return null if file does not exist', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await readGlobalConfig();

      expect(result).toBeNull();
    });

    it('should throw on other errors', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(readGlobalConfig()).rejects.toThrow('Permission denied');
    });
  });

  describe('writeGlobalConfig', () => {
    it('should create directory and write config', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const config = { version: 1, permissions: { allow: ['*'], deny: [] } };
      await writeGlobalConfig(config);

      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('.cursor'), {
        recursive: true,
      });
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('cli-config.json'),
        expect.any(String)
      );
    });
  });

  describe('readProjectConfig', () => {
    it('should read and parse project config', async () => {
      const mockConfig = { version: 1, permissions: { allow: ['read'], deny: ['write'] } };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await readProjectConfig(testProjectPath);

      expect(result).toEqual(mockConfig);
      expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining('cli.json'), 'utf-8');
    });

    it('should return null if file does not exist', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await readProjectConfig(testProjectPath);

      expect(result).toBeNull();
    });

    it('should throw on other errors', async () => {
      const error = new Error('Read error') as NodeJS.ErrnoException;
      error.code = 'EIO';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(readProjectConfig(testProjectPath)).rejects.toThrow('Read error');
    });
  });

  describe('writeProjectConfig', () => {
    it('should write project config with only permissions', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const config = { version: 1, permissions: { allow: ['read'], deny: ['write'] } };
      await writeProjectConfig(testProjectPath, config);

      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('.cursor'), {
        recursive: true,
      });

      // Check that only permissions is written (no version)
      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed).toEqual({ permissions: { allow: ['read'], deny: ['write'] } });
      expect(parsed.version).toBeUndefined();
    });
  });

  describe('deleteProjectConfig', () => {
    it('should delete project config', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await deleteProjectConfig(testProjectPath);

      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('cli.json'));
    });

    it('should not throw if file does not exist', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.unlink).mockRejectedValue(error);

      await expect(deleteProjectConfig(testProjectPath)).resolves.not.toThrow();
    });

    it('should throw on other errors', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      vi.mocked(fs.unlink).mockRejectedValue(error);

      await expect(deleteProjectConfig(testProjectPath)).rejects.toThrow('Permission denied');
    });
  });

  describe('getEffectivePermissions', () => {
    it('should return project permissions if available', async () => {
      const projectPerms = { allow: ['read'], deny: ['write'] };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({ permissions: projectPerms }));

      const result = await getEffectivePermissions(testProjectPath);

      expect(result).toEqual(projectPerms);
    });

    it('should fall back to global permissions', async () => {
      const globalPerms = { allow: ['*'], deny: [] };
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(error) // Project config not found
        .mockResolvedValueOnce(JSON.stringify({ permissions: globalPerms }));

      const result = await getEffectivePermissions(testProjectPath);

      expect(result).toEqual(globalPerms);
    });

    it('should return null if no config exists', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await getEffectivePermissions(testProjectPath);

      expect(result).toBeNull();
    });

    it('should return global permissions if no project path provided', async () => {
      const globalPerms = { allow: ['*'], deny: [] };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ permissions: globalPerms }));

      const result = await getEffectivePermissions();

      expect(result).toEqual(globalPerms);
    });
  });

  describe('applyProfileToProject', () => {
    it('should write development profile to project', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await applyProfileToProject(testProjectPath, 'development');

      expect(fs.writeFile).toHaveBeenCalled();
      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed.permissions).toBeDefined();
    });

    it('should throw on unknown profile', async () => {
      await expect(applyProfileToProject(testProjectPath, 'unknown' as any)).rejects.toThrow(
        'Unknown permission profile: unknown'
      );
    });
  });

  describe('applyProfileGlobally', () => {
    it('should write profile to global config', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error); // No existing config
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await applyProfileGlobally('strict');

      expect(fs.writeFile).toHaveBeenCalled();
      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed.version).toBe(1);
      expect(parsed.permissions).toBeDefined();
    });

    it('should preserve existing settings', async () => {
      const existingConfig = { version: 1, someOtherSetting: 'value' };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingConfig));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await applyProfileGlobally('development');

      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed.someOtherSetting).toBe('value');
    });

    it('should throw on unknown profile', async () => {
      await expect(applyProfileGlobally('unknown' as any)).rejects.toThrow(
        'Unknown permission profile: unknown'
      );
    });
  });

  describe('detectProfile', () => {
    it('should return null for null permissions', () => {
      expect(detectProfile(null)).toBeNull();
    });

    it('should return custom for non-matching permissions', () => {
      const customPerms = { allow: ['some-custom'], deny: ['other-custom'] };
      const result = detectProfile(customPerms);
      expect(result).toBe('custom');
    });

    it('should detect matching profile', () => {
      // Get a profile's permissions and verify detection works
      const profiles = getAvailableProfiles();
      if (profiles.length > 0) {
        const profile = profiles[0];
        const result = detectProfile(profile.permissions);
        expect(result).toBe(profile.id);
      }
    });
  });

  describe('generateExampleConfig', () => {
    it('should generate development profile config by default', () => {
      const config = generateExampleConfig();
      const parsed = JSON.parse(config);

      expect(parsed.version).toBe(1);
      expect(parsed.permissions).toBeDefined();
    });

    it('should generate specified profile config', () => {
      const config = generateExampleConfig('strict');
      const parsed = JSON.parse(config);

      expect(parsed.version).toBe(1);
      expect(parsed.permissions).toBeDefined();
      expect(parsed.permissions.deny).toBeDefined();
    });
  });

  describe('hasProjectConfig', () => {
    it('should return true if config exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await hasProjectConfig(testProjectPath);

      expect(result).toBe(true);
    });

    it('should return false if config does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await hasProjectConfig(testProjectPath);

      expect(result).toBe(false);
    });
  });

  describe('getAvailableProfiles', () => {
    it('should return all available profiles', () => {
      const profiles = getAvailableProfiles();

      expect(Array.isArray(profiles)).toBe(true);
      expect(profiles.length).toBeGreaterThan(0);
      expect(profiles.some((p) => p.id === 'strict')).toBe(true);
      expect(profiles.some((p) => p.id === 'development')).toBe(true);
    });
  });
});
