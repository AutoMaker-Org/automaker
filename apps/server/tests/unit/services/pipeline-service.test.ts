import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { PipelineService } from '@/services/pipeline-service.js';
import type { PipelineConfig, PipelineStep } from '@automaker/types';

// Mock secure-fs
vi.mock('@/lib/secure-fs.js', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
}));

// Mock ensureAutomakerDir
vi.mock('@automaker/platform', () => ({
  ensureAutomakerDir: vi.fn(),
}));

import * as secureFs from '@/lib/secure-fs.js';
import { ensureAutomakerDir } from '@automaker/platform';

describe('pipeline-service.ts', () => {
  let testProjectDir: string;
  let pipelineService: PipelineService;

  beforeEach(async () => {
    testProjectDir = path.join(os.tmpdir(), `pipeline-test-${Date.now()}`);
    await fs.mkdir(testProjectDir, { recursive: true });
    pipelineService = new PipelineService();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    try {
      await fs.rm(testProjectDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getPipelineConfig', () => {
    it('should return default config when file does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(secureFs.readFile).mockRejectedValue(error);

      const config = await pipelineService.getPipelineConfig(testProjectDir);

      expect(config).toEqual({
        version: 1,
        steps: [],
      });
    });

    it('should read and return existing config', async () => {
      const existingConfig: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Test Step',
            order: 0,
            instructions: 'Do something',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const configPath = path.join(testProjectDir, '.automaker', 'pipeline.json');
      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingConfig) as any);

      const config = await pipelineService.getPipelineConfig(testProjectDir);

      expect(secureFs.readFile).toHaveBeenCalledWith(configPath, 'utf-8');
      expect(config).toEqual(existingConfig);
    });

    it('should merge with defaults for missing properties', async () => {
      const partialConfig = {
        steps: [
          {
            id: 'step1',
            name: 'Test Step',
            order: 0,
            instructions: 'Do something',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const configPath = path.join(testProjectDir, '.automaker', 'pipeline.json');
      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(partialConfig) as any);

      const config = await pipelineService.getPipelineConfig(testProjectDir);

      expect(config.version).toBe(1);
      expect(config.steps).toHaveLength(1);
    });

    it('should handle read errors gracefully', async () => {
      const error = new Error('Read error');
      vi.mocked(secureFs.readFile).mockRejectedValue(error);

      const config = await pipelineService.getPipelineConfig(testProjectDir);

      // Should return default config on error
      expect(config).toEqual({
        version: 1,
        steps: [],
      });
    });
  });

  describe('savePipelineConfig', () => {
    it('should save config to file', async () => {
      const config: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Test Step',
            order: 0,
            instructions: 'Do something',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(ensureAutomakerDir).mockResolvedValue(undefined);
      vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
      vi.mocked(secureFs.rename).mockResolvedValue(undefined);

      await pipelineService.savePipelineConfig(testProjectDir, config);

      expect(ensureAutomakerDir).toHaveBeenCalledWith(testProjectDir);
      expect(secureFs.writeFile).toHaveBeenCalled();
      expect(secureFs.rename).toHaveBeenCalled();
    });

    it('should use atomic write pattern', async () => {
      const config: PipelineConfig = {
        version: 1,
        steps: [],
      };

      vi.mocked(ensureAutomakerDir).mockResolvedValue(undefined);
      vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
      vi.mocked(secureFs.rename).mockResolvedValue(undefined);

      await pipelineService.savePipelineConfig(testProjectDir, config);

      const writeCall = vi.mocked(secureFs.writeFile).mock.calls[0];
      const tempPath = writeCall[0] as string;
      expect(tempPath).toContain('.tmp.');
      expect(tempPath).toContain('pipeline.json');
    });

    it('should clean up temp file on write error', async () => {
      const config: PipelineConfig = {
        version: 1,
        steps: [],
      };

      vi.mocked(ensureAutomakerDir).mockResolvedValue(undefined);
      vi.mocked(secureFs.writeFile).mockRejectedValue(new Error('Write failed'));
      vi.mocked(secureFs.unlink).mockResolvedValue(undefined);

      await expect(pipelineService.savePipelineConfig(testProjectDir, config)).rejects.toThrow(
        'Write failed'
      );

      expect(secureFs.unlink).toHaveBeenCalled();
    });
  });

  describe('addStep', () => {
    it('should add a new step to config', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(secureFs.readFile).mockRejectedValue(error);
      vi.mocked(ensureAutomakerDir).mockResolvedValue(undefined);
      vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
      vi.mocked(secureFs.rename).mockResolvedValue(undefined);

      const stepData = {
        name: 'New Step',
        order: 0,
        instructions: 'Do something',
        colorClass: 'blue',
      };

      const newStep = await pipelineService.addStep(testProjectDir, stepData);

      expect(newStep.name).toBe('New Step');
      expect(newStep.id).toMatch(/^step_/);
      expect(newStep.createdAt).toBeDefined();
      expect(newStep.updatedAt).toBeDefined();
      expect(newStep.createdAt).toBe(newStep.updatedAt);
    });

    it('should normalize order values after adding step', async () => {
      const existingConfig: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            order: 5, // Out of order
            instructions: 'Do something',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingConfig) as any);
      vi.mocked(ensureAutomakerDir).mockResolvedValue(undefined);
      vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
      vi.mocked(secureFs.rename).mockResolvedValue(undefined);

      const stepData = {
        name: 'New Step',
        order: 10, // Out of order
        instructions: 'Do something',
        colorClass: 'red',
      };

      await pipelineService.addStep(testProjectDir, stepData);

      const writeCall = vi.mocked(secureFs.writeFile).mock.calls[0];
      const savedConfig = JSON.parse(writeCall[1] as string) as PipelineConfig;
      expect(savedConfig.steps[0].order).toBe(0);
      expect(savedConfig.steps[1].order).toBe(1);
    });

    it('should sort steps by order before normalizing', async () => {
      const existingConfig: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            order: 2,
            instructions: 'Do something',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'step2',
            name: 'Step 2',
            order: 0,
            instructions: 'Do something else',
            colorClass: 'green',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingConfig) as any);
      vi.mocked(ensureAutomakerDir).mockResolvedValue(undefined);
      vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
      vi.mocked(secureFs.rename).mockResolvedValue(undefined);

      const stepData = {
        name: 'New Step',
        order: 1,
        instructions: 'Do something',
        colorClass: 'red',
      };

      await pipelineService.addStep(testProjectDir, stepData);

      const writeCall = vi.mocked(secureFs.writeFile).mock.calls[0];
      const savedConfig = JSON.parse(writeCall[1] as string) as PipelineConfig;
      // Should be sorted: step2 (order 0), newStep (order 1), step1 (order 2)
      expect(savedConfig.steps[0].id).toBe('step2');
      expect(savedConfig.steps[0].order).toBe(0);
      expect(savedConfig.steps[1].order).toBe(1);
      expect(savedConfig.steps[2].id).toBe('step1');
      expect(savedConfig.steps[2].order).toBe(2);
    });
  });

  describe('updateStep', () => {
    it('should update an existing step', async () => {
      const existingConfig: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Old Name',
            order: 0,
            instructions: 'Old instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingConfig) as any);
      vi.mocked(ensureAutomakerDir).mockResolvedValue(undefined);
      vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
      vi.mocked(secureFs.rename).mockResolvedValue(undefined);

      const updates = {
        name: 'New Name',
        instructions: 'New instructions',
      };

      const updatedStep = await pipelineService.updateStep(testProjectDir, 'step1', updates);

      expect(updatedStep.name).toBe('New Name');
      expect(updatedStep.instructions).toBe('New instructions');
      expect(updatedStep.id).toBe('step1');
      expect(updatedStep.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(updatedStep.updatedAt).not.toBe('2024-01-01T00:00:00.000Z');
    });

    it('should throw error if step not found', async () => {
      const existingConfig: PipelineConfig = {
        version: 1,
        steps: [],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingConfig) as any);

      await expect(
        pipelineService.updateStep(testProjectDir, 'nonexistent', { name: 'New' })
      ).rejects.toThrow('Pipeline step not found: nonexistent');
    });

    it('should preserve createdAt when updating', async () => {
      const existingConfig: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step',
            order: 0,
            instructions: 'Instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingConfig) as any);
      vi.mocked(ensureAutomakerDir).mockResolvedValue(undefined);
      vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
      vi.mocked(secureFs.rename).mockResolvedValue(undefined);

      const updatedStep = await pipelineService.updateStep(testProjectDir, 'step1', {
        name: 'Updated',
      });

      expect(updatedStep.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('deleteStep', () => {
    it('should delete an existing step', async () => {
      const existingConfig: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            order: 0,
            instructions: 'Instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'step2',
            name: 'Step 2',
            order: 1,
            instructions: 'Instructions',
            colorClass: 'green',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingConfig) as any);
      vi.mocked(ensureAutomakerDir).mockResolvedValue(undefined);
      vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
      vi.mocked(secureFs.rename).mockResolvedValue(undefined);

      await pipelineService.deleteStep(testProjectDir, 'step1');

      const writeCall = vi.mocked(secureFs.writeFile).mock.calls[0];
      const savedConfig = JSON.parse(writeCall[1] as string) as PipelineConfig;
      expect(savedConfig.steps).toHaveLength(1);
      expect(savedConfig.steps[0].id).toBe('step2');
      expect(savedConfig.steps[0].order).toBe(0); // Normalized
    });

    it('should throw error if step not found', async () => {
      const existingConfig: PipelineConfig = {
        version: 1,
        steps: [],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingConfig) as any);

      await expect(pipelineService.deleteStep(testProjectDir, 'nonexistent')).rejects.toThrow(
        'Pipeline step not found: nonexistent'
      );
    });

    it('should normalize order values after deletion', async () => {
      const existingConfig: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            order: 0,
            instructions: 'Instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'step2',
            name: 'Step 2',
            order: 5, // Out of order
            instructions: 'Instructions',
            colorClass: 'green',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'step3',
            name: 'Step 3',
            order: 10, // Out of order
            instructions: 'Instructions',
            colorClass: 'red',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingConfig) as any);
      vi.mocked(ensureAutomakerDir).mockResolvedValue(undefined);
      vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
      vi.mocked(secureFs.rename).mockResolvedValue(undefined);

      await pipelineService.deleteStep(testProjectDir, 'step2');

      const writeCall = vi.mocked(secureFs.writeFile).mock.calls[0];
      const savedConfig = JSON.parse(writeCall[1] as string) as PipelineConfig;
      expect(savedConfig.steps).toHaveLength(2);
      expect(savedConfig.steps[0].order).toBe(0);
      expect(savedConfig.steps[1].order).toBe(1);
    });
  });

  describe('reorderSteps', () => {
    it('should reorder steps according to stepIds array', async () => {
      const existingConfig: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            order: 0,
            instructions: 'Instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'step2',
            name: 'Step 2',
            order: 1,
            instructions: 'Instructions',
            colorClass: 'green',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'step3',
            name: 'Step 3',
            order: 2,
            instructions: 'Instructions',
            colorClass: 'red',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingConfig) as any);
      vi.mocked(ensureAutomakerDir).mockResolvedValue(undefined);
      vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
      vi.mocked(secureFs.rename).mockResolvedValue(undefined);

      await pipelineService.reorderSteps(testProjectDir, ['step3', 'step1', 'step2']);

      const writeCall = vi.mocked(secureFs.writeFile).mock.calls[0];
      const savedConfig = JSON.parse(writeCall[1] as string) as PipelineConfig;
      expect(savedConfig.steps[0].id).toBe('step3');
      expect(savedConfig.steps[0].order).toBe(0);
      expect(savedConfig.steps[1].id).toBe('step1');
      expect(savedConfig.steps[1].order).toBe(1);
      expect(savedConfig.steps[2].id).toBe('step2');
      expect(savedConfig.steps[2].order).toBe(2);
    });

    it('should update updatedAt timestamp for reordered steps', async () => {
      const existingConfig: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            order: 0,
            instructions: 'Instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'step2',
            name: 'Step 2',
            order: 1,
            instructions: 'Instructions',
            colorClass: 'green',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingConfig) as any);
      vi.mocked(ensureAutomakerDir).mockResolvedValue(undefined);
      vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
      vi.mocked(secureFs.rename).mockResolvedValue(undefined);

      await pipelineService.reorderSteps(testProjectDir, ['step2', 'step1']);

      const writeCall = vi.mocked(secureFs.writeFile).mock.calls[0];
      const savedConfig = JSON.parse(writeCall[1] as string) as PipelineConfig;
      expect(savedConfig.steps[0].updatedAt).not.toBe('2024-01-01T00:00:00.000Z');
      expect(savedConfig.steps[1].updatedAt).not.toBe('2024-01-01T00:00:00.000Z');
    });

    it('should throw error if step ID not found', async () => {
      const existingConfig: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            order: 0,
            instructions: 'Instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingConfig) as any);

      await expect(
        pipelineService.reorderSteps(testProjectDir, ['step1', 'nonexistent'])
      ).rejects.toThrow('Pipeline step not found: nonexistent');
    });

    it('should allow partial reordering (filtering steps)', async () => {
      const existingConfig: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            order: 0,
            instructions: 'Instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'step2',
            name: 'Step 2',
            order: 1,
            instructions: 'Instructions',
            colorClass: 'green',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingConfig) as any);
      vi.mocked(ensureAutomakerDir).mockResolvedValue(undefined);
      vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
      vi.mocked(secureFs.rename).mockResolvedValue(undefined);

      await pipelineService.reorderSteps(testProjectDir, ['step1']);

      const writeCall = vi.mocked(secureFs.writeFile).mock.calls[0];
      const savedConfig = JSON.parse(writeCall[1] as string) as PipelineConfig;
      // Should only keep step1, effectively filtering out step2
      expect(savedConfig.steps).toHaveLength(1);
      expect(savedConfig.steps[0].id).toBe('step1');
      expect(savedConfig.steps[0].order).toBe(0);
    });
  });

  describe('getNextStatus', () => {
    it('should return waiting_approval when no pipeline and skipTests is true', () => {
      const nextStatus = pipelineService.getNextStatus('in_progress', null, true);
      expect(nextStatus).toBe('waiting_approval');
    });

    it('should return verified when no pipeline and skipTests is false', () => {
      const nextStatus = pipelineService.getNextStatus('in_progress', null, false);
      expect(nextStatus).toBe('verified');
    });

    it('should return first pipeline step when coming from in_progress', () => {
      const config: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            order: 0,
            instructions: 'Instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const nextStatus = pipelineService.getNextStatus('in_progress', config, false);
      expect(nextStatus).toBe('pipeline_step1');
    });

    it('should go to next pipeline step when in middle of pipeline', () => {
      const config: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            order: 0,
            instructions: 'Instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'step2',
            name: 'Step 2',
            order: 1,
            instructions: 'Instructions',
            colorClass: 'green',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const nextStatus = pipelineService.getNextStatus('pipeline_step1', config, false);
      expect(nextStatus).toBe('pipeline_step2');
    });

    it('should go to final status when completing last pipeline step', () => {
      const config: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            order: 0,
            instructions: 'Instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const nextStatus = pipelineService.getNextStatus('pipeline_step1', config, false);
      expect(nextStatus).toBe('verified');
    });

    it('should go to waiting_approval when completing last step with skipTests', () => {
      const config: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            order: 0,
            instructions: 'Instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const nextStatus = pipelineService.getNextStatus('pipeline_step1', config, true);
      expect(nextStatus).toBe('waiting_approval');
    });

    it('should handle invalid pipeline step ID gracefully', () => {
      const config: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            order: 0,
            instructions: 'Instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const nextStatus = pipelineService.getNextStatus('pipeline_nonexistent', config, false);
      expect(nextStatus).toBe('verified');
    });

    it('should preserve other statuses unchanged', () => {
      const config: PipelineConfig = {
        version: 1,
        steps: [],
      };

      expect(pipelineService.getNextStatus('backlog', config, false)).toBe('backlog');
      expect(pipelineService.getNextStatus('waiting_approval', config, false)).toBe(
        'waiting_approval'
      );
      expect(pipelineService.getNextStatus('verified', config, false)).toBe('verified');
      expect(pipelineService.getNextStatus('completed', config, false)).toBe('completed');
    });

    it('should sort steps by order when determining next status', () => {
      const config: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step2',
            name: 'Step 2',
            order: 1,
            instructions: 'Instructions',
            colorClass: 'green',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'step1',
            name: 'Step 1',
            order: 0,
            instructions: 'Instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const nextStatus = pipelineService.getNextStatus('in_progress', config, false);
      expect(nextStatus).toBe('pipeline_step1'); // Should use step1 (order 0), not step2
    });
  });

  describe('getStep', () => {
    it('should return step by ID', async () => {
      const existingConfig: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            order: 0,
            instructions: 'Instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingConfig) as any);

      const step = await pipelineService.getStep(testProjectDir, 'step1');

      expect(step).not.toBeNull();
      expect(step?.id).toBe('step1');
      expect(step?.name).toBe('Step 1');
    });

    it('should return null if step not found', async () => {
      const existingConfig: PipelineConfig = {
        version: 1,
        steps: [],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingConfig) as any);

      const step = await pipelineService.getStep(testProjectDir, 'nonexistent');

      expect(step).toBeNull();
    });
  });

  describe('isPipelineStatus', () => {
    it('should return true for pipeline statuses', () => {
      expect(pipelineService.isPipelineStatus('pipeline_step1')).toBe(true);
      expect(pipelineService.isPipelineStatus('pipeline_abc123')).toBe(true);
    });

    it('should return false for non-pipeline statuses', () => {
      expect(pipelineService.isPipelineStatus('in_progress')).toBe(false);
      expect(pipelineService.isPipelineStatus('waiting_approval')).toBe(false);
      expect(pipelineService.isPipelineStatus('verified')).toBe(false);
      expect(pipelineService.isPipelineStatus('backlog')).toBe(false);
      expect(pipelineService.isPipelineStatus('completed')).toBe(false);
    });
  });

  describe('getStepIdFromStatus', () => {
    it('should extract step ID from pipeline status', () => {
      expect(pipelineService.getStepIdFromStatus('pipeline_step1')).toBe('step1');
      expect(pipelineService.getStepIdFromStatus('pipeline_abc123')).toBe('abc123');
    });

    it('should return null for non-pipeline statuses', () => {
      expect(pipelineService.getStepIdFromStatus('in_progress')).toBeNull();
      expect(pipelineService.getStepIdFromStatus('waiting_approval')).toBeNull();
      expect(pipelineService.getStepIdFromStatus('verified')).toBeNull();
    });
  });
});
