/**
 * Unit Tests: Pipeline Configuration Validation
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { PipelineConfigService } from '../../services/pipeline-config-service.js';
import * as secureFs from '../../lib/secure-fs.js';
import path from 'path';

describe('Pipeline Configuration Validation', () => {
  let configService: PipelineConfigService;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = path.join(process.cwd(), 'temp-test-config');
    await secureFs.ensureDir(tempDir);
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

      await secureFs.writeFile(
        path.join(tempDir, '.automaker', 'pipeline.json'),
        JSON.stringify(validConfig),
        'utf-8'
      );

      const config = await configService.loadPipelineConfig();
      expect(config).toEqual(validConfig);
    });

    it('should return null when configuration does not exist', async () => {
      const config = await configService.loadPipelineConfig();
      expect(config).toBeNull();
    });

    it('should throw error for invalid JSON', async () => {
      await secureFs.writeFile(
        path.join(tempDir, '.automaker', 'pipeline.json'),
        '{ invalid json }',
        'utf-8'
      );

      await expect(configService.loadPipelineConfig()).rejects.toThrow();
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

      const result = configService.validatePipelineConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should detect missing required fields', () => {
      const invalidConfig = {
        enabled: true,
        steps: [],
      };

      const result = configService.validatePipelineConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('version is required');
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

      const result = configService.validatePipelineConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'step 0: type must be one of: review, security, performance, test, custom'
      );
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

      const result = configService.validatePipelineConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('step 1: duplicate step id "duplicate"');
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

      const result = configService.validatePipelineConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'step 0: test coverageThreshold must be a number between 0 and 100'
      );
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

      const exists = await secureFs.pathExists(path.join(tempDir, '.automaker', 'pipeline.json'));
      expect(exists).toBe(true);
    });
  });
});
