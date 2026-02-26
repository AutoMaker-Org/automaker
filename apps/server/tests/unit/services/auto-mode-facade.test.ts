import { describe, it, expect } from 'vitest';
import { AutoModeServiceFacade } from '@/services/auto-mode/facade.js';
import type { Feature } from '@automaker/types';

describe('AutoModeServiceFacade', () => {
  describe('isFeatureEligibleForAutoMode', () => {
    it('should include features with pipeline_* status', () => {
      const features: Partial<Feature>[] = [
        { id: '1', status: 'ready', branchName: 'main' },
        { id: '2', status: 'pipeline_testing', branchName: 'main' },
        { id: '3', status: 'in_progress', branchName: 'main' },
        { id: '4', status: 'interrupted', branchName: 'main' },
        { id: '5', status: 'backlog', branchName: 'main' },
      ];

      const branchName = 'main';
      const primaryBranch = 'main';

      const filtered = features.filter((f) =>
        AutoModeServiceFacade.isFeatureEligibleForAutoMode(f as Feature, branchName, primaryBranch)
      );

      expect(filtered.map((f) => f.id)).toContain('1'); // ready
      expect(filtered.map((f) => f.id)).toContain('2'); // pipeline_testing
      expect(filtered.map((f) => f.id)).toContain('4'); // interrupted
      expect(filtered.map((f) => f.id)).toContain('5'); // backlog
      expect(filtered.map((f) => f.id)).not.toContain('3'); // in_progress
    });

    it('should correctly handle main worktree alignment', () => {
      const features: Partial<Feature>[] = [
        { id: '1', status: 'ready', branchName: undefined },
        { id: '2', status: 'ready', branchName: 'main' },
        { id: '3', status: 'ready', branchName: 'other' },
      ];

      const branchName = null; // main worktree
      const primaryBranch = 'main';

      const filtered = features.filter((f) =>
        AutoModeServiceFacade.isFeatureEligibleForAutoMode(f as Feature, branchName, primaryBranch)
      );

      expect(filtered.map((f) => f.id)).toContain('1'); // no branch
      expect(filtered.map((f) => f.id)).toContain('2'); // matching primary branch
      expect(filtered.map((f) => f.id)).not.toContain('3'); // mismatching branch
    });

    it('should exclude completed, verified, and waiting_approval statuses', () => {
      const features: Partial<Feature>[] = [
        { id: '1', status: 'completed', branchName: 'main' },
        { id: '2', status: 'verified', branchName: 'main' },
        { id: '3', status: 'waiting_approval', branchName: 'main' },
      ];

      const filtered = features.filter((f) =>
        AutoModeServiceFacade.isFeatureEligibleForAutoMode(f as Feature, 'main', 'main')
      );

      expect(filtered).toHaveLength(0);
    });

    it('should include pipeline_complete as eligible (still a pipeline status)', () => {
      const feature: Partial<Feature> = {
        id: '1',
        status: 'pipeline_complete',
        branchName: 'main',
      };

      const result = AutoModeServiceFacade.isFeatureEligibleForAutoMode(
        feature as Feature,
        'main',
        'main'
      );

      expect(result).toBe(true);
    });

    it('should filter pipeline features by branch in named worktrees', () => {
      const features: Partial<Feature>[] = [
        { id: '1', status: 'pipeline_testing', branchName: 'feature-branch' },
        { id: '2', status: 'pipeline_review', branchName: 'other-branch' },
        { id: '3', status: 'pipeline_deploy', branchName: undefined },
      ];

      const filtered = features.filter((f) =>
        AutoModeServiceFacade.isFeatureEligibleForAutoMode(f as Feature, 'feature-branch', null)
      );

      expect(filtered.map((f) => f.id)).toEqual(['1']);
    });

    it('should handle null primaryBranch for main worktree', () => {
      const features: Partial<Feature>[] = [
        { id: '1', status: 'ready', branchName: undefined },
        { id: '2', status: 'ready', branchName: 'main' },
      ];

      const filtered = features.filter((f) =>
        AutoModeServiceFacade.isFeatureEligibleForAutoMode(f as Feature, null, null)
      );

      // When primaryBranch is null, only features with no branchName are included
      expect(filtered.map((f) => f.id)).toEqual(['1']);
    });

    it('should include various pipeline_* step IDs as eligible', () => {
      const statuses = [
        'pipeline_step_abc_123',
        'pipeline_code_review',
        'pipeline_step1',
        'pipeline_testing',
        'pipeline_deploy',
      ];

      for (const status of statuses) {
        const feature: Partial<Feature> = { id: '1', status, branchName: 'main' };
        const result = AutoModeServiceFacade.isFeatureEligibleForAutoMode(
          feature as Feature,
          'main',
          'main'
        );
        expect(result).toBe(true);
      }
    });
  });
});
