/**
 * Tests for event-content-formatter utility
 * Verifies correct formatting of AutoModeEvent and BacklogPlanEvent content
 * for display in the AgentOutputModal.
 */

import { describe, it, expect } from 'vitest';
import {
  formatAutoModeEventContent,
  formatBacklogPlanEventContent,
} from '../../../src/components/views/board-view/dialogs/event-content-formatter';
import type { AutoModeEvent } from '@/types/electron';
import type { BacklogPlanEvent } from '@automaker/types';

describe('formatAutoModeEventContent', () => {
  describe('auto_mode_progress', () => {
    it('should return content string', () => {
      const event = { type: 'auto_mode_progress', content: 'Processing step 1' } as AutoModeEvent;
      expect(formatAutoModeEventContent(event)).toBe('Processing step 1');
    });

    it('should return empty string when content is undefined', () => {
      const event = { type: 'auto_mode_progress' } as AutoModeEvent;
      expect(formatAutoModeEventContent(event)).toBe('');
    });
  });

  describe('auto_mode_tool', () => {
    it('should format tool name and input', () => {
      const event = {
        type: 'auto_mode_tool',
        tool: 'Read',
        input: { file: 'test.ts' },
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('🔧 Tool: Read');
      expect(result).toContain('"file": "test.ts"');
    });

    it('should handle missing tool name', () => {
      const event = { type: 'auto_mode_tool' } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('Unknown Tool');
    });

    it('should handle missing input', () => {
      const event = { type: 'auto_mode_tool', tool: 'Write' } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('🔧 Tool: Write');
      expect(result).not.toContain('Input:');
    });
  });

  describe('auto_mode_phase', () => {
    it('should use planning emoji for planning phase', () => {
      const event = {
        type: 'auto_mode_phase',
        phase: 'planning',
        message: 'Starting plan',
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('📋');
      expect(result).toContain('Starting plan');
    });

    it('should use action emoji for action phase', () => {
      const event = {
        type: 'auto_mode_phase',
        phase: 'action',
        message: 'Executing',
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('⚡');
    });

    it('should use checkmark emoji for other phases', () => {
      const event = {
        type: 'auto_mode_phase',
        phase: 'complete',
        message: 'Done',
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('✅');
    });
  });

  describe('auto_mode_error', () => {
    it('should format error message', () => {
      const event = {
        type: 'auto_mode_error',
        error: 'Something went wrong',
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('❌ Error: Something went wrong');
    });
  });

  describe('planning events', () => {
    it('should format planning_started with mode label', () => {
      const event = {
        type: 'planning_started',
        mode: 'lite',
        message: 'Starting lite planning',
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('Planning Mode: Lite');
      expect(result).toContain('Starting lite planning');
    });

    it('should format spec planning mode', () => {
      const event = {
        type: 'planning_started',
        mode: 'spec',
        message: 'Starting spec planning',
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('Planning Mode: Spec');
    });

    it('should format full planning mode', () => {
      const event = {
        type: 'planning_started',
        mode: 'full',
        message: 'Starting full planning',
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('Planning Mode: Full');
    });

    it('should format plan_approval_required', () => {
      const event = { type: 'plan_approval_required' } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('waiting for your approval');
    });

    it('should format plan_approved without edits', () => {
      const event = { type: 'plan_approved', hasEdits: false } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('Plan approved');
      expect(result).not.toContain('with edits');
    });

    it('should format plan_approved with edits', () => {
      const event = { type: 'plan_approved', hasEdits: true } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('Plan approved (with edits)');
    });

    it('should format plan_auto_approved', () => {
      const event = { type: 'plan_auto_approved' } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('Plan auto-approved');
    });

    it('should format plan_revision_requested', () => {
      const event = {
        type: 'plan_revision_requested',
        planVersion: 3,
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('Revising plan');
      expect(result).toContain('v3');
    });
  });

  describe('task events', () => {
    it('should format auto_mode_task_started', () => {
      const event = {
        type: 'auto_mode_task_started',
        taskId: 'task-1',
        taskDescription: 'Write tests',
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('Starting task-1: Write tests');
    });

    it('should format auto_mode_task_complete', () => {
      const event = {
        type: 'auto_mode_task_complete',
        taskId: 'task-1',
        tasksCompleted: 3,
        tasksTotal: 5,
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('task-1 completed (3/5)');
    });

    it('should format auto_mode_phase_complete', () => {
      const event = {
        type: 'auto_mode_phase_complete',
        phaseNumber: 2,
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('Phase 2 complete');
    });
  });

  describe('auto_mode_feature_complete', () => {
    it('should show success emoji when passes is true', () => {
      const event = {
        type: 'auto_mode_feature_complete',
        passes: true,
        message: 'All tests pass',
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('✅');
      expect(result).toContain('All tests pass');
    });

    it('should show warning emoji when passes is false', () => {
      const event = {
        type: 'auto_mode_feature_complete',
        passes: false,
        message: 'Some tests failed',
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('⚠️');
    });
  });

  describe('auto_mode_ultrathink_preparation', () => {
    it('should format with warnings', () => {
      const event = {
        type: 'auto_mode_ultrathink_preparation',
        warnings: ['High cost', 'Long runtime'],
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('Ultrathink Preparation');
      expect(result).toContain('Warnings:');
      expect(result).toContain('High cost');
      expect(result).toContain('Long runtime');
    });

    it('should format with recommendations', () => {
      const event = {
        type: 'auto_mode_ultrathink_preparation',
        recommendations: ['Use caching', 'Reduce scope'],
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('Recommendations:');
      expect(result).toContain('Use caching');
    });

    it('should format estimated cost', () => {
      const event = {
        type: 'auto_mode_ultrathink_preparation',
        estimatedCost: 1.5,
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('Estimated Cost: ~$1.50');
    });

    it('should format estimated time', () => {
      const event = {
        type: 'auto_mode_ultrathink_preparation',
        estimatedTime: '5-10 minutes',
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('Estimated Time: 5-10 minutes');
    });

    it('should handle event with no optional fields', () => {
      const event = {
        type: 'auto_mode_ultrathink_preparation',
      } as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toContain('Ultrathink Preparation');
      expect(result).not.toContain('Warnings:');
      expect(result).not.toContain('Recommendations:');
    });
  });

  describe('unknown event type', () => {
    it('should return empty string for unknown event types', () => {
      const event = { type: 'unknown_type' } as unknown as AutoModeEvent;
      const result = formatAutoModeEventContent(event);
      expect(result).toBe('');
    });
  });
});

describe('formatBacklogPlanEventContent', () => {
  it('should format backlog_plan_progress', () => {
    const event = { type: 'backlog_plan_progress', content: 'Analyzing features' };
    const result = formatBacklogPlanEventContent(event as BacklogPlanEvent);
    expect(result).toContain('🧭');
    expect(result).toContain('Analyzing features');
  });

  it('should handle missing content in progress event', () => {
    const event = { type: 'backlog_plan_progress' };
    const result = formatBacklogPlanEventContent(event as BacklogPlanEvent);
    expect(result).toContain('Backlog plan progress update');
  });

  it('should format backlog_plan_error', () => {
    const event = { type: 'backlog_plan_error', error: 'API failure' };
    const result = formatBacklogPlanEventContent(event as BacklogPlanEvent);
    expect(result).toContain('❌');
    expect(result).toContain('API failure');
  });

  it('should handle missing error message', () => {
    const event = { type: 'backlog_plan_error' };
    const result = formatBacklogPlanEventContent(event as BacklogPlanEvent);
    expect(result).toContain('Unknown error');
  });

  it('should format backlog_plan_complete', () => {
    const event = { type: 'backlog_plan_complete' };
    const result = formatBacklogPlanEventContent(event as BacklogPlanEvent);
    expect(result).toContain('✅');
    expect(result).toContain('Backlog plan completed');
  });

  it('should format unknown backlog event type', () => {
    const event = { type: 'some_other_event' };
    const result = formatBacklogPlanEventContent(event as BacklogPlanEvent);
    expect(result).toContain('some_other_event');
  });
});
