import { describe, it, expect } from 'vitest';
import {
  convertMcpConfigsToSdkFormat,
  getDefaultEnabledMcpServerIds,
  validateMcpServerIds,
} from '@/lib/mcp-config.js';
import type { McpServerConfig } from '@automaker/types';

describe('mcp-config.ts', () => {
  // Helper to create test MCP server configs
  const createStdioConfig = (
    id: string,
    name: string,
    enabled: boolean,
    command = 'npx',
    args: string[] = ['-y', '@mcp/server-test'],
    env?: Record<string, string>
  ): McpServerConfig => ({
    id,
    name,
    transport: {
      type: 'stdio',
      command,
      args,
      ...(env && { env }),
    },
    enabled,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  });

  const createHttpConfig = (
    id: string,
    name: string,
    enabled: boolean,
    url = 'https://mcp.example.com',
    headers?: Record<string, string>
  ): McpServerConfig => ({
    id,
    name,
    transport: {
      type: 'http',
      url,
      ...(headers && { headers }),
    },
    enabled,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  });

  describe('convertMcpConfigsToSdkFormat', () => {
    describe('empty inputs', () => {
      it('should return empty object when configs array is empty', () => {
        const result = convertMcpConfigsToSdkFormat([], ['server-1']);
        expect(result).toEqual({});
      });

      it('should return empty object when enabledIds array is empty', () => {
        const configs = [createStdioConfig('server-1', 'Test Server', true)];
        const result = convertMcpConfigsToSdkFormat(configs, []);
        expect(result).toEqual({});
      });

      it('should return empty object when both arrays are empty', () => {
        const result = convertMcpConfigsToSdkFormat([], []);
        expect(result).toEqual({});
      });

      it('should return empty object when configs is null/undefined', () => {
        const result = convertMcpConfigsToSdkFormat(null as unknown as McpServerConfig[], ['id']);
        expect(result).toEqual({});
      });

      it('should return empty object when enabledIds is null/undefined', () => {
        const configs = [createStdioConfig('server-1', 'Test Server', true)];
        const result = convertMcpConfigsToSdkFormat(configs, null as unknown as string[]);
        expect(result).toEqual({});
      });
    });

    describe('stdio config conversion', () => {
      it('should convert stdio config to SDK format without type field', () => {
        const configs = [
          createStdioConfig('fs', 'Filesystem', true, 'npx', ['-y', '@mcp/server-fs']),
        ];
        const result = convertMcpConfigsToSdkFormat(configs, ['fs']);

        expect(result).toEqual({
          fs: {
            command: 'npx',
            args: ['-y', '@mcp/server-fs'],
          },
        });
        expect(result['fs']).not.toHaveProperty('type');
      });

      it('should include env when present and non-empty', () => {
        const configs = [
          createStdioConfig('server', 'Server', true, 'node', ['server.js'], {
            DEBUG: 'true',
            NODE_ENV: 'production',
          }),
        ];
        const result = convertMcpConfigsToSdkFormat(configs, ['server']);

        expect(result['server']).toEqual({
          command: 'node',
          args: ['server.js'],
          env: { DEBUG: 'true', NODE_ENV: 'production' },
        });
      });

      it('should not include env when empty object', () => {
        const config: McpServerConfig = {
          id: 'server',
          name: 'Server',
          transport: {
            type: 'stdio',
            command: 'node',
            args: ['server.js'],
            env: {},
          },
          enabled: true,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        };
        const result = convertMcpConfigsToSdkFormat([config], ['server']);

        expect(result['server']).not.toHaveProperty('env');
      });

      it('should preserve args array exactly', () => {
        const configs = [
          createStdioConfig('fs', 'Filesystem', true, 'npx', [
            '-y',
            '@modelcontextprotocol/server-filesystem',
            '/tmp',
          ]),
        ];
        const result = convertMcpConfigsToSdkFormat(configs, ['fs']);

        expect(result['fs'].args).toEqual([
          '-y',
          '@modelcontextprotocol/server-filesystem',
          '/tmp',
        ]);
      });
    });

    describe('http config conversion', () => {
      it('should convert http config to SDK format with type field', () => {
        const configs = [
          createHttpConfig('remote', 'Remote API', true, 'https://api.example.com/mcp'),
        ];
        const result = convertMcpConfigsToSdkFormat(configs, ['remote']);

        expect(result).toEqual({
          remote: {
            type: 'http',
            url: 'https://api.example.com/mcp',
          },
        });
      });

      it('should include headers when present and non-empty', () => {
        const configs = [
          createHttpConfig('remote', 'Remote API', true, 'https://api.example.com', {
            Authorization: 'Bearer token123',
            'X-Custom-Header': 'value',
          }),
        ];
        const result = convertMcpConfigsToSdkFormat(configs, ['remote']);

        expect(result['remote']).toEqual({
          type: 'http',
          url: 'https://api.example.com',
          headers: {
            Authorization: 'Bearer token123',
            'X-Custom-Header': 'value',
          },
        });
      });

      it('should not include headers when empty object', () => {
        const config: McpServerConfig = {
          id: 'remote',
          name: 'Remote',
          transport: {
            type: 'http',
            url: 'https://example.com',
            headers: {},
          },
          enabled: true,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        };
        const result = convertMcpConfigsToSdkFormat([config], ['remote']);

        expect(result['remote']).not.toHaveProperty('headers');
      });
    });

    describe('filtering by enabled IDs', () => {
      it('should only include servers whose IDs are in enabledIds', () => {
        const configs = [
          createStdioConfig('server-1', 'Server 1', true),
          createStdioConfig('server-2', 'Server 2', true),
          createStdioConfig('server-3', 'Server 3', true),
        ];
        const result = convertMcpConfigsToSdkFormat(configs, ['server-1', 'server-3']);

        expect(Object.keys(result)).toEqual(['server-1', 'server-3']);
        expect(result).not.toHaveProperty('server-2');
      });

      it('should ignore enabledIds that do not exist in configs', () => {
        const configs = [createStdioConfig('server-1', 'Server 1', true)];
        const result = convertMcpConfigsToSdkFormat(configs, ['server-1', 'non-existent']);

        expect(Object.keys(result)).toEqual(['server-1']);
      });

      it('should filter regardless of server enabled flag', () => {
        // Even if server.enabled is false, if ID is in enabledIds it should be included
        const configs = [createStdioConfig('server-1', 'Server 1', false)];
        const result = convertMcpConfigsToSdkFormat(configs, ['server-1']);

        expect(Object.keys(result)).toEqual(['server-1']);
      });
    });

    describe('mixed transport types', () => {
      it('should handle mixed stdio and http configs correctly', () => {
        const configs = [
          createStdioConfig('local-fs', 'Local Filesystem', true, 'npx', ['-y', '@mcp/server-fs']),
          createHttpConfig('cloud-api', 'Cloud API', true, 'https://cloud.example.com/mcp', {
            Authorization: 'Bearer xyz',
          }),
        ];
        const result = convertMcpConfigsToSdkFormat(configs, ['local-fs', 'cloud-api']);

        // Stdio config should not have type field
        expect(result['local-fs']).toEqual({
          command: 'npx',
          args: ['-y', '@mcp/server-fs'],
        });
        expect(result['local-fs']).not.toHaveProperty('type');

        // HTTP config should have type field
        expect(result['cloud-api']).toEqual({
          type: 'http',
          url: 'https://cloud.example.com/mcp',
          headers: { Authorization: 'Bearer xyz' },
        });
      });

      it('should preserve order based on configs array', () => {
        const configs = [
          createHttpConfig('http-server', 'HTTP Server', true),
          createStdioConfig('stdio-server', 'Stdio Server', true),
        ];
        const result = convertMcpConfigsToSdkFormat(configs, ['http-server', 'stdio-server']);

        const keys = Object.keys(result);
        expect(keys).toEqual(['http-server', 'stdio-server']);
      });
    });

    describe('edge cases', () => {
      it('should handle server configs with description', () => {
        const config: McpServerConfig = {
          id: 'fs',
          name: 'Filesystem',
          description: 'Provides filesystem access',
          transport: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@mcp/server-fs'],
          },
          enabled: true,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        };
        const result = convertMcpConfigsToSdkFormat([config], ['fs']);

        // Description should not appear in SDK config
        expect(result['fs']).not.toHaveProperty('description');
        expect(result['fs']).not.toHaveProperty('name');
        expect(result['fs']).not.toHaveProperty('id');
      });

      it('should handle duplicate IDs in enabledIds', () => {
        const configs = [createStdioConfig('server-1', 'Server 1', true)];
        const result = convertMcpConfigsToSdkFormat(configs, ['server-1', 'server-1', 'server-1']);

        expect(Object.keys(result)).toEqual(['server-1']);
      });
    });
  });

  describe('getDefaultEnabledMcpServerIds', () => {
    it('should return empty array when configs is empty', () => {
      const result = getDefaultEnabledMcpServerIds([]);
      expect(result).toEqual([]);
    });

    it('should return empty array when configs is null/undefined', () => {
      const result = getDefaultEnabledMcpServerIds(null as unknown as McpServerConfig[]);
      expect(result).toEqual([]);
    });

    it('should return IDs of all enabled servers', () => {
      const configs = [
        createStdioConfig('server-1', 'Server 1', true),
        createStdioConfig('server-2', 'Server 2', true),
        createStdioConfig('server-3', 'Server 3', true),
      ];
      const result = getDefaultEnabledMcpServerIds(configs);

      expect(result).toEqual(['server-1', 'server-2', 'server-3']);
    });

    it('should return empty array when all servers are disabled', () => {
      const configs = [
        createStdioConfig('server-1', 'Server 1', false),
        createStdioConfig('server-2', 'Server 2', false),
      ];
      const result = getDefaultEnabledMcpServerIds(configs);

      expect(result).toEqual([]);
    });

    it('should return only IDs of enabled servers when mixed', () => {
      const configs = [
        createStdioConfig('enabled-1', 'Enabled 1', true),
        createStdioConfig('disabled-1', 'Disabled 1', false),
        createStdioConfig('enabled-2', 'Enabled 2', true),
        createStdioConfig('disabled-2', 'Disabled 2', false),
      ];
      const result = getDefaultEnabledMcpServerIds(configs);

      expect(result).toEqual(['enabled-1', 'enabled-2']);
    });

    it('should work with both stdio and http configs', () => {
      const configs = [
        createStdioConfig('local', 'Local', true),
        createHttpConfig('remote', 'Remote', true),
        createStdioConfig('disabled-local', 'Disabled Local', false),
      ];
      const result = getDefaultEnabledMcpServerIds(configs);

      expect(result).toEqual(['local', 'remote']);
    });

    it('should preserve order from configs array', () => {
      const configs = [
        createStdioConfig('z-server', 'Z Server', true),
        createStdioConfig('a-server', 'A Server', true),
        createStdioConfig('m-server', 'M Server', true),
      ];
      const result = getDefaultEnabledMcpServerIds(configs);

      expect(result).toEqual(['z-server', 'a-server', 'm-server']);
    });
  });

  describe('validateMcpServerIds', () => {
    describe('empty inputs', () => {
      it('should return empty arrays when enabledIds is empty', () => {
        const configs = [createStdioConfig('server-1', 'Server 1', true)];
        const result = validateMcpServerIds(configs, []);

        expect(result).toEqual({ validIds: [], invalidIds: [] });
      });

      it('should return empty arrays when enabledIds is null/undefined', () => {
        const configs = [createStdioConfig('server-1', 'Server 1', true)];
        const result = validateMcpServerIds(configs, null as unknown as string[]);

        expect(result).toEqual({ validIds: [], invalidIds: [] });
      });

      it('should handle empty configs array', () => {
        const result = validateMcpServerIds([], ['server-1', 'server-2']);

        expect(result.validIds).toEqual([]);
        expect(result.invalidIds).toEqual(['server-1', 'server-2']);
      });

      it('should handle null/undefined configs', () => {
        const result = validateMcpServerIds(null as unknown as McpServerConfig[], ['server-1']);

        expect(result.validIds).toEqual([]);
        expect(result.invalidIds).toEqual(['server-1']);
      });
    });

    describe('all valid IDs', () => {
      it('should return all IDs as valid when all exist in configs', () => {
        const configs = [
          createStdioConfig('server-1', 'Server 1', true),
          createStdioConfig('server-2', 'Server 2', true),
          createStdioConfig('server-3', 'Server 3', true),
        ];
        const result = validateMcpServerIds(configs, ['server-1', 'server-2', 'server-3']);

        expect(result.validIds).toEqual(['server-1', 'server-2', 'server-3']);
        expect(result.invalidIds).toEqual([]);
      });

      it('should validate subset of available configs', () => {
        const configs = [
          createStdioConfig('server-1', 'Server 1', true),
          createStdioConfig('server-2', 'Server 2', true),
          createStdioConfig('server-3', 'Server 3', true),
        ];
        const result = validateMcpServerIds(configs, ['server-1', 'server-3']);

        expect(result.validIds).toEqual(['server-1', 'server-3']);
        expect(result.invalidIds).toEqual([]);
      });
    });

    describe('all invalid IDs', () => {
      it('should return all IDs as invalid when none exist in configs', () => {
        const configs = [createStdioConfig('existing', 'Existing', true)];
        const result = validateMcpServerIds(configs, ['non-existent-1', 'non-existent-2']);

        expect(result.validIds).toEqual([]);
        expect(result.invalidIds).toEqual(['non-existent-1', 'non-existent-2']);
      });
    });

    describe('mixed valid and invalid IDs', () => {
      it('should correctly categorize mixed IDs', () => {
        const configs = [
          createStdioConfig('server-1', 'Server 1', true),
          createStdioConfig('server-2', 'Server 2', true),
        ];
        const result = validateMcpServerIds(configs, [
          'server-1',
          'deleted-server',
          'server-2',
          'another-deleted',
        ]);

        expect(result.validIds).toEqual(['server-1', 'server-2']);
        expect(result.invalidIds).toEqual(['deleted-server', 'another-deleted']);
      });

      it('should preserve order from enabledIds', () => {
        const configs = [
          createStdioConfig('z-server', 'Z Server', true),
          createStdioConfig('a-server', 'A Server', true),
        ];
        const result = validateMcpServerIds(configs, [
          'invalid-1',
          'z-server',
          'invalid-2',
          'a-server',
        ]);

        expect(result.validIds).toEqual(['z-server', 'a-server']);
        expect(result.invalidIds).toEqual(['invalid-1', 'invalid-2']);
      });
    });

    describe('edge cases', () => {
      it('should validate regardless of server enabled flag', () => {
        const configs = [
          createStdioConfig('enabled', 'Enabled', true),
          createStdioConfig('disabled', 'Disabled', false),
        ];
        const result = validateMcpServerIds(configs, ['enabled', 'disabled']);

        expect(result.validIds).toEqual(['enabled', 'disabled']);
        expect(result.invalidIds).toEqual([]);
      });

      it('should handle duplicate IDs in enabledIds', () => {
        const configs = [createStdioConfig('server-1', 'Server 1', true)];
        const result = validateMcpServerIds(configs, [
          'server-1',
          'server-1',
          'invalid',
          'invalid',
        ]);

        expect(result.validIds).toEqual(['server-1', 'server-1']);
        expect(result.invalidIds).toEqual(['invalid', 'invalid']);
      });

      it('should work with http configs', () => {
        const configs = [createHttpConfig('remote', 'Remote', true)];
        const result = validateMcpServerIds(configs, ['remote', 'non-existent']);

        expect(result.validIds).toEqual(['remote']);
        expect(result.invalidIds).toEqual(['non-existent']);
      });
    });
  });
});
