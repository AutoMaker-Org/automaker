import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoModeService } from '@/services/auto-mode-service.js';
import { SettingsService } from '@/services/settings-service.js';

// Mock the secure-fs module
vi.mock('@/lib/secure-fs.js', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn().mockResolvedValue([]),
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
}));

// Mock context loading
vi.mock('@automaker/prompts', () => ({
  loadContextFiles: vi.fn().mockResolvedValue({ formattedPrompt: 'test context' }),
}));

// Mock provider factory
vi.mock('@/providers/provider-factory.js', () => ({
  ProviderFactory: {
    getProviderForModel: vi.fn().mockReturnValue({
      executeQuery: vi.fn().mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: '[DOUBLE_CHECK_PASSED] All good!' }],
            },
          };
        },
      }),
    }),
  },
}));

describe('AutoModeService - Double Check Mode', () => {
  let service: AutoModeService;
  let mockSettingsService: SettingsService;
  const mockEvents = {
    subscribe: vi.fn(),
    emit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsService = {
      getGlobalSettings: vi.fn().mockResolvedValue({
        doubleCheckMode: {
          enabled: true,
          modelStrategy: 'different',
          autoTriggerInAutoMode: true,
        },
      }),
    } as unknown as SettingsService;

    service = new AutoModeService(mockEvents as any, mockSettingsService);
  });

  describe('setSettingsService', () => {
    it('should set the settings service', () => {
      const newService = new AutoModeService(mockEvents as any);
      expect(() => newService.setSettingsService(mockSettingsService)).not.toThrow();
    });
  });

  describe('determineFinalStatus', () => {
    it('should return verified when skipTests is false', async () => {
      const feature = { id: 'test-1', skipTests: false, status: 'in_progress' };
      // Access private method via prototype
      const result = await (service as any).determineFinalStatus(feature, '/test');
      expect(result).toBe('verified');
    });

    it('should return double_check when mode is enabled and skipTests is true', async () => {
      const feature = { id: 'test-1', skipTests: true, status: 'in_progress' };
      const result = await (service as any).determineFinalStatus(feature, '/test');
      expect(result).toBe('double_check');
    });

    it('should return waiting_approval when mode is disabled', async () => {
      mockSettingsService.getGlobalSettings = vi.fn().mockResolvedValue({
        doubleCheckMode: {
          enabled: false,
        },
      });

      const feature = { id: 'test-1', skipTests: true, status: 'in_progress' };
      const result = await (service as any).determineFinalStatus(feature, '/test');
      expect(result).toBe('waiting_approval');
    });
  });

  describe('getDoubleCheckModel', () => {
    it('should return specific model when strategy is specific', () => {
      const feature = { id: 'test-1', model: 'sonnet' };
      const settings = {
        doubleCheckMode: {
          modelStrategy: 'specific' as const,
          specificModel: 'opus',
        },
      };

      const result = (service as any).getDoubleCheckModel(feature, settings);
      expect(result).toBe('opus');
    });

    it('should return different model when strategy is different', () => {
      const feature = { id: 'test-1', model: 'sonnet' };
      const settings = {
        doubleCheckMode: {
          modelStrategy: 'different' as const,
        },
      };

      const result = (service as any).getDoubleCheckModel(feature, settings);
      expect(result).not.toBe('sonnet');
    });

    it('should return original model when strategy is any', () => {
      const feature = { id: 'test-1', model: 'haiku' };
      const settings = {
        doubleCheckMode: {
          modelStrategy: 'any' as const,
        },
      };

      const result = (service as any).getDoubleCheckModel(feature, settings);
      expect(result).toBe('haiku');
    });
  });

  describe('buildDoubleCheckPrompt', () => {
    it('should build a verification prompt', () => {
      const feature = {
        id: 'test-1',
        description: 'Add a login feature',
        title: 'Login Feature',
      };

      const result = (service as any).buildDoubleCheckPrompt(feature);

      expect(result).toContain('Double-Check Verification');
      expect(result).toContain('Add a login feature');
      expect(result).toContain('[DOUBLE_CHECK_PASSED]');
      expect(result).toContain('[DOUBLE_CHECK_FAILED]');
    });
  });

  describe('extractTitleFromDescription', () => {
    it('should extract first line as title', () => {
      const description = 'First line title\nSecond line content';
      const result = (service as any).extractTitleFromDescription(description);
      expect(result).toBe('First line title');
    });

    it('should truncate long titles', () => {
      const description =
        'This is a very long title that exceeds the maximum length allowed for feature titles and should be truncated';
      const result = (service as any).extractTitleFromDescription(description);
      expect(result.length).toBeLessThanOrEqual(100);
      expect(result).toContain('...');
    });
  });
});
