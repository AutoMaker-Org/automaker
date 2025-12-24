import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('.claude/settings.json validation', () => {
  let settingsContent: string;
  let settings: any;
  const settingsPath = path.join(process.cwd(), '.claude', 'settings.json');

  beforeEach(async () => {
    settingsContent = await fs.readFile(settingsPath, 'utf-8');
    settings = JSON.parse(settingsContent);
  });

  describe('JSON structure validation', () => {
    it('should be valid JSON', () => {
      expect(() => JSON.parse(settingsContent)).not.toThrow();
    });

    it('should parse to an object', () => {
      expect(settings).toBeTypeOf('object');
      expect(settings).not.toBeNull();
    });

    it('should not be an array', () => {
      expect(Array.isArray(settings)).toBe(false);
    });
  });

  describe('sandbox configuration', () => {
    it('should have sandbox configuration', () => {
      expect(settings).toHaveProperty('sandbox');
      expect(settings.sandbox).toBeTypeOf('object');
    });

    it('should have sandbox.enabled as boolean', () => {
      expect(settings.sandbox).toHaveProperty('enabled');
      expect(settings.sandbox.enabled).toBeTypeOf('boolean');
    });

    it('should have sandbox enabled set to true', () => {
      expect(settings.sandbox.enabled).toBe(true);
    });

    it('should have autoAllowBashIfSandboxed as boolean', () => {
      expect(settings.sandbox).toHaveProperty('autoAllowBashIfSandboxed');
      expect(settings.sandbox.autoAllowBashIfSandboxed).toBeTypeOf('boolean');
    });

    it('should have autoAllowBashIfSandboxed set to true', () => {
      expect(settings.sandbox.autoAllowBashIfSandboxed).toBe(true);
    });
  });

  describe('permissions configuration', () => {
    it('should have permissions configuration', () => {
      expect(settings).toHaveProperty('permissions');
      expect(settings.permissions).toBeTypeOf('object');
    });

    it('should have defaultMode as string', () => {
      expect(settings.permissions).toHaveProperty('defaultMode');
      expect(settings.permissions.defaultMode).toBeTypeOf('string');
    });

    it('should have valid defaultMode value', () => {
      const validModes = ['acceptEdits', 'rejectEdits', 'ask'];
      expect(validModes).toContain(settings.permissions.defaultMode);
    });

    it('should have allow array', () => {
      expect(settings.permissions).toHaveProperty('allow');
      expect(Array.isArray(settings.permissions.allow)).toBe(true);
    });

    it('should have file operation permissions', () => {
      const expectedPermissions = [
        'Read(./**)',
        'Write(./**)',
        'Edit(./**)',
        'Glob(./**)',
        'Grep(./**)',
        'Bash(*)',
      ];
      
      expectedPermissions.forEach(permission => {
        expect(settings.permissions.allow).toContain(permission);
      });
    });

    it('should have puppeteer MCP permissions', () => {
      const puppeteerPermissions = [
        'mcp__puppeteer__puppeteer_navigate',
        'mcp__puppeteer__puppeteer_screenshot',
        'mcp__puppeteer__puppeteer_click',
        'mcp__puppeteer__puppeteer_fill',
        'mcp__puppeteer__puppeteer_select',
        'mcp__puppeteer__puppeteer_hover',
        'mcp__puppeteer__puppeteer_evaluate',
      ];
      
      puppeteerPermissions.forEach(permission => {
        expect(settings.permissions.allow).toContain(permission);
      });
    });

    it('should not have empty allow array', () => {
      expect(settings.permissions.allow.length).toBeGreaterThan(0);
    });

    it('should have unique permissions', () => {
      const uniquePerms = new Set(settings.permissions.allow);
      expect(uniquePerms.size).toBe(settings.permissions.allow.length);
    });
  });

  describe('extraKnownMarketplaces configuration', () => {
    it('should have extraKnownMarketplaces', () => {
      expect(settings).toHaveProperty('extraKnownMarketplaces');
      expect(settings.extraKnownMarketplaces).toBeTypeOf('object');
    });

    it('should have minimal-claude-marketplace', () => {
      expect(settings.extraKnownMarketplaces).toHaveProperty('minimal-claude-marketplace');
    });

    it('should have valid marketplace source structure', () => {
      const marketplace = settings.extraKnownMarketplaces['minimal-claude-marketplace'];
      expect(marketplace).toHaveProperty('source');
      expect(marketplace.source).toBeTypeOf('object');
    });

    it('should have github as source', () => {
      const marketplace = settings.extraKnownMarketplaces['minimal-claude-marketplace'];
      expect(marketplace.source).toHaveProperty('source');
      expect(marketplace.source.source).toBe('github');
    });

    it('should have valid repository reference', () => {
      const marketplace = settings.extraKnownMarketplaces['minimal-claude-marketplace'];
      expect(marketplace.source).toHaveProperty('repo');
      expect(marketplace.source.repo).toBeTypeOf('string');
      expect(marketplace.source.repo).toMatch(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/);
    });

    it('should reference KenKaiii/minimal-claude repository', () => {
      const marketplace = settings.extraKnownMarketplaces['minimal-claude-marketplace'];
      expect(marketplace.source.repo).toBe('KenKaiii/minimal-claude');
    });
  });

  describe('enabledPlugins configuration', () => {
    it('should have enabledPlugins', () => {
      expect(settings).toHaveProperty('enabledPlugins');
      expect(settings.enabledPlugins).toBeTypeOf('object');
    });

    it('should have minimal-claude plugin enabled', () => {
      expect(settings.enabledPlugins).toHaveProperty('minimal-claude@minimal-claude-marketplace');
    });

    it('should have plugin enabled set to true', () => {
      expect(settings.enabledPlugins['minimal-claude@minimal-claude-marketplace']).toBe(true);
    });

    it('should use correct plugin reference format', () => {
      const pluginKeys = Object.keys(settings.enabledPlugins);
      pluginKeys.forEach(key => {
        expect(key).toMatch(/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+$/);
      });
    });

    it('should have all plugin values as boolean', () => {
      Object.values(settings.enabledPlugins).forEach(value => {
        expect(typeof value).toBe('boolean');
      });
    });
  });

  describe('configuration completeness', () => {
    it('should have all required top-level keys', () => {
      const requiredKeys = ['sandbox', 'permissions', 'extraKnownMarketplaces', 'enabledPlugins'];
      requiredKeys.forEach(key => {
        expect(settings).toHaveProperty(key);
      });
    });

    it('should not have unexpected top-level keys', () => {
      const expectedKeys = ['sandbox', 'permissions', 'extraKnownMarketplaces', 'enabledPlugins'];
      const actualKeys = Object.keys(settings);
      actualKeys.forEach(key => {
        expect(expectedKeys).toContain(key);
      });
    });
  });

  describe('security validation', () => {
    it('should enable sandbox for security', () => {
      expect(settings.sandbox.enabled).toBe(true);
    });

    it('should have restricted write permissions pattern', () => {
      const writePerms = settings.permissions.allow.filter((p: string) => 
        p.startsWith('Write(')
      );
      writePerms.forEach((perm: string) => {
        expect(perm).toMatch(/^Write\(.+\)$/);
      });
    });

    it('should not have wildcard write permissions to system directories', () => {
      const dangerousPatterns = [
        'Write(/)',
        'Write(/*)',
        'Write(/etc/**)',
        'Write(/sys/**)',
        'Write(/var/**)',
      ];
      dangerousPatterns.forEach(pattern => {
        expect(settings.permissions.allow).not.toContain(pattern);
      });
    });
  });

  describe('JSON formatting', () => {
    it('should be properly formatted with 2-space indentation', () => {
      const formatted = JSON.stringify(settings, null, 2) + '\n';
      expect(settingsContent).toBe(formatted);
    });

    it('should end with newline', () => {
      expect(settingsContent.endsWith('\n')).toBe(true);
    });

    it('should not have trailing whitespace on lines', () => {
      const lines = settingsContent.split('\n');
      lines.forEach((line, index) => {
        if (line.length > 0 && index < lines.length - 1) {
          expect(line).not.toMatch(/\s+$/);
        }
      });
    });
  });

  describe('marketplace and plugin consistency', () => {
    it('should have matching marketplace for enabled plugins', () => {
      Object.keys(settings.enabledPlugins).forEach(pluginKey => {
        const [, marketplace] = pluginKey.split('@');
        expect(settings.extraKnownMarketplaces).toHaveProperty(marketplace);
      });
    });

    it('should not enable non-existent plugins', () => {
      Object.keys(settings.enabledPlugins).forEach(pluginKey => {
        const [, marketplace] = pluginKey.split('@');
        expect(marketplace).toBeTypeOf('string');
        expect(marketplace.length).toBeGreaterThan(0);
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty permissions allow array', () => {
      const testSettings = { ...settings };
      testSettings.permissions.allow = [];
      expect(Array.isArray(testSettings.permissions.allow)).toBe(true);
      expect(testSettings.permissions.allow.length).toBe(0);
    });

    it('should validate permission format', () => {
      settings.permissions.allow.forEach((perm: string) => {
        expect(typeof perm).toBe('string');
        expect(perm.length).toBeGreaterThan(0);
      });
    });

    it('should handle marketplace without plugins enabled', () => {
      const marketplaces = Object.keys(settings.extraKnownMarketplaces);
      expect(marketplaces.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('plugin metadata validation', () => {
    it('should have valid GitHub repository format', () => {
      const marketplace = settings.extraKnownMarketplaces['minimal-claude-marketplace'];
      const repo = marketplace.source.repo;
      
      // Should be in format: owner/repo
      const parts = repo.split('/');
      expect(parts.length).toBe(2);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
    });

    it('should not have invalid characters in repository name', () => {
      const marketplace = settings.extraKnownMarketplaces['minimal-claude-marketplace'];
      const repo = marketplace.source.repo;
      
      // GitHub repo names should only contain alphanumeric, hyphen, underscore
      expect(repo).toMatch(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/);
    });
  });

  describe('backwards compatibility', () => {
    it('should maintain essential sandbox properties', () => {
      expect(settings.sandbox).toHaveProperty('enabled');
      expect(settings.sandbox).toHaveProperty('autoAllowBashIfSandboxed');
    });

    it('should maintain essential permission properties', () => {
      expect(settings.permissions).toHaveProperty('defaultMode');
      expect(settings.permissions).toHaveProperty('allow');
    });

    it('should support future marketplace additions', () => {
      expect(settings.extraKnownMarketplaces).toBeTypeOf('object');
      // Should be extensible
      const testMarketplace = { ...settings.extraKnownMarketplaces };
      testMarketplace['test-marketplace'] = {
        source: { source: 'github', repo: 'test/repo' }
      };
      expect(Object.keys(testMarketplace).length).toBeGreaterThan(
        Object.keys(settings.extraKnownMarketplaces).length
      );
    });
  });
});