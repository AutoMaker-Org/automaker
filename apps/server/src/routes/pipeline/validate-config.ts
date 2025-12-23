/**
 * Pipeline Configuration Validation Routes
 */

import { Router } from 'express';
import { PIPELINE_CONFIG_SCHEMA } from '@automaker/types';

const router = Router();

/**
 * POST /api/pipeline/validate-config
 * Validate a pipeline configuration
 */
router.post('/', async (req, res) => {
  try {
    const { config } = req.body;

    if (!config) {
      return res.status(400).json({
        success: false,
        error: 'config is required',
      });
    }

    // Basic structure validation
    if (typeof config !== 'object' || config === null) {
      return res.status(400).json({
        success: false,
        error: 'config must be an object',
      });
    }

    // Validate against schema
    const errors: string[] = [];

    // Check version
    if (!config.version || typeof config.version !== 'string') {
      errors.push('version is required and must be a string');
    }

    // Check enabled flag
    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled is required and must be a boolean');
    }

    // Check onFailure
    if (config.onFailure && !['stop', 'continue'].includes(config.onFailure)) {
      errors.push('onFailure must be either "stop" or "continue"');
    }

    // Check steps
    if (!Array.isArray(config.steps)) {
      errors.push('steps must be an array');
    } else {
      // Validate each step
      const stepIds = new Set<string>();

      for (const [index, step] of config.steps.entries()) {
        if (typeof step !== 'object' || step === null) {
          errors.push(`step ${index} must be an object`);
          continue;
        }

        // Check required fields
        if (!step.id || typeof step.id !== 'string') {
          errors.push(`step ${index}: id is required and must be a string`);
        } else {
          // Check for duplicate IDs
          if (stepIds.has(step.id)) {
            errors.push(`step ${index}: duplicate step id "${step.id}"`);
          } else {
            stepIds.add(step.id);
          }
        }

        if (
          !step.type ||
          !['review', 'security', 'performance', 'test', 'custom'].includes(step.type)
        ) {
          errors.push(
            `step ${index}: type must be one of: review, security, performance, test, custom`
          );
        }

        if (!step.name || typeof step.name !== 'string') {
          errors.push(`step ${index}: name is required and must be a string`);
        }

        if (!step.model || typeof step.model !== 'string') {
          errors.push(`step ${index}: model is required and must be a string`);
        }

        if (typeof step.required !== 'boolean') {
          errors.push(`step ${index}: required is required and must be a boolean`);
        }

        if (typeof step.autoTrigger !== 'boolean') {
          errors.push(`step ${index}: autoTrigger is required and must be a boolean`);
        }

        // Check type-specific config
        if (!step.config || typeof step.config !== 'object') {
          errors.push(`step ${index}: config is required and must be an object`);
        } else {
          // Validate based on type
          if (step.type === 'review') {
            const reviewConfig = step.config as any;
            if (reviewConfig.focus && !Array.isArray(reviewConfig.focus)) {
              errors.push(`step ${index}: review focus must be an array`);
            }
            if (
              reviewConfig.maxIssues !== undefined &&
              (typeof reviewConfig.maxIssues !== 'number' || reviewConfig.maxIssues < 1)
            ) {
              errors.push(`step ${index}: review maxIssues must be a positive number`);
            }
          } else if (step.type === 'security') {
            const securityConfig = step.config as any;
            if (securityConfig.checklist && !Array.isArray(securityConfig.checklist)) {
              errors.push(`step ${index}: security checklist must be an array`);
            }
          } else if (step.type === 'performance') {
            const performanceConfig = step.config as any;
            if (performanceConfig.metrics && !Array.isArray(performanceConfig.metrics)) {
              errors.push(`step ${index}: performance metrics must be an array`);
            }
          } else if (step.type === 'test') {
            const testConfig = step.config as any;
            if (
              testConfig.coverageThreshold !== undefined &&
              (typeof testConfig.coverageThreshold !== 'number' ||
                testConfig.coverageThreshold < 0 ||
                testConfig.coverageThreshold > 100)
            ) {
              errors.push(
                `step ${index}: test coverageThreshold must be a number between 0 and 100`
              );
            }
          } else if (step.type === 'custom') {
            const customConfig = step.config as any;
            if (!customConfig.prompt || typeof customConfig.prompt !== 'string') {
              errors.push(`step ${index}: custom prompt is required and must be a string`);
            }
          }
        }

        // Check dependencies
        if (step.dependencies) {
          if (!Array.isArray(step.dependencies)) {
            errors.push(`step ${index}: dependencies must be an array`);
          } else {
            // Check for circular dependencies
            const checkCircular = (
              stepId: string,
              deps: string[],
              visited: Set<string>,
              path: string[]
            ): boolean => {
              if (visited.has(stepId)) {
                errors.push(
                  `step ${index}: circular dependency detected: ${path.join(' -> ')} -> ${stepId}`
                );
                return true;
              }
              visited.add(stepId);

              for (const dep of deps) {
                const depStep = config.steps.find((s: any) => s.id === dep);
                if (depStep && depStep.dependencies) {
                  if (
                    checkCircular(dep, depStep.dependencies, new Set(visited), [...path, stepId])
                  ) {
                    return true;
                  }
                }
              }
              return false;
            };

            checkCircular(step.id, step.dependencies, new Set(), []);
          }
        }
      }
    }

    res.json({
      success: true,
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[Pipeline Validate Config] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate configuration',
    });
  }
});

export default router;
