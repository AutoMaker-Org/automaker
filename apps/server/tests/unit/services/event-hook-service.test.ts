import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventHookService } from '../../../src/services/event-hook-service.js';
import type { EventEmitter, EventCallback, EventType } from '../../../src/lib/events.js';
import type { SettingsService } from '../../../src/services/settings-service.js';
import type { EventHistoryService } from '../../../src/services/event-history-service.js';
import type { FeatureLoader } from '../../../src/services/feature-loader.js';

/**
 * Create a mock EventEmitter for testing
 */
function createMockEventEmitter(): EventEmitter & {
  subscribers: Set<EventCallback>;
  simulateEvent: (type: EventType, payload: unknown) => void;
} {
  const subscribers = new Set<EventCallback>();

  return {
    subscribers,
    emit(type: EventType, payload: unknown) {
      for (const callback of subscribers) {
        callback(type, payload);
      }
    },
    subscribe(callback: EventCallback) {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    },
    simulateEvent(type: EventType, payload: unknown) {
      for (const callback of subscribers) {
        callback(type, payload);
      }
    },
  };
}

/**
 * Create a mock SettingsService
 */
function createMockSettingsService(hooks: unknown[] = []): SettingsService {
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({ eventHooks: hooks }),
  } as unknown as SettingsService;
}

/**
 * Create a mock EventHistoryService
 */
function createMockEventHistoryService() {
  return {
    storeEvent: vi.fn().mockResolvedValue({ id: 'test-event-id' }),
  } as unknown as EventHistoryService;
}

/**
 * Create a mock FeatureLoader
 */
function createMockFeatureLoader(features: Record<string, { title: string }> = {}) {
  return {
    get: vi.fn().mockImplementation((_projectPath: string, featureId: string) => {
      return Promise.resolve(features[featureId] || null);
    }),
  } as unknown as FeatureLoader;
}

describe('EventHookService', () => {
  let service: EventHookService;
  let mockEmitter: ReturnType<typeof createMockEventEmitter>;
  let mockSettingsService: ReturnType<typeof createMockSettingsService>;
  let mockEventHistoryService: ReturnType<typeof createMockEventHistoryService>;
  let mockFeatureLoader: ReturnType<typeof createMockFeatureLoader>;

  beforeEach(() => {
    service = new EventHookService();
    mockEmitter = createMockEventEmitter();
    mockSettingsService = createMockSettingsService();
    mockEventHistoryService = createMockEventHistoryService();
    mockFeatureLoader = createMockFeatureLoader();
  });

  afterEach(() => {
    service.destroy();
  });

  describe('initialize', () => {
    it('should subscribe to the event emitter', () => {
      service.initialize(mockEmitter, mockSettingsService, mockEventHistoryService);
      expect(mockEmitter.subscribers.size).toBe(1);
    });

    it('should log initialization', () => {
      service.initialize(mockEmitter, mockSettingsService);
      expect(mockEmitter.subscribers.size).toBe(1);
    });
  });

  describe('destroy', () => {
    it('should unsubscribe from the event emitter', () => {
      service.initialize(mockEmitter, mockSettingsService);
      expect(mockEmitter.subscribers.size).toBe(1);

      service.destroy();
      expect(mockEmitter.subscribers.size).toBe(0);
    });
  });

  describe('event mapping - auto_mode_feature_complete', () => {
    it('should map to feature_success when passes is true', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'feat-1',
        featureName: 'Test Feature',
        passes: true,
        message: 'Feature completed in 30s',
        projectPath: '/test/project',
      });

      // Allow async processing
      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.trigger).toBe('feature_success');
      expect(storeCall.passes).toBe(true);
    });

    it('should map to feature_error when passes is false', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'feat-1',
        featureName: 'Test Feature',
        passes: false,
        message: 'Feature stopped by user',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.trigger).toBe('feature_error');
      expect(storeCall.passes).toBe(false);
    });

    it('should NOT populate error field for successful feature completion', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'feat-1',
        featureName: 'Test Feature',
        passes: true,
        message: 'Feature completed in 30s - auto-verified',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.trigger).toBe('feature_success');
      // Critical: error should NOT contain the success message
      expect(storeCall.error).toBeUndefined();
      expect(storeCall.errorType).toBeUndefined();
    });

    it('should populate error field for failed feature completion', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'feat-1',
        featureName: 'Test Feature',
        passes: false,
        message: 'Feature stopped by user',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.trigger).toBe('feature_error');
      // Error field should be populated for error triggers
      expect(storeCall.error).toBe('Feature stopped by user');
    });
  });

  describe('event mapping - auto_mode_error', () => {
    it('should map to feature_error when featureId is present', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_error',
        featureId: 'feat-1',
        error: 'Network timeout',
        errorType: 'network',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.trigger).toBe('feature_error');
      expect(storeCall.error).toBe('Network timeout');
      expect(storeCall.errorType).toBe('network');
    });

    it('should map to auto_mode_error when featureId is not present', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_error',
        error: 'System error',
        errorType: 'system',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.trigger).toBe('auto_mode_error');
      expect(storeCall.error).toBe('System error');
      expect(storeCall.errorType).toBe('system');
    });
  });

  describe('event mapping - auto_mode_idle', () => {
    it('should map to auto_mode_complete', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_idle',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.trigger).toBe('auto_mode_complete');
    });
  });

  describe('event mapping - feature:created', () => {
    it('should trigger feature_created hook', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('feature:created', {
        featureId: 'feat-1',
        featureName: 'New Feature',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.trigger).toBe('feature_created');
      expect(storeCall.featureId).toBe('feat-1');
    });
  });

  describe('event mapping - unhandled events', () => {
    it('should ignore auto-mode events with unrecognized types', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_progress',
        featureId: 'feat-1',
        content: 'Working...',
        projectPath: '/test/project',
      });

      // Give it time to process
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockEventHistoryService.storeEvent).not.toHaveBeenCalled();
    });

    it('should ignore events without a type', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        featureId: 'feat-1',
        projectPath: '/test/project',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockEventHistoryService.storeEvent).not.toHaveBeenCalled();
    });
  });

  describe('hook execution', () => {
    it('should execute matching enabled hooks for feature_success', async () => {
      const hooks = [
        {
          id: 'hook-1',
          enabled: true,
          trigger: 'feature_success',
          name: 'Success Hook',
          action: {
            type: 'shell',
            command: 'echo "success"',
          },
        },
        {
          id: 'hook-2',
          enabled: true,
          trigger: 'feature_error',
          name: 'Error Hook',
          action: {
            type: 'shell',
            command: 'echo "error"',
          },
        },
      ];

      mockSettingsService = createMockSettingsService(hooks);
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'feat-1',
        featureName: 'Test Feature',
        passes: true,
        message: 'Feature completed in 30s',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockSettingsService.getGlobalSettings).toHaveBeenCalled();
      });

      // The error hook should NOT have been triggered for a success event
      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.trigger).toBe('feature_success');
    });

    it('should NOT execute error hooks when feature completes successfully', async () => {
      // This is the key regression test for the bug:
      // "Error event hook fired when a feature completes successfully"
      const errorHookCommand = vi.fn();
      const hooks = [
        {
          id: 'hook-error',
          enabled: true,
          trigger: 'feature_error',
          name: 'Error Notification',
          action: {
            type: 'shell',
            command: 'echo "ERROR FIRED"',
          },
        },
      ];

      mockSettingsService = createMockSettingsService(hooks);
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'feat-1',
        featureName: 'Test Feature',
        passes: true,
        message: 'Feature completed in 30s - auto-verified',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      // Verify the trigger was feature_success, not feature_error
      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.trigger).toBe('feature_success');
      // And no error information should be present
      expect(storeCall.error).toBeUndefined();
      expect(storeCall.errorType).toBeUndefined();
    });
  });

  describe('feature name loading', () => {
    it('should load feature name from feature loader when not in payload', async () => {
      mockFeatureLoader = createMockFeatureLoader({
        'feat-1': { title: 'Loaded Feature Title' },
      });

      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'feat-1',
        passes: true,
        message: 'Done',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.featureName).toBe('Loaded Feature Title');
    });

    it('should fall back to payload featureName when loader fails', async () => {
      mockFeatureLoader = createMockFeatureLoader({}); // Empty - no features found

      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'feat-1',
        featureName: 'Fallback Name',
        passes: true,
        message: 'Done',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.featureName).toBe('Fallback Name');
    });
  });

  describe('error context for error events', () => {
    it('should use payload.error when available for error triggers', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_error',
        featureId: 'feat-1',
        error: 'Authentication failed',
        errorType: 'auth',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.error).toBe('Authentication failed');
      expect(storeCall.errorType).toBe('auth');
    });

    it('should fall back to payload.message for error field in error triggers', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'feat-1',
        passes: false,
        message: 'Feature stopped by user',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.trigger).toBe('feature_error');
      expect(storeCall.error).toBe('Feature stopped by user');
    });
  });
});
