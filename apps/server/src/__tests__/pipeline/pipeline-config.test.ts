/**
 * Unit Tests: Pipeline Configuration Validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PipelineConfigService } from '../../services/pipeline-config-service.js';
import * as secureFs from '../../lib/secure-fs.js';
import { DEFAULT_PIPELINE_CONFIG } from '@automaker/types';
import path from 'path';

describe('Pipeline Configuration Validation', () => {
  let configService: PipelineConfigService;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = path.join(process.cwd(), 'temp-test-config');
    await secureFs.mkdir(tempDir, { recursive: true });
    configService = new PipelineConfigService(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await secureFs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadPipelineConfig', () => {
    it('should load valid configuration', async () => {
      const validConfig = {
        version: '1.0',
        enabled: true,
        onFailure: 'stop',
        steps: [
          {
            id: 'review',
            type: 'review',
            name: 'Code Review',
            model: 'opus',
            required: true,
            autoTrigger: true,
            config: {
              focus: ['quality'],
              maxIssues: 10,
            },
          },
        ],
      };

      await secureFs.mkdir(path.join(tempDir, '.automaker'), { recursive: true });
      await secureFs.writeFile(
        path.join(tempDir, '.automaker', 'pipeline.json'),
        JSON.stringify(validConfig),
        'utf-8'
      );

      const config = await configService.loadPipelineConfig();
      expect(config).toEqual(validConfig);
    });

    it('should return DEFAULT_PIPELINE_CONFIG when configuration does not exist', async () => {
      const config = await configService.loadPipelineConfig();
      expect(config).toEqual(DEFAULT_PIPELINE_CONFIG);
    });

    it('should return DEFAULT_PIPELINE_CONFIG for invalid JSON', async () => {
      await secureFs.mkdir(path.join(tempDir, '.automaker'), { recursive: true });
      await secureFs.writeFile(
        path.join(tempDir, '.automaker', 'pipeline.json'),
        '{ invalid json }',
        'utf-8'
      );

      const config = await configService.loadPipelineConfig();
      expect(config).toEqual(DEFAULT_PIPELINE_CONFIG);
    });
  });

  describe('validatePipelineConfig', () => {
    it('should validate correct configuration', () => {
      const validConfig = {
        version: '1.0',
        enabled: true,
        onFailure: 'stop',
        steps: [
          {
            id: 'review',
            type: 'review',
            name: 'Code Review',
            model: 'opus',
            required: true,
            autoTrigger: true,
            config: {
              focus: ['quality'],
              maxIssues: 10,
            },
          },
        ],
      };

      const result = configService.validateConfig(validConfig);
      expect(result).toBe(true);
    });

    it('should detect missing required fields', () => {
      const invalidConfig = {
        enabled: true,
        steps: [],
      };

      const result = configService.validateConfig(invalidConfig);
      expect(result).toBe(false);
    });

    it('should detect invalid step types', () => {
      const invalidConfig = {
        version: '1.0',
        enabled: true,
        steps: [
          {
            id: 'invalid',
            type: 'invalid-type' as any,
            name: 'Invalid Step',
            model: 'opus',
            required: true,
            autoTrigger: true,
            config: {},
          },
        ],
      };

      const result = configService.validateConfig(invalidConfig);
      expect(result).toBe(false);
    });

    it('should detect duplicate step IDs', () => {
      const invalidConfig = {
        version: '1.0',
        enabled: true,
        steps: [
          {
            id: 'duplicate',
            type: 'review',
            name: 'Step 1',
            model: 'opus',
            required: true,
            autoTrigger: true,
            config: {},
          },
          {
            id: 'duplicate',
            type: 'security',
            name: 'Step 2',
            model: 'opus',
            required: false,
            autoTrigger: true,
            config: {},
          },
        ],
      };

      const result = configService.validateConfig(invalidConfig);
      expect(result).toBe(false);
    });

    it('should validate step-specific configurations', () => {
      const invalidConfig = {
        version: '1.0',
        enabled: true,
        steps: [
          {
            id: 'test',
            type: 'test',
            name: 'Test Step',
            model: 'opus',
            required: true,
            autoTrigger: true,
            config: {
              coverageThreshold: 150, // Invalid: > 100
            },
          },
        ],
      };

      const result = configService.validateConfig(invalidConfig);
      expect(result).toBe(false);
    });
  });

  describe('savePipelineConfig', () => {
    it('should save configuration successfully', async () => {
      const config = {
        version: '1.0',
        enabled: true,
        onFailure: 'continue',
        steps: [],
      };

      await secureFs.mkdir(path.join(tempDir, '.automaker'), { recursive: true });
      await configService.savePipelineConfig(config);

      const savedContent = await secureFs.readFile(
        path.join(tempDir, '.automaker', 'pipeline.json'),
        'utf-8'
      );
      const savedConfig = JSON.parse(savedContent);
      expect(savedConfig).toEqual(config);
    });

    it('should create directory if it does not exist', async () => {
      const config = {
        version: '1.0',
        enabled: true,
        onFailure: 'continue',
        steps: [],
      };

      await configService.savePipelineConfig(config);

      const exists = await secureFs.access(path.join(tempDir, '.automaker', 'pipeline.json'));
      expect(exists).not.toThrow();
    });
  });
});
