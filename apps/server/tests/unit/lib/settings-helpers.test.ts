import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getMCPServersFromSettings,
  getProviderById,
  getProviderByModelId,
  resolveProviderContext,
  getAllProviderModels,
} from '@/lib/settings-helpers.js';
import type { SettingsService } from '@/services/settings-service.js';

// Mock the logger
vi.mock('@automaker/utils', async () => {
  const actual = await vi.importActual('@automaker/utils');
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
  return {
    ...actual,
    createLogger: () => mockLogger,
  };
});

describe('settings-helpers.ts', () => {
  describe('getMCPServersFromSettings', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return empty object when settingsService is null', async () => {
      const result = await getMCPServersFromSettings(null);
      expect(result).toEqual({});
    });

    it('should return empty object when settingsService is undefined', async () => {
      const result = await getMCPServersFromSettings(undefined);
      expect(result).toEqual({});
    });

    it('should return empty object when no MCP servers configured', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({ mcpServers: [] }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual({});
    });

    it('should return empty object when mcpServers is undefined', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual({});
    });

    it('should convert enabled stdio server to SDK format', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'test-server',
              type: 'stdio',
              command: 'node',
              args: ['server.js'],
              env: { NODE_ENV: 'test' },
              enabled: true,
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual({
        'test-server': {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
          env: { NODE_ENV: 'test' },
        },
      });
    });

    it('should convert enabled SSE server to SDK format', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'sse-server',
              type: 'sse',
              url: 'http://localhost:3000/sse',
              headers: { Authorization: 'Bearer token' },
              enabled: true,
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual({
        'sse-server': {
          type: 'sse',
          url: 'http://localhost:3000/sse',
          headers: { Authorization: 'Bearer token' },
        },
      });
    });

    it('should convert enabled HTTP server to SDK format', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'http-server',
              type: 'http',
              url: 'http://localhost:3000/api',
              headers: { 'X-API-Key': 'secret' },
              enabled: true,
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual({
        'http-server': {
          type: 'http',
          url: 'http://localhost:3000/api',
          headers: { 'X-API-Key': 'secret' },
        },
      });
    });

    it('should filter out disabled servers', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'enabled-server',
              type: 'stdio',
              command: 'node',
              enabled: true,
            },
            {
              id: '2',
              name: 'disabled-server',
              type: 'stdio',
              command: 'python',
              enabled: false,
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['enabled-server']).toBeDefined();
      expect(result['disabled-server']).toBeUndefined();
    });

    it('should treat servers without enabled field as enabled', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'implicit-enabled',
              type: 'stdio',
              command: 'node',
              // enabled field not set
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result['implicit-enabled']).toBeDefined();
    });

    it('should handle multiple enabled servers', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            { id: '1', name: 'server1', type: 'stdio', command: 'node', enabled: true },
            { id: '2', name: 'server2', type: 'stdio', command: 'python', enabled: true },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(Object.keys(result)).toHaveLength(2);
      expect(result['server1']).toBeDefined();
      expect(result['server2']).toBeDefined();
    });

    it('should return empty object and log error on exception', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockRejectedValue(new Error('Settings error')),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService, '[Test]');
      expect(result).toEqual({});
      // Logger will be called with error, but we don't need to assert it
    });

    it('should throw error for SSE server without URL', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'bad-sse',
              type: 'sse',
              enabled: true,
              // url missing
            },
          ],
        }),
      } as unknown as SettingsService;

      // The error is caught and logged, returns empty
      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual({});
    });

    it('should throw error for HTTP server without URL', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'bad-http',
              type: 'http',
              enabled: true,
              // url missing
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual({});
    });

    it('should throw error for stdio server without command', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'bad-stdio',
              type: 'stdio',
              enabled: true,
              // command missing
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual({});
    });

    it('should default to stdio type when type is not specified', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'no-type',
              command: 'node',
              enabled: true,
              // type not specified, should default to stdio
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result['no-type']).toEqual({
        type: 'stdio',
        command: 'node',
        args: undefined,
        env: undefined,
      });
    });
  });

  describe('getProviderById', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return provider when found by ID', async () => {
      const mockProvider = { id: 'zai-1', name: 'Zai', enabled: true };
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [mockProvider],
        }),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await getProviderById('zai-1', mockSettingsService);
      expect(result.provider).toEqual(mockProvider);
    });

    it('should return undefined when provider not found', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [],
        }),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await getProviderById('unknown', mockSettingsService);
      expect(result.provider).toBeUndefined();
    });

    it('should return provider even if disabled (caller handles enabled state)', async () => {
      const mockProvider = { id: 'disabled-1', name: 'Disabled', enabled: false };
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [mockProvider],
        }),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await getProviderById('disabled-1', mockSettingsService);
      expect(result.provider).toEqual(mockProvider);
    });
  });

  describe('getProviderByModelId', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return provider and modelConfig when found by model ID', async () => {
      const mockModel = { id: 'custom-model-1', name: 'Custom Model' };
      const mockProvider = {
        id: 'provider-1',
        name: 'Provider 1',
        enabled: true,
        models: [mockModel],
      };
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [mockProvider],
        }),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await getProviderByModelId('custom-model-1', mockSettingsService);
      expect(result.provider).toEqual(mockProvider);
      expect(result.modelConfig).toEqual(mockModel);
    });

    it('should resolve mapped Claude model when mapsToClaudeModel is present', async () => {
      const mockModel = {
        id: 'custom-model-1',
        name: 'Custom Model',
        mapsToClaudeModel: 'sonnet-3-5',
      };
      const mockProvider = {
        id: 'provider-1',
        name: 'Provider 1',
        enabled: true,
        models: [mockModel],
      };
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [mockProvider],
        }),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await getProviderByModelId('custom-model-1', mockSettingsService);
      expect(result.resolvedModel).toBeDefined();
      // resolveModelString('sonnet-3-5') usually returns 'claude-3-5-sonnet-20240620' or similar
    });

    it('should ignore disabled providers', async () => {
      const mockModel = { id: 'custom-model-1', name: 'Custom Model' };
      const mockProvider = {
        id: 'disabled-1',
        name: 'Disabled Provider',
        enabled: false,
        models: [mockModel],
      };
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [mockProvider],
        }),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await getProviderByModelId('custom-model-1', mockSettingsService);
      expect(result.provider).toBeUndefined();
    });
  });

  describe('resolveProviderContext', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should resolve provider by explicit providerId', async () => {
      const mockProvider = {
        id: 'provider-1',
        name: 'Provider 1',
        enabled: true,
        models: [{ id: 'custom-model-1', name: 'Custom Model' }],
      };
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [mockProvider],
        }),
        getCredentials: vi.fn().mockResolvedValue({ anthropicApiKey: 'test-key' }),
      } as unknown as SettingsService;

      const result = await resolveProviderContext(
        mockSettingsService,
        'custom-model-1',
        'provider-1'
      );

      expect(result.provider).toEqual(mockProvider);
      expect(result.credentials).toEqual({ anthropicApiKey: 'test-key' });
    });

    it('should return undefined provider when explicit providerId not found', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [],
        }),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await resolveProviderContext(
        mockSettingsService,
        'some-model',
        'unknown-provider'
      );

      expect(result.provider).toBeUndefined();
    });

    it('should fallback to model-based lookup when providerId not provided', async () => {
      const mockProvider = {
        id: 'provider-1',
        name: 'Provider 1',
        enabled: true,
        models: [{ id: 'custom-model-1', name: 'Custom Model' }],
      };
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [mockProvider],
        }),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await resolveProviderContext(mockSettingsService, 'custom-model-1');

      expect(result.provider).toEqual(mockProvider);
      expect(result.modelConfig?.id).toBe('custom-model-1');
    });

    it('should resolve mapsToClaudeModel to actual Claude model', async () => {
      const mockProvider = {
        id: 'provider-1',
        name: 'Provider 1',
        enabled: true,
        models: [
          {
            id: 'custom-model-1',
            name: 'Custom Model',
            mapsToClaudeModel: 'sonnet',
          },
        ],
      };
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [mockProvider],
        }),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await resolveProviderContext(mockSettingsService, 'custom-model-1');

      // resolveModelString('sonnet') should return a valid Claude model ID
      expect(result.resolvedModel).toBeDefined();
      expect(result.resolvedModel).toContain('claude');
    });

    it('should handle empty providers list', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [],
        }),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await resolveProviderContext(mockSettingsService, 'some-model');

      expect(result.provider).toBeUndefined();
      expect(result.resolvedModel).toBeUndefined();
      expect(result.modelConfig).toBeUndefined();
    });

    it('should handle missing claudeCompatibleProviders field', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({}),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await resolveProviderContext(mockSettingsService, 'some-model');

      expect(result.provider).toBeUndefined();
    });

    it('should skip disabled providers during fallback lookup', async () => {
      const disabledProvider = {
        id: 'disabled-1',
        name: 'Disabled Provider',
        enabled: false,
        models: [{ id: 'model-in-disabled', name: 'Model' }],
      };
      const enabledProvider = {
        id: 'enabled-1',
        name: 'Enabled Provider',
        enabled: true,
        models: [{ id: 'model-in-enabled', name: 'Model' }],
      };
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [disabledProvider, enabledProvider],
        }),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      // Should skip the disabled provider and find the model in the enabled one
      const result = await resolveProviderContext(mockSettingsService, 'model-in-enabled');
      expect(result.provider?.id).toBe('enabled-1');

      // Should not find model that only exists in disabled provider
      const result2 = await resolveProviderContext(mockSettingsService, 'model-in-disabled');
      expect(result2.provider).toBeUndefined();
    });

    it('should perform case-insensitive model ID matching', async () => {
      const mockProvider = {
        id: 'provider-1',
        name: 'Provider 1',
        enabled: true,
        models: [{ id: 'Custom-Model-1', name: 'Custom Model' }],
      };
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [mockProvider],
        }),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await resolveProviderContext(mockSettingsService, 'custom-model-1');

      expect(result.provider).toEqual(mockProvider);
      expect(result.modelConfig?.id).toBe('Custom-Model-1');
    });

    it('should return error result on exception', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockRejectedValue(new Error('Settings error')),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await resolveProviderContext(mockSettingsService, 'some-model');

      expect(result.provider).toBeUndefined();
      expect(result.credentials).toBeUndefined();
      expect(result.resolvedModel).toBeUndefined();
      expect(result.modelConfig).toBeUndefined();
    });

    it('should persist and load provider config from server settings', async () => {
      // This test verifies the main bug fix: providers are loaded from server settings
      const savedProvider = {
        id: 'saved-provider-1',
        name: 'Saved Provider',
        enabled: true,
        apiKeySource: 'credentials' as const,
        models: [
          {
            id: 'saved-model-1',
            name: 'Saved Model',
            mapsToClaudeModel: 'sonnet',
          },
        ],
      };

      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [savedProvider],
        }),
        getCredentials: vi.fn().mockResolvedValue({
          anthropicApiKey: 'saved-api-key',
        }),
      } as unknown as SettingsService;

      // Simulate loading saved provider config
      const result = await resolveProviderContext(
        mockSettingsService,
        'saved-model-1',
        'saved-provider-1'
      );

      // Verify the provider is loaded from server settings
      expect(result.provider).toEqual(savedProvider);
      expect(result.provider?.id).toBe('saved-provider-1');
      expect(result.provider?.models).toHaveLength(1);
      expect(result.credentials?.anthropicApiKey).toBe('saved-api-key');
      // Verify model mapping is resolved
      expect(result.resolvedModel).toContain('claude');
    });

    it('should accept custom logPrefix parameter', async () => {
      // Verify that the logPrefix parameter is accepted (used by facade.ts)
      const mockProvider = {
        id: 'provider-1',
        name: 'Provider 1',
        enabled: true,
        models: [{ id: 'model-1', name: 'Model' }],
      };
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [mockProvider],
        }),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      // Call with custom logPrefix (as facade.ts does)
      const result = await resolveProviderContext(
        mockSettingsService,
        'model-1',
        undefined,
        '[CustomPrefix]'
      );

      // Function should work the same with custom prefix
      expect(result.provider).toEqual(mockProvider);
    });
  });

  describe('getAllProviderModels', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return all models from enabled providers', async () => {
      const mockProviders = [
        {
          id: 'provider-1',
          name: 'Provider 1',
          enabled: true,
          models: [
            { id: 'model-1', name: 'Model 1' },
            { id: 'model-2', name: 'Model 2' },
          ],
        },
        {
          id: 'provider-2',
          name: 'Provider 2',
          enabled: true,
          models: [{ id: 'model-3', name: 'Model 3' }],
        },
      ];
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: mockProviders,
        }),
      } as unknown as SettingsService;

      const result = await getAllProviderModels(mockSettingsService);

      expect(result).toHaveLength(3);
      expect(result[0].providerId).toBe('provider-1');
      expect(result[0].model.id).toBe('model-1');
      expect(result[2].providerId).toBe('provider-2');
    });

    it('should filter out disabled providers', async () => {
      const mockProviders = [
        {
          id: 'enabled-1',
          name: 'Enabled Provider',
          enabled: true,
          models: [{ id: 'model-1', name: 'Model 1' }],
        },
        {
          id: 'disabled-1',
          name: 'Disabled Provider',
          enabled: false,
          models: [{ id: 'model-2', name: 'Model 2' }],
        },
      ];
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: mockProviders,
        }),
      } as unknown as SettingsService;

      const result = await getAllProviderModels(mockSettingsService);

      expect(result).toHaveLength(1);
      expect(result[0].providerId).toBe('enabled-1');
    });

    it('should return empty array when no providers configured', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: [],
        }),
      } as unknown as SettingsService;

      const result = await getAllProviderModels(mockSettingsService);

      expect(result).toEqual([]);
    });

    it('should handle missing claudeCompatibleProviders field', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await getAllProviderModels(mockSettingsService);

      expect(result).toEqual([]);
    });

    it('should handle provider with no models', async () => {
      const mockProviders = [
        {
          id: 'provider-1',
          name: 'Provider 1',
          enabled: true,
          models: [],
        },
        {
          id: 'provider-2',
          name: 'Provider 2',
          enabled: true,
          // no models field
        },
      ];
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          claudeCompatibleProviders: mockProviders,
        }),
      } as unknown as SettingsService;

      const result = await getAllProviderModels(mockSettingsService);

      expect(result).toEqual([]);
    });

    it('should return empty array on exception', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockRejectedValue(new Error('Settings error')),
      } as unknown as SettingsService;

      const result = await getAllProviderModels(mockSettingsService);

      expect(result).toEqual([]);
    });
  });
});
