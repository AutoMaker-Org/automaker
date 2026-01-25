import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SettingsService } from '@/services/settings-service.js';
import {
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_CREDENTIALS,
  DEFAULT_PROJECT_SETTINGS,
  SETTINGS_VERSION,
  CREDENTIALS_VERSION,
  PROJECT_SETTINGS_VERSION,
  type GlobalSettings,
  type Credentials,
  type ProjectSettings,
} from '@/types/settings.js';

describe('settings-service.ts', () => {
  let testDataDir: string;
  let testProjectDir: string;
  let settingsService: SettingsService;

  beforeEach(async () => {
    testDataDir = path.join(os.tmpdir(), `settings-test-${Date.now()}`);
    testProjectDir = path.join(os.tmpdir(), `project-test-${Date.now()}`);
    await fs.mkdir(testDataDir, { recursive: true });
    await fs.mkdir(testProjectDir, { recursive: true });
    settingsService = new SettingsService(testDataDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
      await fs.rm(testProjectDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getGlobalSettings', () => {
    it('should return default settings when file does not exist', async () => {
      const settings = await settingsService.getGlobalSettings();
      expect(settings).toEqual(DEFAULT_GLOBAL_SETTINGS);
    });

    it('should read and return existing settings', async () => {
      const customSettings: GlobalSettings = {
        ...DEFAULT_GLOBAL_SETTINGS,
        theme: 'light',
        sidebarOpen: false,
        maxConcurrency: 5,
      };
      const settingsPath = path.join(testDataDir, 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(customSettings, null, 2));

      const settings = await settingsService.getGlobalSettings();
      expect(settings.theme).toBe('light');
      expect(settings.sidebarOpen).toBe(false);
      expect(settings.maxConcurrency).toBe(5);
    });

    it('should merge with defaults for missing properties', async () => {
      const partialSettings = {
        version: SETTINGS_VERSION,
        theme: 'dark',
      };
      const settingsPath = path.join(testDataDir, 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(partialSettings, null, 2));

      const settings = await settingsService.getGlobalSettings();
      expect(settings.theme).toBe('dark');
      expect(settings.sidebarOpen).toBe(DEFAULT_GLOBAL_SETTINGS.sidebarOpen);
      expect(settings.maxConcurrency).toBe(DEFAULT_GLOBAL_SETTINGS.maxConcurrency);
    });

    it('should merge keyboard shortcuts deeply', async () => {
      const customSettings: GlobalSettings = {
        ...DEFAULT_GLOBAL_SETTINGS,
        keyboardShortcuts: {
          ...DEFAULT_GLOBAL_SETTINGS.keyboardShortcuts,
          board: 'B',
        },
      };
      const settingsPath = path.join(testDataDir, 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(customSettings, null, 2));

      const settings = await settingsService.getGlobalSettings();
      expect(settings.keyboardShortcuts.board).toBe('B');
      expect(settings.keyboardShortcuts.agent).toBe(
        DEFAULT_GLOBAL_SETTINGS.keyboardShortcuts.agent
      );
    });
  });

  describe('updateGlobalSettings', () => {
    it('should create settings file with updates', async () => {
      const updates: Partial<GlobalSettings> = {
        theme: 'light',
        sidebarOpen: false,
      };

      const updated = await settingsService.updateGlobalSettings(updates);

      expect(updated.theme).toBe('light');
      expect(updated.sidebarOpen).toBe(false);
      expect(updated.version).toBe(SETTINGS_VERSION);

      const settingsPath = path.join(testDataDir, 'settings.json');
      const fileContent = await fs.readFile(settingsPath, 'utf-8');
      const saved = JSON.parse(fileContent);
      expect(saved.theme).toBe('light');
      expect(saved.sidebarOpen).toBe(false);
    });

    it('should merge updates with existing settings', async () => {
      const initial: GlobalSettings = {
        ...DEFAULT_GLOBAL_SETTINGS,
        theme: 'dark',
        maxConcurrency: 3,
      };
      const settingsPath = path.join(testDataDir, 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(initial, null, 2));

      const updates: Partial<GlobalSettings> = {
        theme: 'light',
      };

      const updated = await settingsService.updateGlobalSettings(updates);

      expect(updated.theme).toBe('light');
      expect(updated.maxConcurrency).toBe(3); // Preserved from initial
    });

    it('should deep merge keyboard shortcuts', async () => {
      const updates: Partial<GlobalSettings> = {
        keyboardShortcuts: {
          board: 'B',
        },
      };

      const updated = await settingsService.updateGlobalSettings(updates);

      expect(updated.keyboardShortcuts.board).toBe('B');
      expect(updated.keyboardShortcuts.agent).toBe(DEFAULT_GLOBAL_SETTINGS.keyboardShortcuts.agent);
    });

    it('should not overwrite non-empty projects with an empty array (data loss guard)', async () => {
      const initial: GlobalSettings = {
        ...DEFAULT_GLOBAL_SETTINGS,
        theme: 'solarized' as GlobalSettings['theme'],
        projects: [
          {
            id: 'proj1',
            name: 'Project 1',
            path: '/tmp/project-1',
            lastOpened: new Date().toISOString(),
          },
        ] as any,
      };
      const settingsPath = path.join(testDataDir, 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(initial, null, 2));

      const updated = await settingsService.updateGlobalSettings({
        projects: [],
        theme: 'light',
      } as any);

      expect(updated.projects.length).toBe(1);
      expect((updated.projects as any)[0]?.id).toBe('proj1');
      // Theme should be preserved in the same request if it attempted to wipe projects
      expect(updated.theme).toBe('solarized');
    });

    it('should create data directory if it does not exist', async () => {
      const newDataDir = path.join(os.tmpdir(), `new-data-dir-${Date.now()}`);
      const newService = new SettingsService(newDataDir);

      await newService.updateGlobalSettings({ theme: 'light' });

      const stats = await fs.stat(newDataDir);
      expect(stats.isDirectory()).toBe(true);

      await fs.rm(newDataDir, { recursive: true, force: true });
    });
  });

  describe('hasGlobalSettings', () => {
    it('should return false when settings file does not exist', async () => {
      const exists = await settingsService.hasGlobalSettings();
      expect(exists).toBe(false);
    });

    it('should return true when settings file exists', async () => {
      await settingsService.updateGlobalSettings({ theme: 'light' });
      const exists = await settingsService.hasGlobalSettings();
      expect(exists).toBe(true);
    });
  });

  describe('getCredentials', () => {
    it('should return default credentials when file does not exist', async () => {
      const credentials = await settingsService.getCredentials();
      expect(credentials).toEqual(DEFAULT_CREDENTIALS);
    });

    it('should read and return existing credentials', async () => {
      const customCredentials: Credentials = {
        ...DEFAULT_CREDENTIALS,
        apiKeys: {
          anthropic: 'sk-test-key',
        },
      };
      const credentialsPath = path.join(testDataDir, 'credentials.json');
      await fs.writeFile(credentialsPath, JSON.stringify(customCredentials, null, 2));

      const credentials = await settingsService.getCredentials();
      expect(credentials.apiKeys.anthropic).toBe('sk-test-key');
    });

    it('should merge with defaults for missing api keys', async () => {
      const partialCredentials = {
        version: CREDENTIALS_VERSION,
        apiKeys: {
          anthropic: 'sk-test',
        },
      };
      const credentialsPath = path.join(testDataDir, 'credentials.json');
      await fs.writeFile(credentialsPath, JSON.stringify(partialCredentials, null, 2));

      const credentials = await settingsService.getCredentials();
      expect(credentials.apiKeys.anthropic).toBe('sk-test');
    });
  });

  describe('updateCredentials', () => {
    it('should create credentials file with updates', async () => {
      const updates: Partial<Credentials> = {
        apiKeys: {
          anthropic: 'sk-test-key',
        },
      };

      const updated = await settingsService.updateCredentials(updates);

      expect(updated.apiKeys.anthropic).toBe('sk-test-key');
      expect(updated.version).toBe(CREDENTIALS_VERSION);

      const credentialsPath = path.join(testDataDir, 'credentials.json');
      const fileContent = await fs.readFile(credentialsPath, 'utf-8');
      const saved = JSON.parse(fileContent);
      expect(saved.apiKeys.anthropic).toBe('sk-test-key');
    });

    it('should merge updates with existing credentials', async () => {
      const initial: Credentials = {
        ...DEFAULT_CREDENTIALS,
        apiKeys: {
          anthropic: 'sk-initial',
        },
      };
      const credentialsPath = path.join(testDataDir, 'credentials.json');
      await fs.writeFile(credentialsPath, JSON.stringify(initial, null, 2));

      const updates: Partial<Credentials> = {
        apiKeys: {
          anthropic: 'sk-updated',
        },
      };

      const updated = await settingsService.updateCredentials(updates);

      expect(updated.apiKeys.anthropic).toBe('sk-updated');
    });

    it('should deep merge api keys', async () => {
      const initial: Credentials = {
        ...DEFAULT_CREDENTIALS,
        apiKeys: {
          anthropic: 'sk-anthropic',
        },
      };
      const credentialsPath = path.join(testDataDir, 'credentials.json');
      await fs.writeFile(credentialsPath, JSON.stringify(initial, null, 2));

      const updates: Partial<Credentials> = {
        apiKeys: {
          anthropic: 'sk-updated-anthropic',
        },
      };

      const updated = await settingsService.updateCredentials(updates);

      expect(updated.apiKeys.anthropic).toBe('sk-updated-anthropic');
    });
  });

  describe('getMaskedCredentials', () => {
    it('should return masked credentials for empty keys', async () => {
      const masked = await settingsService.getMaskedCredentials();
      expect(masked.anthropic.configured).toBe(false);
      expect(masked.anthropic.masked).toBe('');
    });

    it('should mask keys correctly', async () => {
      await settingsService.updateCredentials({
        apiKeys: {
          anthropic: 'sk-ant-api03-1234567890abcdef',
        },
      });

      const masked = await settingsService.getMaskedCredentials();
      expect(masked.anthropic.configured).toBe(true);
      expect(masked.anthropic.masked).toBe('sk-a...cdef');
    });

    it('should handle short keys', async () => {
      await settingsService.updateCredentials({
        apiKeys: {
          anthropic: 'short',
        },
      });

      const masked = await settingsService.getMaskedCredentials();
      expect(masked.anthropic.configured).toBe(true);
      expect(masked.anthropic.masked).toBe('');
    });
  });

  describe('hasCredentials', () => {
    it('should return false when credentials file does not exist', async () => {
      const exists = await settingsService.hasCredentials();
      expect(exists).toBe(false);
    });

    it('should return true when credentials file exists', async () => {
      await settingsService.updateCredentials({
        apiKeys: { anthropic: 'test' },
      });
      const exists = await settingsService.hasCredentials();
      expect(exists).toBe(true);
    });
  });

  describe('getProjectSettings', () => {
    it('should return default settings when file does not exist', async () => {
      const settings = await settingsService.getProjectSettings(testProjectDir);
      expect(settings).toEqual(DEFAULT_PROJECT_SETTINGS);
    });

    it('should read and return existing project settings', async () => {
      const customSettings: ProjectSettings = {
        ...DEFAULT_PROJECT_SETTINGS,
        theme: 'light',
        useWorktrees: true,
      };
      const automakerDir = path.join(testProjectDir, '.automaker');
      await fs.mkdir(automakerDir, { recursive: true });
      const settingsPath = path.join(automakerDir, 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(customSettings, null, 2));

      const settings = await settingsService.getProjectSettings(testProjectDir);
      expect(settings.theme).toBe('light');
      expect(settings.useWorktrees).toBe(true);
    });

    it('should merge with defaults for missing properties', async () => {
      const partialSettings = {
        version: PROJECT_SETTINGS_VERSION,
        theme: 'dark',
      };
      const automakerDir = path.join(testProjectDir, '.automaker');
      await fs.mkdir(automakerDir, { recursive: true });
      const settingsPath = path.join(automakerDir, 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(partialSettings, null, 2));

      const settings = await settingsService.getProjectSettings(testProjectDir);
      expect(settings.theme).toBe('dark');
      expect(settings.version).toBe(PROJECT_SETTINGS_VERSION);
    });
  });

  describe('updateProjectSettings', () => {
    it('should create project settings file with updates', async () => {
      const updates: Partial<ProjectSettings> = {
        theme: 'light',
        useWorktrees: true,
      };

      const updated = await settingsService.updateProjectSettings(testProjectDir, updates);

      expect(updated.theme).toBe('light');
      expect(updated.useWorktrees).toBe(true);
      expect(updated.version).toBe(PROJECT_SETTINGS_VERSION);

      const automakerDir = path.join(testProjectDir, '.automaker');
      const settingsPath = path.join(automakerDir, 'settings.json');
      const fileContent = await fs.readFile(settingsPath, 'utf-8');
      const saved = JSON.parse(fileContent);
      expect(saved.theme).toBe('light');
      expect(saved.useWorktrees).toBe(true);
    });

    it('should merge updates with existing project settings', async () => {
      const initial: ProjectSettings = {
        ...DEFAULT_PROJECT_SETTINGS,
        theme: 'dark',
        useWorktrees: false,
      };
      const automakerDir = path.join(testProjectDir, '.automaker');
      await fs.mkdir(automakerDir, { recursive: true });
      const settingsPath = path.join(automakerDir, 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(initial, null, 2));

      const updates: Partial<ProjectSettings> = {
        theme: 'light',
      };

      const updated = await settingsService.updateProjectSettings(testProjectDir, updates);

      expect(updated.theme).toBe('light');
      expect(updated.useWorktrees).toBe(false); // Preserved
    });

    it('should deep merge board background', async () => {
      const initial: ProjectSettings = {
        ...DEFAULT_PROJECT_SETTINGS,
        boardBackground: {
          imagePath: '/path/to/image.jpg',
          cardOpacity: 0.8,
          columnOpacity: 0.9,
          columnBorderEnabled: true,
          cardGlassmorphism: false,
          cardBorderEnabled: true,
          cardBorderOpacity: 0.5,
          hideScrollbar: false,
        },
      };
      const automakerDir = path.join(testProjectDir, '.automaker');
      await fs.mkdir(automakerDir, { recursive: true });
      const settingsPath = path.join(automakerDir, 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(initial, null, 2));

      const updates: Partial<ProjectSettings> = {
        boardBackground: {
          cardOpacity: 0.9,
        },
      };

      const updated = await settingsService.updateProjectSettings(testProjectDir, updates);

      expect(updated.boardBackground?.imagePath).toBe('/path/to/image.jpg');
      expect(updated.boardBackground?.cardOpacity).toBe(0.9);
      expect(updated.boardBackground?.columnOpacity).toBe(0.9);
    });

    it('should create .automaker directory if it does not exist', async () => {
      const newProjectDir = path.join(os.tmpdir(), `new-project-${Date.now()}`);

      await settingsService.updateProjectSettings(newProjectDir, { theme: 'light' });

      const automakerDir = path.join(newProjectDir, '.automaker');
      const stats = await fs.stat(automakerDir);
      expect(stats.isDirectory()).toBe(true);

      await fs.rm(newProjectDir, { recursive: true, force: true });
    });
  });

  describe('hasProjectSettings', () => {
    it('should return false when project settings file does not exist', async () => {
      const exists = await settingsService.hasProjectSettings(testProjectDir);
      expect(exists).toBe(false);
    });

    it('should return true when project settings file exists', async () => {
      await settingsService.updateProjectSettings(testProjectDir, { theme: 'light' });
      const exists = await settingsService.hasProjectSettings(testProjectDir);
      expect(exists).toBe(true);
    });
  });

  describe('migrateFromLocalStorage', () => {
    it('should migrate global settings from localStorage data', async () => {
      const localStorageData = {
        'automaker-storage': JSON.stringify({
          state: {
            theme: 'light',
            sidebarOpen: false,
            maxConcurrency: 5,
          },
        }),
      };

      const result = await settingsService.migrateFromLocalStorage(localStorageData);

      expect(result.success).toBe(true);
      expect(result.migratedGlobalSettings).toBe(true);
      expect(result.migratedCredentials).toBe(false);
      expect(result.migratedProjectCount).toBe(0);

      const settings = await settingsService.getGlobalSettings();
      expect(settings.theme).toBe('light');
      expect(settings.sidebarOpen).toBe(false);
      expect(settings.maxConcurrency).toBe(5);
    });

    it('should migrate credentials from localStorage data', async () => {
      const localStorageData = {
        'automaker-storage': JSON.stringify({
          state: {
            apiKeys: {
              anthropic: 'sk-test-key',
            },
          },
        }),
      };

      const result = await settingsService.migrateFromLocalStorage(localStorageData);

      expect(result.success).toBe(true);
      expect(result.migratedCredentials).toBe(true);

      const credentials = await settingsService.getCredentials();
      expect(credentials.apiKeys.anthropic).toBe('sk-test-key');
    });

    it('should migrate project settings from localStorage data', async () => {
      const localStorageData = {
        'automaker-storage': JSON.stringify({
          state: {
            projects: [
              {
                id: 'proj1',
                name: 'Project 1',
                path: testProjectDir,
                theme: 'light',
              },
            ],
            boardBackgroundByProject: {
              [testProjectDir]: {
                imagePath: '/path/to/image.jpg',
                cardOpacity: 0.8,
                columnOpacity: 0.9,
                columnBorderEnabled: true,
                cardGlassmorphism: false,
                cardBorderEnabled: true,
                cardBorderOpacity: 0.5,
                hideScrollbar: false,
              },
            },
          },
        }),
      };

      const result = await settingsService.migrateFromLocalStorage(localStorageData);

      expect(result.success).toBe(true);
      expect(result.migratedProjectCount).toBe(1);

      const projectSettings = await settingsService.getProjectSettings(testProjectDir);
      expect(projectSettings.theme).toBe('light');
      expect(projectSettings.boardBackground?.imagePath).toBe('/path/to/image.jpg');
    });

    it('should handle direct localStorage values', async () => {
      const localStorageData = {
        'automaker:lastProjectDir': '/path/to/project',
        'file-browser-recent-folders': JSON.stringify(['/path1', '/path2']),
        'worktree-panel-collapsed': 'true',
      };

      const result = await settingsService.migrateFromLocalStorage(localStorageData);

      expect(result.success).toBe(true);
      const settings = await settingsService.getGlobalSettings();
      expect(settings.lastProjectDir).toBe('/path/to/project');
      expect(settings.recentFolders).toEqual(['/path1', '/path2']);
      expect(settings.worktreePanelCollapsed).toBe(true);
    });

    it('should handle invalid JSON gracefully', async () => {
      const localStorageData = {
        'automaker-storage': 'invalid json',
        'file-browser-recent-folders': 'invalid json',
      };

      const result = await settingsService.migrateFromLocalStorage(localStorageData);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    // Skip on Windows as chmod doesn't work the same way (CI runs on Linux)
    it.skipIf(process.platform === 'win32')(
      'should handle migration errors gracefully',
      async () => {
        // Create a read-only directory to cause write errors
        const readOnlyDir = path.join(os.tmpdir(), `readonly-${Date.now()}`);
        await fs.mkdir(readOnlyDir, { recursive: true });
        await fs.chmod(readOnlyDir, 0o444);

        const readOnlyService = new SettingsService(readOnlyDir);
        const localStorageData = {
          'automaker-storage': JSON.stringify({
            state: { theme: 'light' },
          }),
        };

        const result = await readOnlyService.migrateFromLocalStorage(localStorageData);

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);

        await fs.chmod(readOnlyDir, 0o755);
        await fs.rm(readOnlyDir, { recursive: true, force: true });
      }
    );
  });

  describe('getDataDir', () => {
    it('should return the data directory path', () => {
      const dataDir = settingsService.getDataDir();
      expect(dataDir).toBe(testDataDir);
    });
  });

  describe('phase model migration (v2 -> v3)', () => {
    it('should migrate string phase models to PhaseModelEntry format', async () => {
      // Simulate v2 format with string phase models
      const v2Settings = {
        version: 2,
        theme: 'dark',
        phaseModels: {
          enhancementModel: 'sonnet',
          fileDescriptionModel: 'haiku',
          imageDescriptionModel: 'haiku',
          validationModel: 'sonnet',
          specGenerationModel: 'opus',
          featureGenerationModel: 'sonnet',
          backlogPlanningModel: 'sonnet',
          projectAnalysisModel: 'sonnet',
        },
      };
      const settingsPath = path.join(testDataDir, 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(v2Settings, null, 2));

      const settings = await settingsService.getGlobalSettings();

      // Verify all phase models are now PhaseModelEntry objects
      // Legacy aliases are migrated to canonical IDs
      expect(settings.phaseModels.enhancementModel).toEqual({ model: 'claude-sonnet' });
      expect(settings.phaseModels.fileDescriptionModel).toEqual({ model: 'claude-haiku' });
      expect(settings.phaseModels.specGenerationModel).toEqual({ model: 'claude-opus' });
      expect(settings.version).toBe(SETTINGS_VERSION);
    });

    it('should preserve PhaseModelEntry objects during migration', async () => {
      // Simulate v3 format (already has PhaseModelEntry objects)
      const v3Settings = {
        version: 3,
        theme: 'dark',
        phaseModels: {
          enhancementModel: { model: 'sonnet', thinkingLevel: 'high' },
          fileDescriptionModel: { model: 'haiku' },
          imageDescriptionModel: { model: 'haiku', thinkingLevel: 'low' },
          validationModel: { model: 'sonnet' },
          specGenerationModel: { model: 'opus', thinkingLevel: 'ultrathink' },
          featureGenerationModel: { model: 'sonnet' },
          backlogPlanningModel: { model: 'sonnet', thinkingLevel: 'medium' },
          projectAnalysisModel: { model: 'sonnet' },
        },
      };
      const settingsPath = path.join(testDataDir, 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(v3Settings, null, 2));

      const settings = await settingsService.getGlobalSettings();

      // Verify PhaseModelEntry objects are preserved with thinkingLevel
      // Legacy aliases are migrated to canonical IDs
      expect(settings.phaseModels.enhancementModel).toEqual({
        model: 'claude-sonnet',
        thinkingLevel: 'high',
      });
      expect(settings.phaseModels.specGenerationModel).toEqual({
        model: 'claude-opus',
        thinkingLevel: 'ultrathink',
      });
      expect(settings.phaseModels.backlogPlanningModel).toEqual({
        model: 'claude-sonnet',
        thinkingLevel: 'medium',
      });
    });

    it('should handle mixed format (some string, some object)', async () => {
      // Edge case: mixed format (shouldn't happen but handle gracefully)
      const mixedSettings = {
        version: 2,
        theme: 'dark',
        phaseModels: {
          enhancementModel: 'sonnet', // string
          fileDescriptionModel: { model: 'haiku', thinkingLevel: 'low' }, // object
          imageDescriptionModel: 'haiku', // string
          validationModel: { model: 'opus' }, // object without thinkingLevel
          specGenerationModel: 'opus',
          featureGenerationModel: 'sonnet',
          backlogPlanningModel: 'sonnet',
          projectAnalysisModel: 'sonnet',
        },
      };
      const settingsPath = path.join(testDataDir, 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(mixedSettings, null, 2));

      const settings = await settingsService.getGlobalSettings();

      // Strings should be converted to objects with canonical IDs
      expect(settings.phaseModels.enhancementModel).toEqual({ model: 'claude-sonnet' });
      expect(settings.phaseModels.imageDescriptionModel).toEqual({ model: 'claude-haiku' });
      // Objects should be preserved with migrated IDs
      expect(settings.phaseModels.fileDescriptionModel).toEqual({
        model: 'claude-haiku',
        thinkingLevel: 'low',
      });
      expect(settings.phaseModels.validationModel).toEqual({ model: 'claude-opus' });
    });

    it('should migrate legacy enhancementModel/validationModel fields', async () => {
      // Simulate v1 format with legacy fields
      const v1Settings = {
        version: 1,
        theme: 'dark',
        enhancementModel: 'haiku',
        validationModel: 'opus',
        // No phaseModels object
      };
      const settingsPath = path.join(testDataDir, 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(v1Settings, null, 2));

      const settings = await settingsService.getGlobalSettings();

      // Legacy fields should be migrated to phaseModels with canonical IDs
      expect(settings.phaseModels.enhancementModel).toEqual({ model: 'claude-haiku' });
      expect(settings.phaseModels.validationModel).toEqual({ model: 'claude-opus' });
      // Other fields should use defaults (canonical IDs)
      expect(settings.phaseModels.specGenerationModel).toEqual({ model: 'claude-opus' });
    });

    it('should use default phase models when none are configured', async () => {
      // Simulate empty settings
      const emptySettings = {
        version: 1,
        theme: 'dark',
      };
      const settingsPath = path.join(testDataDir, 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(emptySettings, null, 2));

      const settings = await settingsService.getGlobalSettings();

      // Should use DEFAULT_PHASE_MODELS (with canonical IDs)
      expect(settings.phaseModels.enhancementModel).toEqual({ model: 'claude-sonnet' });
      expect(settings.phaseModels.fileDescriptionModel).toEqual({ model: 'claude-haiku' });
      expect(settings.phaseModels.specGenerationModel).toEqual({ model: 'claude-opus' });
    });

    it('should deep merge phaseModels on update', async () => {
      // Create initial settings with some phase models
      await settingsService.updateGlobalSettings({
        phaseModels: {
          enhancementModel: { model: 'sonnet', thinkingLevel: 'high' },
        },
      });

      // Update with a different phase model
      await settingsService.updateGlobalSettings({
        phaseModels: {
          specGenerationModel: { model: 'opus', thinkingLevel: 'ultrathink' },
        },
      });

      const settings = await settingsService.getGlobalSettings();

      // Both should be preserved (models migrated to canonical format)
      expect(settings.phaseModels.enhancementModel).toEqual({
        model: 'claude-sonnet',
        thinkingLevel: 'high',
      });
      expect(settings.phaseModels.specGenerationModel).toEqual({
        model: 'claude-opus',
        thinkingLevel: 'ultrathink',
      });
    });
  });

  describe('atomicWriteJson', () => {
    // Skip on Windows as chmod doesn't work the same way (CI runs on Linux)
    it.skipIf(process.platform === 'win32')(
      'should handle write errors and clean up temp file',
      async () => {
        // Create a read-only directory to cause write errors
        const readOnlyDir = path.join(os.tmpdir(), `readonly-${Date.now()}`);
        await fs.mkdir(readOnlyDir, { recursive: true });
        await fs.chmod(readOnlyDir, 0o444);

        const readOnlyService = new SettingsService(readOnlyDir);

        await expect(readOnlyService.updateGlobalSettings({ theme: 'light' })).rejects.toThrow();

        await fs.chmod(readOnlyDir, 0o755);
        await fs.rm(readOnlyDir, { recursive: true, force: true });
      }
    );
  });
});
