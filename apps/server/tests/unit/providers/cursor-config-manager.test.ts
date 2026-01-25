import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import { CursorConfigManager } from '@/providers/cursor-config-manager.js';

vi.mock('fs');
vi.mock('@automaker/platform', () => ({
  getAutomakerDir: vi.fn((projectPath: string) => path.join(projectPath, '.automaker')),
}));

describe('cursor-config-manager.ts', () => {
  // Use platform-agnostic paths
  const testProjectPath = path.join(os.tmpdir(), 'test-project');
  const expectedConfigPath = path.join(testProjectPath, '.automaker', 'cursor-config.json');
  let manager: CursorConfigManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing config file
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should load existing config from disk', () => {
      const existingConfig = {
        defaultModel: 'claude-3-5-sonnet',
        models: ['auto', 'claude-3-5-sonnet'],
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingConfig));

      manager = new CursorConfigManager(testProjectPath);

      expect(fs.existsSync).toHaveBeenCalledWith(expectedConfigPath);
      expect(fs.readFileSync).toHaveBeenCalledWith(expectedConfigPath, 'utf8');
      expect(manager.getConfig()).toEqual(existingConfig);
    });

    it('should use default config if file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      manager = new CursorConfigManager(testProjectPath);

      const config = manager.getConfig();
      expect(config.defaultModel).toBe('cursor-auto');
      expect(config.models).toContain('cursor-auto');
    });

    it('should use default config if file read fails', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      manager = new CursorConfigManager(testProjectPath);

      expect(manager.getDefaultModel()).toBe('cursor-auto');
    });

    it('should use default config if JSON parse fails', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

      manager = new CursorConfigManager(testProjectPath);

      expect(manager.getDefaultModel()).toBe('cursor-auto');
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the config', () => {
      manager = new CursorConfigManager(testProjectPath);

      const config1 = manager.getConfig();
      const config2 = manager.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different objects
    });
  });

  describe('getDefaultModel / setDefaultModel', () => {
    beforeEach(() => {
      manager = new CursorConfigManager(testProjectPath);
    });

    it('should return default model', () => {
      expect(manager.getDefaultModel()).toBe('cursor-auto');
    });

    it('should set and persist default model', () => {
      manager.setDefaultModel('claude-3-5-sonnet');

      expect(manager.getDefaultModel()).toBe('claude-3-5-sonnet');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should return cursor-auto if defaultModel is undefined', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ models: ['cursor-auto'] }));

      manager = new CursorConfigManager(testProjectPath);

      expect(manager.getDefaultModel()).toBe('cursor-auto');
    });
  });

  describe('getEnabledModels / setEnabledModels', () => {
    beforeEach(() => {
      manager = new CursorConfigManager(testProjectPath);
    });

    it('should return enabled models', () => {
      const models = manager.getEnabledModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models).toContain('cursor-auto');
    });

    it('should set enabled models', () => {
      manager.setEnabledModels(['claude-3-5-sonnet', 'gpt-4o']);

      expect(manager.getEnabledModels()).toEqual(['claude-3-5-sonnet', 'gpt-4o']);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should return [cursor-auto] if models is undefined', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ defaultModel: 'cursor-auto' }));

      manager = new CursorConfigManager(testProjectPath);

      expect(manager.getEnabledModels()).toEqual(['cursor-auto']);
    });
  });

  describe('addModel', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          defaultModel: 'cursor-auto',
          models: ['cursor-auto'],
        })
      );
      manager = new CursorConfigManager(testProjectPath);
    });

    it('should add a new model', () => {
      manager.addModel('claude-3-5-sonnet');

      expect(manager.getEnabledModels()).toContain('claude-3-5-sonnet');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should not add duplicate models', () => {
      manager.addModel('cursor-auto');

      // Should not save if model already exists
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should initialize models array if undefined', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ defaultModel: 'cursor-auto' }));
      manager = new CursorConfigManager(testProjectPath);

      manager.addModel('claude-3-5-sonnet');

      expect(manager.getEnabledModels()).toContain('claude-3-5-sonnet');
    });
  });

  describe('removeModel', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          defaultModel: 'auto',
          models: ['auto', 'claude-3-5-sonnet', 'gpt-4o'],
        })
      );
      manager = new CursorConfigManager(testProjectPath);
    });

    it('should remove a model', () => {
      manager.removeModel('gpt-4o');

      expect(manager.getEnabledModels()).not.toContain('gpt-4o');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle removing non-existent model', () => {
      manager.removeModel('non-existent' as any);

      // Should still save (filtering happens regardless)
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should do nothing if models array is undefined', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ defaultModel: 'auto' }));
      manager = new CursorConfigManager(testProjectPath);

      manager.removeModel('auto');

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('isModelEnabled', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          defaultModel: 'auto',
          models: ['auto', 'claude-3-5-sonnet'],
        })
      );
      manager = new CursorConfigManager(testProjectPath);
    });

    it('should return true for enabled model', () => {
      expect(manager.isModelEnabled('auto')).toBe(true);
      expect(manager.isModelEnabled('claude-3-5-sonnet')).toBe(true);
    });

    it('should return false for disabled model', () => {
      expect(manager.isModelEnabled('gpt-4o')).toBe(false);
    });

    it('should return false if models is undefined', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ defaultModel: 'auto' }));
      manager = new CursorConfigManager(testProjectPath);

      expect(manager.isModelEnabled('auto')).toBe(false);
    });
  });

  describe('getMcpServers / setMcpServers', () => {
    beforeEach(() => {
      manager = new CursorConfigManager(testProjectPath);
    });

    it('should return empty array by default', () => {
      expect(manager.getMcpServers()).toEqual([]);
    });

    it('should set and get MCP servers', () => {
      manager.setMcpServers(['server1', 'server2']);

      expect(manager.getMcpServers()).toEqual(['server1', 'server2']);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('getRules / setRules', () => {
    beforeEach(() => {
      manager = new CursorConfigManager(testProjectPath);
    });

    it('should return empty array by default', () => {
      expect(manager.getRules()).toEqual([]);
    });

    it('should set and get rules', () => {
      manager.setRules(['.cursorrules', 'rules.md']);

      expect(manager.getRules()).toEqual(['.cursorrules', 'rules.md']);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          defaultModel: 'claude-3-5-sonnet',
          models: ['claude-3-5-sonnet'],
          mcpServers: ['server1'],
          rules: ['rules.md'],
        })
      );
      manager = new CursorConfigManager(testProjectPath);
    });

    it('should reset to default values', () => {
      manager.reset();

      expect(manager.getDefaultModel()).toBe('cursor-auto');
      expect(manager.getMcpServers()).toEqual([]);
      expect(manager.getRules()).toEqual([]);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('exists', () => {
    it('should return true if config file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      manager = new CursorConfigManager(testProjectPath);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      expect(manager.exists()).toBe(true);
    });

    it('should return false if config file does not exist', () => {
      manager = new CursorConfigManager(testProjectPath);

      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(manager.exists()).toBe(false);
    });
  });

  describe('getConfigPath', () => {
    it('should return the config file path', () => {
      manager = new CursorConfigManager(testProjectPath);

      expect(manager.getConfigPath()).toBe(expectedConfigPath);
    });
  });

  describe('saveConfig', () => {
    it('should create directory if it does not exist', () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false) // For loadConfig
        .mockReturnValueOnce(false); // For directory check in saveConfig

      manager = new CursorConfigManager(testProjectPath);
      manager.setDefaultModel('claude-3-5-sonnet');

      expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(expectedConfigPath), {
        recursive: true,
      });
    });

    it('should throw error on write failure', () => {
      manager = new CursorConfigManager(testProjectPath);

      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Write failed');
      });

      expect(() => manager.setDefaultModel('claude-3-5-sonnet')).toThrow('Write failed');
    });
  });
});
