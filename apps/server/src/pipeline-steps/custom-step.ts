/**
 * Custom Pipeline Step Implementation
 * Executes user-defined prompts with support for memory, looping, and CodeRabbit integration
 */

import type { PipelineStepConfig, PipelineStepResult, Feature } from '@automaker/types';
import { PipelineMemory, type IterationMemory } from '../services/pipeline-memory.js';
import { CodeRabbitIntegration } from '../integrations/coderabbit.js';
import type { AutoModeService } from '../services/auto-mode-service.js';

export interface CustomStepConfig {
  prompt: string;
  successCriteria: string;
  loopConfig?: {
    maxLoops: number;
    loopUntilSuccess: boolean;
  };
  memoryConfig?: {
    enabled: boolean;
    persistAcrossFeatures: boolean;
    maxEntries?: number;
  };
  codeRabbitConfig?: {
    enabled: boolean;
    useStandardRules?: boolean;
    customRules?: string[];
    severity?: 'info' | 'warning' | 'error';
    maxIssues?: number;
    fallbackToAI?: boolean;
    apiKey?: string;
  };
  variables?: Record<string, string>;
}

export class CustomStep {
  private autoModeService: AutoModeService;
  private memory: PipelineMemory;
  private codeRabbit: CodeRabbitIntegration | null = null;

  constructor(autoModeService: AutoModeService, projectPath?: string, codeRabbitApiKey?: string) {
    this.autoModeService = autoModeService;
    this.memory = new PipelineMemory(projectPath);
    if (codeRabbitApiKey) {
      this.codeRabbit = new CodeRabbitIntegration(codeRabbitApiKey);
    }
  }

  async execute(
    feature: Feature,
    stepConfig: PipelineStepConfig & { config: CustomStepConfig },
    signal: AbortSignal,
    projectPath?: string
  ): Promise<PipelineStepResult> {
    const { config } = stepConfig;
    let loopCount = 0;
    let finalResult: PipelineStepResult | null = null;

    // Load previous memory if enabled
    let memoryContext: IterationMemory | null = null;
    if (config.memoryConfig?.enabled) {
      memoryContext = await this.memory.getMemoryForNextIteration(stepConfig.id, feature.id);
    }

    try {
      // Execute with looping support
      do {
        loopCount++;
        console.log(
          `[Custom Step] Execution attempt ${loopCount}/${config.loopConfig?.maxLoops || 1}`
        );

        // Build prompt with variable substitution and memory
        const prompt = this.buildPrompt(feature, config, memoryContext, loopCount);

        // Check for CodeRabbit integration first
        if (config.codeRabbitConfig?.enabled) {
          try {
            const codeRabbitResult = await this.executeCodeRabbit(feature, stepConfig, signal);

            // If CodeRabbit succeeds and no fallback needed, use its result
            if (codeRabbitResult.status === 'passed' || !config.codeRabbitConfig.fallbackToAI) {
              finalResult = codeRabbitResult;

              // Save to memory if enabled
              if (config.memoryConfig?.enabled && codeRabbitResult.issues) {
                await this.memory.storeFeedback(stepConfig.id, feature.id, {
                  issues: codeRabbitResult.issues,
                  summary: codeRabbitResult.output,
                });
              }

              break;
            }
          } catch (error) {
            console.log('[Custom Step] CodeRabbit failed, falling back to AI:', error);
            if (!config.codeRabbitConfig.fallbackToAI) {
              throw error;
            }
          }
        }

        // Execute with AI
        const result = await this.autoModeService.executeAIStep({
          feature,
          stepConfig,
          signal,
          prompt,
          projectPath,
          onProgress: (message) => {
            console.log(`[Custom Step] ${message}`);
          },
        });

        // Check success criteria
        const successMet = await this.checkSuccessCriteria(result.output, config.successCriteria);

        if (successMet) {
          finalResult = {
            ...result,
            status: 'passed',
            iterations: loopCount,
          };

          // Save summary to memory if enabled
          if (config.memoryConfig?.enabled) {
            await this.memory.storeFeedback(stepConfig.id, feature.id, {
              issues: [],
              summary: result.output,
            });
          }

          break;
        }

        // Save failed attempt to memory
        if (config.memoryConfig?.enabled) {
          await this.memory.storeFeedback(stepConfig.id, feature.id, {
            issues: [],
            summary: result.output,
          });
        }

        // Check if we should continue looping
        if (config.loopConfig?.loopUntilSuccess && loopCount < (config.loopConfig.maxLoops || 1)) {
          console.log(`[Custom Step] Success criteria not met, retrying...`);
          continue;
        }

        // No more retries, return the last result
        finalResult = {
          ...result,
          status: result.status === 'failed' ? 'failed' : 'passed',
          iterations: loopCount,
        };

        break;
      } while (signal.aborted === false);

      if (!finalResult) {
        throw new Error('No result generated');
      }

      return finalResult;
    } catch (error) {
      return {
        status: 'failed',
        output: error instanceof Error ? error.message : 'Custom step failed',
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
        iterations: loopCount,
      };
    }
  }

  private buildPrompt(
    feature: Feature,
    config: CustomStepConfig,
    memoryContext: IterationMemory | null,
    loopCount: number
  ): string {
    let prompt = config.prompt;

    // Substitute variables
    if (config.variables) {
      for (const [key, value] of Object.entries(config.variables)) {
        prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
    }

    // Add feature context
    prompt = prompt.replace(/\{\{feature\}\}/g, JSON.stringify(feature, null, 2));
    prompt = prompt.replace(/\{\{featureTitle\}\}/g, feature.title || '');
    prompt = prompt.replace(/\{\{featureDescription\}\}/g, feature.description || '');
    prompt = prompt.replace(/\{\{featureStatus\}\}/g, feature.status || '');

    // Add memory context
    if (memoryContext) {
      const previousFeedback = memoryContext.previousIssues
        .map((issue) => `${issue.summary}${issue.location ? ` (${issue.location})` : ''}`)
        .join('\n');
      prompt = prompt.replace(/\{\{previousFeedback\}\}/g, previousFeedback);
      prompt = prompt.replace(/\{\{loopCount\}\}/g, loopCount.toString());
      prompt = prompt.replace(/\{\{previousAttempts\}\}/g, memoryContext.iterationCount.toString());
    }

    // Add success criteria
    prompt += `

Success Criteria:
${config.successCriteria}

Please provide your response and indicate if the success criteria have been met.
`;

    // Add looping context
    if (config.loopConfig?.loopUntilSuccess && loopCount > 1) {
      prompt += `
This is attempt ${loopCount} of ${config.loopConfig.maxLoops}.
Previous attempts did not fully meet the success criteria.
Please address any remaining issues.
`;
    }

    return prompt;
  }

  private async checkSuccessCriteria(output: string, criteria: string): Promise<boolean> {
    // Simple keyword-based check - in a real implementation, this could use AI
    const lowerOutput = output.toLowerCase();
    const lowerCriteria = criteria.toLowerCase();

    // Check for explicit success indicators
    if (
      lowerOutput.includes('success criteria met') ||
      lowerOutput.includes('all requirements satisfied') ||
      lowerOutput.includes('criteria fulfilled')
    ) {
      return true;
    }

    // Check for explicit failure indicators
    if (
      lowerOutput.includes('criteria not met') ||
      lowerOutput.includes('requirements not satisfied') ||
      lowerOutput.includes('criteria failed')
    ) {
      return false;
    }

    // For more complex criteria, we could use an AI to evaluate
    // For now, default to success if no explicit indicators
    return true;
  }

  private async executeCodeRabbit(
    feature: Feature,
    stepConfig: PipelineStepConfig,
    _signal: AbortSignal
  ): Promise<PipelineStepResult> {
    if (!this.codeRabbit) {
      throw new Error('CodeRabbit integration not configured - missing API key');
    }

    try {
      // Use the submitReview method that exists on CodeRabbitIntegration
      return await this.codeRabbit.submitReview(feature, stepConfig);
    } catch (error) {
      throw new Error(`CodeRabbit integration failed: ${error}`);
    }
  }
}
