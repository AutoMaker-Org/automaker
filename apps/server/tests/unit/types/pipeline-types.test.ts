import { describe, it, expect } from 'vitest';
import { isPipelineStatus } from '@automaker/types';

describe('isPipelineStatus', () => {
  it('should return true for valid pipeline statuses', () => {
    expect(isPipelineStatus('pipeline_step1')).toBe(true);
    expect(isPipelineStatus('pipeline_testing')).toBe(true);
    expect(isPipelineStatus('pipeline_code_review')).toBe(true);
    expect(isPipelineStatus('pipeline_complete')).toBe(true);
  });

  it('should return true for pipeline_ prefix with any non-empty suffix', () => {
    expect(isPipelineStatus('pipeline_')).toBe(false); // Empty suffix is invalid
    expect(isPipelineStatus('pipeline_123')).toBe(true);
    expect(isPipelineStatus('pipeline_step_abc_123')).toBe(true);
  });

  it('should return false for non-pipeline statuses', () => {
    expect(isPipelineStatus('in_progress')).toBe(false);
    expect(isPipelineStatus('backlog')).toBe(false);
    expect(isPipelineStatus('ready')).toBe(false);
    expect(isPipelineStatus('interrupted')).toBe(false);
    expect(isPipelineStatus('waiting_approval')).toBe(false);
    expect(isPipelineStatus('verified')).toBe(false);
    expect(isPipelineStatus('completed')).toBe(false);
  });

  it('should return false for null and undefined', () => {
    expect(isPipelineStatus(null)).toBe(false);
    expect(isPipelineStatus(undefined)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isPipelineStatus('')).toBe(false);
  });

  it('should return false for partial matches', () => {
    expect(isPipelineStatus('pipeline')).toBe(false);
    expect(isPipelineStatus('pipelin_step1')).toBe(false);
    expect(isPipelineStatus('Pipeline_step1')).toBe(false);
    expect(isPipelineStatus('PIPELINE_step1')).toBe(false);
  });

  it('should return false for pipeline prefix embedded in longer string', () => {
    expect(isPipelineStatus('not_pipeline_step1')).toBe(false);
    expect(isPipelineStatus('my_pipeline_step')).toBe(false);
  });
});
