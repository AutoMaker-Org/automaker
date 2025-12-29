import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMCPServersFromSettings, getMCPPermissionSettings } from '@/lib/settings-helpers.js';
import type { SettingsService } from '@/services/settings-service.js';

describe('settings-helpers.ts', () => {
  describe('getMCPServersFromSettings', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
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
      expect(console.error).toHaveBeenCalled();
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

  describe('getMCPPermissionSettings', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should return defaults when settingsService is null', async () => {
      const result = await getMCPPermissionSettings(null);
      expect(result).toEqual({
        mcpAutoApproveTools: true,
        mcpUnrestrictedTools: true,
      });
    });

    it('should return defaults when settingsService is undefined', async () => {
      const result = await getMCPPermissionSettings(undefined);
      expect(result).toEqual({
        mcpAutoApproveTools: true,
        mcpUnrestrictedTools: true,
      });
    });

    it('should return settings from service', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpAutoApproveTools: false,
          mcpUnrestrictedTools: false,
        }),
      } as unknown as SettingsService;

      const result = await getMCPPermissionSettings(mockSettingsService);
      expect(result).toEqual({
        mcpAutoApproveTools: false,
        mcpUnrestrictedTools: false,
      });
    });

    it('should default to true when settings are undefined', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await getMCPPermissionSettings(mockSettingsService);
      expect(result).toEqual({
        mcpAutoApproveTools: true,
        mcpUnrestrictedTools: true,
      });
    });

    it('should handle mixed settings', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpAutoApproveTools: true,
          mcpUnrestrictedTools: false,
        }),
      } as unknown as SettingsService;

      const result = await getMCPPermissionSettings(mockSettingsService);
      expect(result).toEqual({
        mcpAutoApproveTools: true,
        mcpUnrestrictedTools: false,
      });
    });

    it('should return defaults and log error on exception', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockRejectedValue(new Error('Settings error')),
      } as unknown as SettingsService;

      const result = await getMCPPermissionSettings(mockSettingsService, '[Test]');
      expect(result).toEqual({
        mcpAutoApproveTools: true,
        mcpUnrestrictedTools: true,
      });
      expect(console.error).toHaveBeenCalled();
    });

    it('should use custom log prefix', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpAutoApproveTools: true,
          mcpUnrestrictedTools: true,
        }),
      } as unknown as SettingsService;

      await getMCPPermissionSettings(mockSettingsService, '[CustomPrefix]');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[CustomPrefix]'));
    });
  });
});
