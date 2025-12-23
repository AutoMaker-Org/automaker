/**
 * Integration Tests: Complete Pipeline Execution
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { AutoModeService } from '../../services/auto-mode-service.js';
import { PipelineConfigService } from '../../services/pipeline-config-service.js';
import { FeatureLoader } from '../../services/feature-loader.js';
import * as secureFs from '../../lib/secure-fs.js';
import path from 'path';
import { EventEmitter } from 'events';

describe('Pipeline Integration Tests', () => {
  let autoModeService: AutoModeService;
  let configService: PipelineConfigService;
  let featureLoader: FeatureLoader;
  let tempDir: string;
  let events: EventEmitter;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = path.join(process.cwd(), 'temp-pipeline-test');
    await secureFs.ensureDir(tempDir);

    // Initialize services
    events = new EventEmitter();
    autoModeService = new AutoModeService(events);
    configService = new PipelineConfigService(tempDir);
    featureLoader = new FeatureLoader();

    // Create .automaker directory
    await secureFs.ensureDir(path.join(tempDir, '.automaker'));
    await secureFs.ensureDir(path.join(tempDir, '.automaker', 'features'));
  });

  afterEach(async () => {
    // Clean up
    try {
      await secureFs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Complete Pipeline Execution', () => {
    it('should execute all pipeline steps for a feature', async () => {
      // Create pipeline configuration
      const pipelineConfig = {
        version: '1.0',
        enabled: true,
        onFailure: 'stop',
        steps: [
          {
            id: 'review',
            type: 'review',
            name: 'Code Review',
            model: 'same',
            required: true,
            autoTrigger: true,
            config: {
              focus: ['quality'],
              maxIssues: 5,
            },
          },
          {
            id: 'security',
            type: 'security',
            name: 'Security Review',
            model: 'same',
            required: true,
            autoTrigger: true,
            config: {
              checklist: ['Input validation'],
              minSeverity: 'medium',
            },
          },
        ],
      };

      await configService.savePipelineConfig(pipelineConfig);

      // Create a feature
      const feature = await featureLoader.create(tempDir, {
        title: 'Test Feature',
        description: 'A feature for testing',
        status: 'in_progress',
      });

      // Mock AI responses
      const mockExecuteModelPrompt = mock(() =>
        Promise.resolve({
          content: '[REVIEW_PASSED] Code looks good\n[SECURITY_PASSED] No security issues',
        })
      );
      autoModeService['executeModelPrompt'] = mockExecuteModelPrompt;

      // Execute pipeline steps
      await autoModeService.executePipelineSteps(tempDir, feature, new AbortController().signal);

      // Verify results
      const updatedFeature = await featureLoader.get(tempDir, feature.id);
      expect(updatedFeature?.pipelineSteps).toBeDefined();
      expect(updatedFeature?.pipelineSteps['review']).toBeDefined();
      expect(updatedFeature?.pipelineSteps['review'].status).toBe('passed');
      expect(updatedFeature?.pipelineSteps['security']).toBeDefined();
      expect(updatedFeature?.pipelineSteps['security'].status).toBe('passed');
    });

    it('should stop on required step failure', async () => {
      // Create pipeline with required and optional steps
      const pipelineConfig = {
        version: '1.0',
        enabled: true,
        onFailure: 'stop',
        steps: [
          {
            id: 'review',
            type: 'review',
            name: 'Code Review',
            model: 'same',
            required: true,
            autoTrigger: true,
            config: {},
          },
          {
            id: 'security',
            type: 'security',
            name: 'Security Review',
            model: 'same',
            required: false,
            autoTrigger: true,
            config: {},
          },
        ],
      };

      await configService.savePipelineConfig(pipelineConfig);

      // Create a feature
      const feature = await featureLoader.create(tempDir, {
        title: 'Test Feature',
        description: 'A feature for testing',
        status: 'in_progress',
      });

      // Mock AI response - first step fails
      const mockExecuteModelPrompt = mock(() =>
        Promise.resolve({
          content: '[REVIEW_FAILED] Critical issues found',
        })
      );
      autoModeService['executeModelPrompt'] = mockExecuteModelPrompt;

      // Execute pipeline steps - should throw error
      await expect(
        autoModeService.executePipelineSteps(tempDir, feature, new AbortController().signal)
      ).rejects.toThrow('Required pipeline step Code Review failed');

      // Verify security step was not executed
      const updatedFeature = await featureLoader.get(tempDir, feature.id);
      expect(updatedFeature?.pipelineSteps['review'].status).toBe('failed');
      expect(updatedFeature?.pipelineSteps['security']).toBeUndefined();
    });

    it('should continue on optional step failure', async () => {
      // Create pipeline with optional step first
      const pipelineConfig = {
        version: '1.0',
        enabled: true,
        onFailure: 'continue',
        steps: [
          {
            id: 'review',
            type: 'review',
            name: 'Code Review',
            model: 'same',
            required: false,
            autoTrigger: true,
            config: {},
          },
          {
            id: 'security',
            type: 'security',
            name: 'Security Review',
            model: 'same',
            required: true,
            autoTrigger: true,
            config: {},
          },
        ],
      };

      await configService.savePipelineConfig(pipelineConfig);

      // Create a feature
      const feature = await featureLoader.create(tempDir, {
        title: 'Test Feature',
        description: 'A feature for testing',
        status: 'in_progress',
      });

      // Mock AI responses - first fails, second passes
      const mockExecuteModelPrompt = mock((prompt, model, options) => {
        if (prompt.includes('code review')) {
          return Promise.resolve({ content: '[REVIEW_FAILED] Issues found' });
        }
        return Promise.resolve({ content: '[SECURITY_PASSED] No issues' });
      });
      autoModeService['executeModelPrompt'] = mockExecuteModelPrompt;

      // Execute pipeline steps
      await autoModeService.executePipelineSteps(tempDir, feature, new AbortController().signal);

      // Verify both steps were executed
      const updatedFeature = await featureLoader.get(tempDir, feature.id);
      expect(updatedFeature?.pipelineSteps['review'].status).toBe('failed');
      expect(updatedFeature?.pipelineSteps['security'].status).toBe('passed');
    });
  });

  describe('Pipeline Queue Management', () => {
    it('should add features to queue and process them', async () => {
      const pipelineConfig = {
        version: '1.0',
        enabled: true,
        steps: [
          {
            id: 'review',
            type: 'review',
            name: 'Code Review',
            model: 'same',
            required: true,
            autoTrigger: true,
            config: {},
          },
        ],
      };

      await configService.savePipelineConfig(pipelineConfig);

      // Create multiple features
      const features = await Promise.all([
        featureLoader.create(tempDir, { title: 'Feature 1', status: 'in_progress' }),
        featureLoader.create(tempDir, { title: 'Feature 2', status: 'in_progress' }),
        featureLoader.create(tempDir, { title: 'Feature 3', status: 'in_progress' }),
      ]);

      // Add to queue with different priorities
      await autoModeService.addToPipelineQueue(
        features[1].id,
        tempDir,
        pipelineConfig.steps,
        'medium'
      );
      await autoModeService.addToPipelineQueue(
        features[0].id,
        tempDir,
        pipelineConfig.steps,
        'high'
      );
      await autoModeService.addToPipelineQueue(
        features[2].id,
        tempDir,
        pipelineConfig.steps,
        'low'
      );

      // Mock AI responses
      autoModeService['executeModelPrompt'] = mock(() =>
        Promise.resolve({ content: '[REVIEW_PASSED] Good code' })
      );

      // Process queue
      await autoModeService['processPipelineQueue']();

      // Verify all features were processed in priority order
      const metrics = autoModeService.getPipelineMetrics();
      expect(metrics.totalExecuted).toBe(3);
      expect(metrics.totalPassed).toBe(3);
    });
  });

  describe('Feature File Persistence', () => {
    it('should persist pipeline steps in feature files', async () => {
      const pipelineConfig = {
        version: '1.0',
        enabled: true,
        steps: [
          {
            id: 'review',
            type: 'review',
            name: 'Code Review',
            model: 'same',
            required: true,
            autoTrigger: true,
            config: {},
          },
        ],
      };

      await configService.savePipelineConfig(pipelineConfig);

      // Create and execute feature
      const feature = await featureLoader.create(tempDir, {
        title: 'Test Feature',
        status: 'in_progress',
      });

      autoModeService['executeModelPrompt'] = mock(() =>
        Promise.resolve({ content: '[REVIEW_PASSED] All good' })
      );

      await autoModeService.executePipelineSteps(tempDir, feature, new AbortController().signal);

      // Load feature directly from file
      const featurePath = path.join(tempDir, '.automaker', 'features', feature.id, 'feature.json');
      const fileContent = await secureFs.readFile(featurePath, 'utf-8');
      const savedFeature = JSON.parse(fileContent);

      expect(savedFeature.pipelineSteps).toBeDefined();
      expect(savedFeature.pipelineSteps.review.status).toBe('passed');
      expect(savedFeature.pipelineSteps.review.result).toBeDefined();
    });

    it('should maintain backward compatibility', async () => {
      // Create feature without pipeline steps
      const feature = await featureLoader.create(tempDir, {
        title: 'Legacy Feature',
        status: 'completed',
      });

      // Load feature - should not throw error
      const loadedFeature = await featureLoader.get(tempDir, feature.id);
      expect(loadedFeature).toBeDefined();
      expect(loadedFeature?.pipelineSteps).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle AI model errors gracefully', async () => {
      const pipelineConfig = {
        version: '1.0',
        enabled: true,
        steps: [
          {
            id: 'review',
            type: 'review',
            name: 'Code Review',
            model: 'same',
            required: true,
            autoTrigger: true,
            config: {},
          },
        ],
      };

      await configService.savePipelineConfig(pipelineConfig);
      const feature = await featureLoader.create(tempDir, {
        title: 'Test Feature',
        status: 'in_progress',
      });

      // Mock AI error
      autoModeService['executeModelPrompt'] = mock(() =>
        Promise.reject(new Error('AI model unavailable'))
      );

      // Execute should handle error
      await expect(
        autoModeService.executePipelineSteps(tempDir, feature, new AbortController().signal)
      ).rejects.toThrow();

      // Verify step is marked as failed
      const updatedFeature = await featureLoader.get(tempDir, feature.id);
      expect(updatedFeature?.pipelineSteps['review'].status).toBe('failed');
      expect(updatedFeature?.pipelineSteps['review'].error).toContain('AI model unavailable');
    });

    it('should handle abort signal during execution', async () => {
      const pipelineConfig = {
        version: '1.0',
        enabled: true,
        steps: [
          {
            id: 'review',
            type: 'review',
            name: 'Code Review',
            model: 'same',
            required: true,
            autoTrigger: true,
            config: {},
          },
          {
            id: 'security',
            type: 'security',
            name: 'Security Review',
            model: 'same',
            required: true,
            autoTrigger: true,
            config: {},
          },
        ],
      };

      await configService.savePipelineConfig(pipelineConfig);
      const feature = await featureLoader.create(tempDir, {
        title: 'Test Feature',
        status: 'in_progress',
      });

      // Create abort controller and abort after delay
      const abortController = new AbortController();
      setTimeout(() => abortController.abort(), 100);

      // Mock slow AI response
      autoModeService['executeModelPrompt'] = mock(
        () =>
          new Promise((resolve) => setTimeout(() => resolve({ content: '[REVIEW_PASSED]' }), 200))
      );

      // Execute should be aborted
      await expect(
        autoModeService.executePipelineSteps(tempDir, feature, abortController.signal)
      ).rejects.toThrow('aborted');
    });
  });
});
