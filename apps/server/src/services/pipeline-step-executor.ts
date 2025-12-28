/**
 * Pipeline Step Executor
 *
 * Executes individual pipeline steps with support for:
 * - Model selection
 * - Looping until success
 * - Memory system
 * - Progress reporting
 */

import type {
  PipelineStepConfig,
  PipelineStepResult,
  StepStatus,
  AgentModel,
  Feature,
} from '@automaker/types';
import type { AutoModeService } from './auto-mode-service.js';
import { PipelinePromptBuilder } from './pipeline-prompt-builder.js';
import { PipelineMemory } from './pipeline-memory.js';
import { EventEmitter } from 'events';
import {
  ReviewStep,
  SecurityStep,
  PerformanceStep,
  TestStep,
  CustomStep,
} from '../pipeline-steps/index.js';

export interface StepExecutionContext {
  feature: Feature;
  stepConfig: PipelineStepConfig;
  signal: AbortSignal;
  onProgress: (message: string) => void;
  onStatusChange: (status: StepStatus) => void;
  projectPath?: string;
}

export class PipelineStepExecutor extends EventEmitter {
  private promptBuilder: PipelinePromptBuilder;
  private memory: PipelineMemory;
  private autoModeService: AutoModeService;
  private reviewStep: ReviewStep;
  private securityStep: SecurityStep;
  private performanceStep: PerformanceStep;
  private testStep: TestStep;
  private customStep: CustomStep;
  private projectPath: string;

  constructor(autoModeService: AutoModeService, projectPath?: string) {
    super();
    this.promptBuilder = new PipelinePromptBuilder();
    this.projectPath = projectPath || '';
    this.memory = new PipelineMemory(this.projectPath);
    this.autoModeService = autoModeService;
    this.reviewStep = new ReviewStep(autoModeService);
    this.securityStep = new SecurityStep(autoModeService);
    this.performanceStep = new PerformanceStep(autoModeService);
    this.testStep = new TestStep(autoModeService);
    this.customStep = new CustomStep(autoModeService, this.projectPath);
  }

  /**
   * Execute a pipeline step
   *
   * Executes the specified pipeline step with the given context.
   * Handles different step types and manages status updates and progress reporting.
   *
   * @param context - The execution context containing feature, step config, and callbacks
   * @returns Promise<PipelineStepResult> The result of step execution
   */
  async executeStep(context: StepExecutionContext): Promise<PipelineStepResult> {
    const { feature, stepConfig, signal, onProgress, onStatusChange, projectPath } = context;

    onStatusChange('in_progress');
    onProgress(`Starting ${stepConfig.name}...`);

    try {
      // Execute the appropriate step implementation
      let result: PipelineStepResult;

      switch (stepConfig.type) {
        case 'review':
          result = await this.reviewStep.execute(feature, stepConfig as any, signal, projectPath);
          break;
        case 'security':
          result = await this.securityStep.execute(feature, stepConfig as any, signal, projectPath);
          break;
        case 'performance':
          result = await this.performanceStep.execute(
            feature,
            stepConfig as any,
            signal,
            projectPath
          );
          break;
        case 'test':
          result = await this.testStep.execute(feature, stepConfig as any, signal, projectPath);
          break;
        case 'custom':
          result = await this.customStep.execute(feature, stepConfig as any, signal, projectPath);
          break;
        default:
          throw new Error(`Unknown step type: ${stepConfig.type}`);
      }

      // Report progress and status
      if (result.status === 'passed') {
        onStatusChange('passed');
        onProgress(`${stepConfig.name} completed successfully`);
      } else if (result.status === 'failed') {
        onStatusChange('failed');
        onProgress(`${stepConfig.name} failed`);
      } else {
        onStatusChange(result.status);
        onProgress(`${stepConfig.name} ${result.status}`);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onStatusChange('failed');
      onProgress(`${stepConfig.name} failed: ${errorMessage}`);

      return {
        status: 'failed',
        output: errorMessage,
        metadata: { error: errorMessage },
      };
    }
  }

  /**
   * Execute a single step iteration
   *
   * Executes one iteration of a pipeline step with the given prompt and model.
   * Handles CodeRabbit integration for custom steps when enabled.
   *
   * @param feature - The feature being processed
   * @param stepConfig - The step configuration
   * @param prompt - The prompt to execute
   * @param model - The AI model to use
   * @param signal - AbortSignal for cancellation
   * @returns Promise<PipelineStepResult> The result of the execution
   */
  private async executeSingleStep(
    feature: Feature,
    stepConfig: PipelineStepConfig,
    prompt: string,
    model: AgentModel,
    signal: AbortSignal
  ): Promise<PipelineStepResult> {
    // Check for CodeRabbit integration (for custom steps with coderabbitEnabled in config)
    const customConfig = stepConfig.config as { coderabbitEnabled?: boolean };
    if (stepConfig.type === 'custom' && customConfig.coderabbitEnabled) {
      return this.executeCodeRabbitStep(feature, stepConfig, signal);
    }

    // Execute with AI model using executeAIStep
    const response = await this.autoModeService.executeAIStep({
      feature,
      stepConfig,
      signal,
      prompt,
      projectPath: this.projectPath,
    });

    return {
      status: response.status === 'passed' ? 'passed' : 'failed',
      output: response.output,
    };
  }

  /**
   * Execute step with CodeRabbit integration
   *
   * Executes a custom step using CodeRabbit for code review analysis.
   * Requires CODERABBIT_API_KEY environment variable to be set.
   *
   * @param feature - The feature being processed
   * @param stepConfig - The step configuration
   * @param signal - AbortSignal for cancellation
   * @returns Promise<PipelineStepResult> The result from CodeRabbit
   * @throws Error if API key is not configured
   */
  private async executeCodeRabbitStep(
    feature: Feature,
    stepConfig: PipelineStepConfig,
    signal: AbortSignal
  ): Promise<PipelineStepResult> {
    // Import CodeRabbit integration dynamically
    const { CodeRabbitIntegration } = await import('../integrations/coderabbit.js');

    // Get API key from environment
    const apiKey = process.env.CODERABBIT_API_KEY;

    if (!apiKey) {
      throw new Error(
        'CodeRabbit API key not configured. Please set the CODERABBIT_API_KEY environment variable.'
      );
    }

    // Determine project path - prefer class projectPath
    const projectPath = this.projectPath;

    if (!projectPath) {
      throw new Error('Project path is required for CodeRabbit integration but is not available.');
    }

    const codeRabbit = new CodeRabbitIntegration(apiKey, projectPath);
    return codeRabbit.submitReview(feature, stepConfig);
  }

  /**
   * Parse step result from model response
   *
   * Parses the AI model output to extract the step status and structured results.
   * Looks for status markers like [REVIEW_PASSED] or [SECURITY_FAILED].
   *
   * @param output - The raw output from the AI model
   * @returns PipelineStepResult The parsed result with status and structured data
   */
  private parseStepResult(output: string): PipelineStepResult {
    // Ensure output is defined
    const safeOutput = output || '';

    // Debug logging
    console.log('[Pipeline Step Executor] Raw output:', JSON.stringify(output));
    console.log('[Pipeline Step Executor] Safe output length:', safeOutput.length);

    // Check for status markers
    const passedMatch = safeOutput.match(/^\[(REVIEW|SECURITY|PERFORMANCE|TEST)_PASSED\]/m);
    const failedMatch = safeOutput.match(/^\[(REVIEW|SECURITY|PERFORMANCE|TEST)_FAILED\]/m);

    let status: 'passed' | 'failed' = 'passed';
    if (failedMatch) {
      status = 'failed';
    } else if (!passedMatch) {
      // No explicit status marker, try to infer
      status = safeOutput.toLowerCase().includes('no issues found') ? 'passed' : 'failed';
    }

    // Extract issues if failed
    const issues = this.extractIssues(safeOutput);

    return {
      status,
      output: safeOutput,
      issues,
      metadata: {
        timestamp: new Date().toISOString(),
        issuesCount: issues.length,
      },
    };
  }

  /**
   * Extract issues from step output
   *
   * Parses the step output to extract structured issue information.
   * Looks for numbered issues with optional location and severity information.
   *
   * @param output - The step output containing issues
   * @returns Array of extracted issues with hash, summary, location, and severity
   */
  private extractIssues(output: string): Array<{
    hash: string;
    summary: string;
    location?: string;
    severity: 'low' | 'medium' | 'high';
  }> {
    const issues: Array<any> = [];

    // Look for numbered issues
    const issueRegex = /^\d+\.\s+(.+?)(?:\s*\(([^)]+)\))?\s*$/gm;
    let match;

    while ((match = issueRegex.exec(output)) !== null) {
      const summary = match[1].trim();
      const location = match[2]?.trim();

      // Extract severity if present
      const severityMatch = summary.match(/Severity:\s*(low|medium|high)/i);
      const severity = (severityMatch?.[1]?.toLowerCase() as any) || 'medium';

      // Generate hash
      const hash = this.generateIssueHash({
        summary: summary.split('\n')[0], // First line only
        location,
        type: 'issue',
      });

      issues.push({
        hash,
        summary: summary.split('\n')[0], // First line only
        location,
        severity,
      });
    }

    return issues;
  }

  /**
   * Generate issue hash for deduplication
   *
   * Generates a consistent hash for an issue based on its summary,
   * location, and type. Used to identify duplicate issues across iterations.
   *
   * @param issue - The issue object containing summary, location, and type
   * @returns string The hexadecimal hash of the issue
   */
  private generateIssueHash(issue: { summary: string; location?: string; type: string }): string {
    const normalized = [
      (issue.summary || '').toLowerCase().trim(),
      (issue.location || '').toLowerCase(),
      (issue.type || '').toLowerCase(),
    ].join('|');

    // Simple hash for now - could use crypto in Node environment
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get model to use for a step
   *
   * Determines which AI model to use based on the step configuration.
   * Supports 'same' (use feature's model), 'different' (use alternate model),
   * or explicit model selection.
   *
   * @param feature - The feature being processed
   * @param stepConfig - The step configuration with model preference
   * @returns Promise<AgentModel> The selected AI model
   */
  private async getModelForStep(
    feature: Feature,
    stepConfig: PipelineStepConfig
  ): Promise<AgentModel> {
    if (stepConfig.model === 'same') {
      return (feature.model as AgentModel) || 'opus';
    }

    if (stepConfig.model === 'different') {
      // Use a different model than the feature's model
      const featureModel = (feature.model as AgentModel) || 'opus';
      switch (featureModel) {
        case 'opus':
          return 'sonnet';
        case 'sonnet':
          return 'opus';
        case 'haiku':
          return 'sonnet';
        default:
          return 'opus';
      }
    }

    return stepConfig.model as AgentModel;
  }

  /**
   * Skip a step
   */
  async skipStep(stepId: string, featureId: string): Promise<void> {
    await this.memory.clear(stepId, featureId);
    this.emit('stepSkipped', { stepId, featureId });
  }

  /**
   * Clear step results
   */
  async clearStepResults(stepId: string, featureId: string): Promise<void> {
    await this.memory.clear(stepId, featureId);
    this.emit('stepResultsCleared', { stepId, featureId });
  }
}
