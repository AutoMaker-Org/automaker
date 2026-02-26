import { describe, it, expect, vi } from 'vitest';
import { PipelineOrchestrator } from '../../../src/services/pipeline-orchestrator.js';
import type { Feature } from '@automaker/types';

describe('PipelineOrchestrator Prompts', () => {
  const mockFeature: Feature = {
    id: 'feature-123',
    title: 'Test Feature',
    description: 'A test feature',
    status: 'in_progress',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tasks: [],
  };

  const mockBuildFeaturePrompt = (feature: Feature) => `Feature: ${feature.title}`;

  it('should include mandatory summary requirement in pipeline step prompt', () => {
    const orchestrator = new PipelineOrchestrator(
      null as any, // eventBus
      null as any, // featureStateManager
      null as any, // agentExecutor
      null as any, // testRunnerService
      null as any, // worktreeResolver
      null as any, // concurrencyManager
      null as any, // settingsService
      null as any, // updateFeatureStatusFn
      null as any, // loadContextFilesFn
      mockBuildFeaturePrompt,
      null as any, // executeFeatureFn
      null as any // runAgentFn
    );

    const step = {
      id: 'step1',
      name: 'Code Review',
      instructions: 'Review the code for quality.',
    };

    const prompt = orchestrator.buildPipelineStepPrompt(
      step as any,
      mockFeature,
      'Previous work context',
      { implementationInstructions: '', playwrightVerificationInstructions: '' }
    );

    expect(prompt).toContain('## Pipeline Step: Code Review');
    expect(prompt).toContain('Review the code for quality.');
    expect(prompt).toContain(
      '**CRITICAL: After completing the instructions, you MUST output a summary using this EXACT format:**'
    );
    expect(prompt).toContain('<summary>');
    expect(prompt).toContain('## Summary: Code Review');
    expect(prompt).toContain('</summary>');
    expect(prompt).toContain('The <summary> and </summary> tags MUST be on their own lines.');
  });
});
