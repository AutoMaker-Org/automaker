/**
 * Tests for Auto Mode Service Usage Limit Feature
 *
 * Tests the behavior when usage limits are reached:
 * - Immediate check before starting auto mode
 * - Pause dialog emission when limits are hit
 * - Suggested resume time calculation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoModeService } from '@/services/auto-mode-service.js';
import { ClaudeUsageService } from '@/services/claude-usage-service.js';

describe('AutoModeService - Usage Limit Feature', () => {
  let service: AutoModeService;
  const mockEvents = {
    subscribe: vi.fn(),
    emit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AutoModeService(mockEvents as any);

    // Mock ClaudeUsageService methods
    vi.spyOn(ClaudeUsageService.prototype, 'isAvailable').mockResolvedValue(true);
  });

  afterEach(async () => {
    // Cleanup: stop any running loops
    try {
      await service.stopAutoLoop();
    } catch {
      // Ignore errors during cleanup
    }
  });

  describe('startAutoLoop - Usage Limit Check', () => {
    it('should check usage limits before starting the loop', async () => {
      const mockUsage = {
        sessionPercentage: 50,
        weeklyPercentage: 60,
        sessionResetTime: null,
        weeklyResetTime: null,
        sonnetWeeklyPercentage: 0,
        sessionTokensUsed: 0,
        sessionLimit: 0,
        costUsed: null,
        costLimit: null,
        costCurrency: null,
        sessionResetText: '',
        weeklyResetText: '',
        userTimezone: 'UTC',
      };

      vi.spyOn(ClaudeUsageService.prototype, 'fetchUsageData').mockResolvedValue(mockUsage);

      const promise = service.startAutoLoop('/test/project', 3);

      // Give it time to check usage
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(ClaudeUsageService.prototype.isAvailable).toHaveBeenCalled();
      expect(ClaudeUsageService.prototype.fetchUsageData).toHaveBeenCalled();

      // Cleanup
      await service.stopAutoLoop();
      await promise.catch(() => {});
    });

    it('should emit pause event and NOT start loop when session limit is reached', async () => {
      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
      const mockUsage = {
        sessionPercentage: 100,
        weeklyPercentage: 50,
        sessionResetTime: futureDate.toISOString(),
        weeklyResetTime: null,
        sonnetWeeklyPercentage: 0,
        sessionTokensUsed: 0,
        sessionLimit: 0,
        costUsed: null,
        costLimit: null,
        costCurrency: null,
        sessionResetText: 'Resets in 2h',
        weeklyResetText: '',
        userTimezone: 'UTC',
      };

      vi.spyOn(ClaudeUsageService.prototype, 'fetchUsageData').mockResolvedValue(mockUsage);

      await service.startAutoLoop('/test/project', 3);

      // Should emit pause event
      const emitCalls = mockEvents.emit.mock.calls;
      expect(emitCalls.length).toBeGreaterThan(0);
      const pauseEventCall = emitCalls.find(
        (call) => call[1]?.type === 'auto_mode_paused_failures'
      );
      expect(pauseEventCall).toBeDefined();
      expect(pauseEventCall![0]).toBe('auto-mode:event');
      expect(pauseEventCall![1].errorType).toBe('quota_exhausted');
      expect(pauseEventCall![1].message.toLowerCase()).toContain('usage limit');
      expect(pauseEventCall![1].suggestedResumeAt).toBe(futureDate.toISOString());

      // Should NOT emit start event
      const startEventCalls = mockEvents.emit.mock.calls.filter((call: any[]) =>
        call[1]?.message?.includes('Auto mode started')
      );
      expect(startEventCalls.length).toBe(0);

      // Loop should not be running
      const runningCount = await service.stopAutoLoop();
      expect(runningCount).toBe(0);
    });

    it('should emit pause event and NOT start loop when weekly limit is reached', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      const mockUsage = {
        sessionPercentage: 50,
        weeklyPercentage: 100,
        sessionResetTime: null,
        weeklyResetTime: futureDate.toISOString(),
        sonnetWeeklyPercentage: 0,
        sessionTokensUsed: 0,
        sessionLimit: 0,
        costUsed: null,
        costLimit: null,
        costCurrency: null,
        sessionResetText: '',
        weeklyResetText: 'Resets tomorrow',
        userTimezone: 'UTC',
      };

      vi.spyOn(ClaudeUsageService.prototype, 'fetchUsageData').mockResolvedValue(mockUsage);

      await service.startAutoLoop('/test/project', 3);

      // Should emit pause event with weekly reset time
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'auto-mode:event',
        expect.objectContaining({
          type: 'auto_mode_paused_failures',
          errorType: 'quota_exhausted',
          suggestedResumeAt: futureDate.toISOString(),
        })
      );

      // Loop should not be running
      const runningCount = await service.stopAutoLoop();
      expect(runningCount).toBe(0);
    });

    it('should prioritize session reset time when both limits are reached', async () => {
      const sessionReset = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour
      const weeklyReset = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      const mockUsage = {
        sessionPercentage: 100,
        weeklyPercentage: 100,
        sessionResetTime: sessionReset.toISOString(),
        weeklyResetTime: weeklyReset.toISOString(),
        sonnetWeeklyPercentage: 0,
        sessionTokensUsed: 0,
        sessionLimit: 0,
        costUsed: null,
        costLimit: null,
        costCurrency: null,
        sessionResetText: 'Resets in 1h',
        weeklyResetText: 'Resets tomorrow',
        userTimezone: 'UTC',
      };

      vi.spyOn(ClaudeUsageService.prototype, 'fetchUsageData').mockResolvedValue(mockUsage);

      await service.startAutoLoop('/test/project', 3);

      // Should use session reset time (earlier)
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'auto-mode:event',
        expect.objectContaining({
          suggestedResumeAt: sessionReset.toISOString(),
        })
      );
    });

    it('should start loop normally when usage is below limits', async () => {
      const mockUsage = {
        sessionPercentage: 50,
        weeklyPercentage: 60,
        sessionResetTime: null,
        weeklyResetTime: null,
        sonnetWeeklyPercentage: 0,
        sessionTokensUsed: 0,
        sessionLimit: 0,
        costUsed: null,
        costLimit: null,
        costCurrency: null,
        sessionResetText: '',
        weeklyResetText: '',
        userTimezone: 'UTC',
      };

      vi.spyOn(ClaudeUsageService.prototype, 'fetchUsageData').mockResolvedValue(mockUsage);

      const promise = service.startAutoLoop('/test/project', 3);

      // Give it time to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should emit start event
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'auto-mode:event',
        expect.objectContaining({
          message: expect.stringContaining('Auto mode started'),
        })
      );

      // Cleanup
      await service.stopAutoLoop();
      await promise.catch(() => {});
    });

    it('should continue starting loop if usage check fails', async () => {
      vi.spyOn(ClaudeUsageService.prototype, 'fetchUsageData').mockRejectedValue(
        new Error('CLI not available')
      );

      const promise = service.startAutoLoop('/test/project', 3);

      // Give it time to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should still emit start event (graceful degradation)
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'auto-mode:event',
        expect.objectContaining({
          message: expect.stringContaining('Auto mode started'),
        })
      );

      // Cleanup
      await service.stopAutoLoop();
      await promise.catch(() => {});
    });

    it('should continue starting loop if CLI is not available', async () => {
      const fetchUsageSpy = vi.spyOn(ClaudeUsageService.prototype, 'fetchUsageData');
      vi.spyOn(ClaudeUsageService.prototype, 'isAvailable').mockResolvedValue(false);

      const promise = service.startAutoLoop('/test/project', 3);

      // Give it time to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not call fetchUsageData when CLI is not available
      expect(fetchUsageSpy).not.toHaveBeenCalled();

      // Should still emit start event
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'auto-mode:event',
        expect.objectContaining({
          message: expect.stringContaining('Auto mode started'),
        })
      );

      // Cleanup
      await service.stopAutoLoop();
      await promise.catch(() => {});
    });

    it('should include lastKnownUsage in pause event', async () => {
      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const mockUsage = {
        sessionPercentage: 100,
        weeklyPercentage: 50,
        sessionResetTime: futureDate.toISOString(),
        weeklyResetTime: null,
        sonnetWeeklyPercentage: 0,
        sessionTokensUsed: 1000,
        sessionLimit: 2000,
        costUsed: null,
        costLimit: null,
        costCurrency: null,
        sessionResetText: 'Resets in 2h',
        weeklyResetText: '',
        userTimezone: 'UTC',
      };

      vi.spyOn(ClaudeUsageService.prototype, 'fetchUsageData').mockResolvedValue(mockUsage);

      await service.startAutoLoop('/test/project', 3);

      // Should include usage data in event
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'auto-mode:event',
        expect.objectContaining({
          lastKnownUsage: expect.objectContaining({
            sessionPercentage: 100,
            sessionTokensUsed: 1000,
            sessionLimit: 2000,
          }),
        })
      );
    });
  });

  describe('trackFailureAndCheckPause - Immediate Pause on Quota Errors', () => {
    it('should immediately pause on quota_exhausted error without waiting for threshold', () => {
      // Access private method for testing
      const trackFailure = (service as any).trackFailureAndCheckPause.bind(service);

      const shouldPause = trackFailure({
        type: 'quota_exhausted',
        message: 'Quota exhausted',
        originalError: new Error('Quota exhausted'),
      });

      // Should pause immediately, not wait for 3 failures
      expect(shouldPause).toBe(true);
    });

    it('should immediately pause on rate_limit error without waiting for threshold', () => {
      const trackFailure = (service as any).trackFailureAndCheckPause.bind(service);

      const shouldPause = trackFailure({
        type: 'rate_limit',
        message: 'Rate limit exceeded',
        originalError: new Error('Rate limit exceeded'),
      });

      expect(shouldPause).toBe(true);
    });

    it('should immediately pause on ambiguous CLI exit error', () => {
      const trackFailure = (service as any).trackFailureAndCheckPause.bind(service);

      const shouldPause = trackFailure({
        type: 'unknown',
        message: 'Claude Code process exited with code 1',
        originalError: new Error('Claude Code process exited with code 1'),
      });

      // Should pause immediately on first occurrence (no longer wait for 2)
      expect(shouldPause).toBe(true);
    });

    it('should not immediately pause on regular errors', () => {
      const trackFailure = (service as any).trackFailureAndCheckPause.bind(service);

      const shouldPause = trackFailure({
        type: 'execution',
        message: 'Some generic error',
        originalError: new Error('Some generic error'),
      });

      // Should not pause on single regular error
      expect(shouldPause).toBe(false);
    });

    it('should pause after CONSECUTIVE_FAILURE_THRESHOLD for regular errors', () => {
      const trackFailure = (service as any).trackFailureAndCheckPause.bind(service);

      // First 2 failures should not pause
      expect(
        trackFailure({
          type: 'execution',
          message: 'Error 1',
          originalError: new Error('Error 1'),
        })
      ).toBe(false);

      expect(
        trackFailure({
          type: 'execution',
          message: 'Error 2',
          originalError: new Error('Error 2'),
        })
      ).toBe(false);

      // Third failure should pause (threshold is 3)
      expect(
        trackFailure({
          type: 'execution',
          message: 'Error 3',
          originalError: new Error('Error 3'),
        })
      ).toBe(true);
    });
  });

  describe('signalShouldPause - Usage Limit Detection', () => {
    it('should fetch usage data when pausing due to quota exhaustion', async () => {
      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const mockUsage = {
        sessionPercentage: 100,
        weeklyPercentage: 50,
        sessionResetTime: futureDate.toISOString(),
        weeklyResetTime: null,
        sonnetWeeklyPercentage: 0,
        sessionTokensUsed: 0,
        sessionLimit: 0,
        costUsed: null,
        costLimit: null,
        costCurrency: null,
        sessionResetText: 'Resets in 2h',
        weeklyResetText: '',
        userTimezone: 'UTC',
      };

      vi.spyOn(ClaudeUsageService.prototype, 'fetchUsageData').mockResolvedValue(mockUsage);

      // Access private method for testing
      const errorInfo = {
        type: 'quota_exhausted',
        message: 'Quota exhausted',
        originalError: new Error('Quota exhausted'),
      };

      // Set project path so usage check can run
      (service as any).config = { projectPath: '/test/project' };

      // Call the private method via a public method that triggers it
      // We'll need to trigger a failure that causes pause
      await service.startAutoLoop('/test/project', 3);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // The usage check should have been called
      expect(ClaudeUsageService.prototype.fetchUsageData).toHaveBeenCalled();

      await service.stopAutoLoop();
    });
  });
});
