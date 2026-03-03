import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventHookService } from '../../../src/services/event-hook-service.js';
import type { EventEmitter, EventCallback, EventType } from '../../../src/lib/events.js';
import type { SettingsService } from '../../../src/services/settings-service.js';
import type { EventHistoryService } from '../../../src/services/event-history-service.js';
import type { FeatureLoader } from '../../../src/services/feature-loader.js';

// Mock global fetch for ntfy tests
const originalFetch = global.fetch;

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
function createMockSettingsService(
  hooks: unknown[] = [],
  ntfyEndpoints: unknown[] = []
): SettingsService {
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({
      eventHooks: hooks,
      ntfyEndpoints: ntfyEndpoints,
    }),
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
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new EventHookService();
    mockEmitter = createMockEventEmitter();
    mockSettingsService = createMockSettingsService();
    mockEventHistoryService = createMockEventHistoryService();
    mockFeatureLoader = createMockFeatureLoader();
    // Set up mock fetch for ntfy tests
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    service.destroy();
    global.fetch = originalFetch;
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
        executionMode: 'auto',
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
        executionMode: 'auto',
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
        executionMode: 'auto',
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
        executionMode: 'auto',
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

    it('should ignore feature complete events without explicit auto execution mode', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'feat-1',
        featureName: 'Manual Feature',
        passes: true,
        message: 'Manually verified',
        projectPath: '/test/project',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockEventHistoryService.storeEvent).not.toHaveBeenCalled();
    });
  });

  describe('event mapping - feature:completed', () => {
    it('should map manual completion to feature_success', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('feature:completed', {
        featureId: 'feat-1',
        featureName: 'Manual Feature',
        projectPath: '/test/project',
        passes: true,
        executionMode: 'manual',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.trigger).toBe('feature_success');
      expect(storeCall.passes).toBe(true);
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
        executionMode: 'auto',
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
        executionMode: 'auto',
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
        executionMode: 'auto',
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
        executionMode: 'auto',
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

  describe('event mapping - feature_status_changed (non-auto-mode completion)', () => {
    it('should trigger feature_success when status changes to verified', async () => {
      mockFeatureLoader = createMockFeatureLoader({
        'feat-1': { title: 'Manual Feature' },
      });

      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'feature_status_changed',
        featureId: 'feat-1',
        projectPath: '/test/project',
        status: 'verified',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.trigger).toBe('feature_success');
      expect(storeCall.featureName).toBe('Manual Feature');
      expect(storeCall.passes).toBe(true);
    });

    it('should trigger feature_success when status changes to waiting_approval', async () => {
      mockFeatureLoader = createMockFeatureLoader({
        'feat-1': { title: 'Manual Feature' },
      });

      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'feature_status_changed',
        featureId: 'feat-1',
        projectPath: '/test/project',
        status: 'waiting_approval',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      const storeCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(storeCall.trigger).toBe('feature_success');
      expect(storeCall.passes).toBe(true);
      expect(storeCall.featureName).toBe('Manual Feature');
    });

    it('should NOT trigger hooks for non-completion status changes', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'feature_status_changed',
        featureId: 'feat-1',
        projectPath: '/test/project',
        status: 'in_progress',
      });

      // Give it time to process
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockEventHistoryService.storeEvent).not.toHaveBeenCalled();
    });

    it('should NOT double-fire hooks when auto_mode_feature_complete already fired', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      // First: auto_mode_feature_complete fires (auto-mode path)
      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        executionMode: 'auto',
        featureId: 'feat-1',
        featureName: 'Auto Feature',
        passes: true,
        message: 'Feature completed',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalledTimes(1);
      });

      // Then: feature_status_changed fires for the same feature
      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'feature_status_changed',
        featureId: 'feat-1',
        projectPath: '/test/project',
        status: 'verified',
      });

      // Give it time to process
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should still only have been called once (from auto_mode_feature_complete)
      expect(mockEventHistoryService.storeEvent).toHaveBeenCalledTimes(1);
    });

    it('should NOT double-fire hooks when auto_mode_error already fired for feature', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      // First: auto_mode_error fires for a feature
      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_error',
        featureId: 'feat-1',
        error: 'Something failed',
        errorType: 'execution',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalledTimes(1);
      });

      // Then: feature_status_changed fires for the same feature (e.g., reset to backlog)
      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'feature_status_changed',
        featureId: 'feat-1',
        projectPath: '/test/project',
        status: 'verified', // unlikely after error, but tests the dedup
      });

      // Give it time to process
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should still only have been called once
      expect(mockEventHistoryService.storeEvent).toHaveBeenCalledTimes(1);
    });

    it('should fire hooks for different features independently', async () => {
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      // Auto-mode completion for feat-1
      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        executionMode: 'auto',
        featureId: 'feat-1',
        passes: true,
        message: 'Done',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalledTimes(1);
      });

      // Manual completion for feat-2 (different feature)
      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'feature_status_changed',
        featureId: 'feat-2',
        projectPath: '/test/project',
        status: 'verified',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalledTimes(2);
      });

      // feat-2 should have triggered feature_success
      const secondCall = (mockEventHistoryService.storeEvent as ReturnType<typeof vi.fn>).mock
        .calls[1][0];
      expect(secondCall.trigger).toBe('feature_success');
      expect(secondCall.featureId).toBe('feat-2');
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
        executionMode: 'auto',
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

  describe('ntfy hook execution', () => {
    const mockNtfyEndpoint = {
      id: 'endpoint-1',
      name: 'Test Endpoint',
      serverUrl: 'https://ntfy.sh',
      topic: 'test-topic',
      authType: 'none' as const,
      enabled: true,
    };

    it('should execute ntfy hook when endpoint is configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const hooks = [
        {
          id: 'ntfy-hook-1',
          enabled: true,
          trigger: 'feature_success',
          name: 'Ntfy Success Hook',
          action: {
            type: 'ntfy',
            endpointId: 'endpoint-1',
            title: 'Feature {{featureName}} completed!',
            priority: 3,
          },
        },
      ];

      mockSettingsService = createMockSettingsService(hooks, [mockNtfyEndpoint]);
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        executionMode: 'auto',
        featureId: 'feat-1',
        featureName: 'Test Feature',
        passes: true,
        message: 'Feature completed',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://ntfy.sh/test-topic');
      expect(options.method).toBe('POST');
      expect(options.headers['Title']).toBe('Feature Test Feature completed!');
    });

    it('should NOT execute ntfy hook when endpoint is not found', async () => {
      const hooks = [
        {
          id: 'ntfy-hook-1',
          enabled: true,
          trigger: 'feature_success',
          name: 'Ntfy Hook with Missing Endpoint',
          action: {
            type: 'ntfy',
            endpointId: 'non-existent-endpoint',
          },
        },
      ];

      mockSettingsService = createMockSettingsService(hooks, [mockNtfyEndpoint]);
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        executionMode: 'auto',
        featureId: 'feat-1',
        featureName: 'Test Feature',
        passes: true,
        message: 'Feature completed',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      // Fetch should NOT have been called since endpoint doesn't exist
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should use ntfy endpoint default values when hook does not override', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const endpointWithDefaults = {
        ...mockNtfyEndpoint,
        defaultTags: 'default-tag',
        defaultEmoji: 'tada',
        defaultClickUrl: 'https://default.example.com',
      };

      const hooks = [
        {
          id: 'ntfy-hook-1',
          enabled: true,
          trigger: 'feature_error',
          name: 'Ntfy Error Hook',
          action: {
            type: 'ntfy',
            endpointId: 'endpoint-1',
            // No title, tags, or emoji - should use endpoint defaults
          },
        },
      ];

      mockSettingsService = createMockSettingsService(hooks, [endpointWithDefaults]);
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        executionMode: 'auto',
        featureId: 'feat-1',
        featureName: 'Failed Feature',
        passes: false,
        message: 'Something went wrong',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const options = mockFetch.mock.calls[0][1];
      // Should use default tags and emoji from endpoint
      expect(options.headers['Tags']).toBe('tada,default-tag');
      // Click URL gets deep-link query param when feature context is available
      expect(options.headers['Click']).toContain('https://default.example.com/board');
      expect(options.headers['Click']).toContain('featureId=feat-1');
    });

    it('should send ntfy notification with authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const endpointWithAuth = {
        ...mockNtfyEndpoint,
        authType: 'token' as const,
        token: 'tk_test_token',
      };

      const hooks = [
        {
          id: 'ntfy-hook-1',
          enabled: true,
          trigger: 'feature_success',
          name: 'Authenticated Ntfy Hook',
          action: {
            type: 'ntfy',
            endpointId: 'endpoint-1',
          },
        },
      ];

      mockSettingsService = createMockSettingsService(hooks, [endpointWithAuth]);
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        executionMode: 'auto',
        featureId: 'feat-1',
        featureName: 'Test Feature',
        passes: true,
        message: 'Feature completed',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Authorization']).toBe('Bearer tk_test_token');
    });

    it('should handle ntfy notification failure gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const hooks = [
        {
          id: 'ntfy-hook-1',
          enabled: true,
          trigger: 'feature_success',
          name: 'Ntfy Hook That Will Fail',
          action: {
            type: 'ntfy',
            endpointId: 'endpoint-1',
          },
        },
      ];

      mockSettingsService = createMockSettingsService(hooks, [mockNtfyEndpoint]);
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        executionMode: 'auto',
        featureId: 'feat-1',
        featureName: 'Test Feature',
        passes: true,
        message: 'Feature completed',
        projectPath: '/test/project',
      });

      // Should not throw - error should be caught gracefully
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Event should still be stored even if ntfy hook fails
      expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
    });

    it('should substitute variables in ntfy title and body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const hooks = [
        {
          id: 'ntfy-hook-1',
          enabled: true,
          trigger: 'feature_success',
          name: 'Ntfy Hook with Variables',
          action: {
            type: 'ntfy',
            endpointId: 'endpoint-1',
            title: '[{{projectName}}] {{featureName}}',
            body: 'Feature {{featureId}} completed at {{timestamp}}',
          },
        },
      ];

      mockSettingsService = createMockSettingsService(hooks, [mockNtfyEndpoint]);
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        executionMode: 'auto',
        featureId: 'feat-123',
        featureName: 'Cool Feature',
        passes: true,
        message: 'Feature completed',
        projectPath: '/test/my-project',
        projectName: 'my-project',
      });

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Title']).toBe('[my-project] Cool Feature');
      expect(options.body).toContain('feat-123');
    });

    it('should NOT execute ntfy hook when endpoint is disabled', async () => {
      const disabledEndpoint = {
        ...mockNtfyEndpoint,
        enabled: false,
      };

      const hooks = [
        {
          id: 'ntfy-hook-1',
          enabled: true,
          trigger: 'feature_success',
          name: 'Ntfy Hook with Disabled Endpoint',
          action: {
            type: 'ntfy',
            endpointId: 'endpoint-1',
          },
        },
      ];

      mockSettingsService = createMockSettingsService(hooks, [disabledEndpoint]);
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        executionMode: 'auto',
        featureId: 'feat-1',
        featureName: 'Test Feature',
        passes: true,
        message: 'Feature completed',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockEventHistoryService.storeEvent).toHaveBeenCalled();
      });

      // Fetch should not be called because endpoint is disabled
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should use hook-specific values over endpoint defaults', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const endpointWithDefaults = {
        ...mockNtfyEndpoint,
        defaultTags: 'default-tag',
        defaultEmoji: 'default-emoji',
        defaultClickUrl: 'https://default.example.com',
      };

      const hooks = [
        {
          id: 'ntfy-hook-1',
          enabled: true,
          trigger: 'feature_success',
          name: 'Ntfy Hook with Overrides',
          action: {
            type: 'ntfy',
            endpointId: 'endpoint-1',
            tags: 'override-tag',
            emoji: 'override-emoji',
            clickUrl: 'https://override.example.com',
            priority: 5,
          },
        },
      ];

      mockSettingsService = createMockSettingsService(hooks, [endpointWithDefaults]);
      service.initialize(
        mockEmitter,
        mockSettingsService,
        mockEventHistoryService,
        mockFeatureLoader
      );

      mockEmitter.simulateEvent('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        executionMode: 'auto',
        featureId: 'feat-1',
        featureName: 'Test Feature',
        passes: true,
        message: 'Feature completed',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const options = mockFetch.mock.calls[0][1];
      // Hook values should override endpoint defaults
      expect(options.headers['Tags']).toBe('override-emoji,override-tag');
      // Click URL uses hook-specific base URL with deep link params applied
      expect(options.headers['Click']).toContain('https://override.example.com/board');
      expect(options.headers['Click']).toContain('featureId=feat-1');
      expect(options.headers['Priority']).toBe('5');
    });

    describe('click URL deep linking', () => {
      it('should generate board URL with featureId query param when feature context is available', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
        });

        const endpointWithDefaultClickUrl = {
          ...mockNtfyEndpoint,
          defaultClickUrl: 'https://app.example.com',
        };

        const hooks = [
          {
            id: 'ntfy-hook-1',
            enabled: true,
            trigger: 'feature_success',
            name: 'Ntfy Hook',
            action: {
              type: 'ntfy',
              endpointId: 'endpoint-1',
            },
          },
        ];

        mockSettingsService = createMockSettingsService(hooks, [endpointWithDefaultClickUrl]);
        service.initialize(
          mockEmitter,
          mockSettingsService,
          mockEventHistoryService,
          mockFeatureLoader
        );

        mockEmitter.simulateEvent('auto-mode:event', {
          type: 'auto_mode_feature_complete',
          executionMode: 'auto',
          featureId: 'test-feature-123',
          featureName: 'Test Feature',
          passes: true,
          message: 'Feature completed',
          projectPath: '/test/project',
        });

        await vi.waitFor(() => {
          expect(mockFetch).toHaveBeenCalled();
        });

        const options = mockFetch.mock.calls[0][1];
        const clickUrl = options.headers['Click'];

        // Should use /board path with featureId query param
        expect(clickUrl).toContain('/board');
        expect(clickUrl).toContain('featureId=test-feature-123');
        // Should NOT use the old path-based format
        expect(clickUrl).not.toContain('/feature/');
      });

      it('should generate board URL without featureId when no feature context', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
        });

        const endpointWithDefaultClickUrl = {
          ...mockNtfyEndpoint,
          defaultClickUrl: 'https://app.example.com',
        };

        const hooks = [
          {
            id: 'ntfy-hook-1',
            enabled: true,
            trigger: 'auto_mode_complete',
            name: 'Auto Mode Complete Hook',
            action: {
              type: 'ntfy',
              endpointId: 'endpoint-1',
            },
          },
        ];

        mockSettingsService = createMockSettingsService(hooks, [endpointWithDefaultClickUrl]);
        service.initialize(
          mockEmitter,
          mockSettingsService,
          mockEventHistoryService,
          mockFeatureLoader
        );

        // Event without featureId but with projectPath (auto_mode_idle triggers auto_mode_complete)
        mockEmitter.simulateEvent('auto-mode:event', {
          type: 'auto_mode_idle',
          executionMode: 'auto',
          projectPath: '/test/project',
          totalFeatures: 5,
        });

        await vi.waitFor(() => {
          expect(mockFetch).toHaveBeenCalled();
        });

        const options = mockFetch.mock.calls[0][1];
        const clickUrl = options.headers['Click'];

        // Should navigate to board without featureId
        expect(clickUrl).toContain('/board');
        expect(clickUrl).not.toContain('featureId=');
      });

      it('should apply deep link params to hook-specific click URL', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
        });

        const endpointWithDefaultClickUrl = {
          ...mockNtfyEndpoint,
          defaultClickUrl: 'https://default.example.com',
        };

        const hooks = [
          {
            id: 'ntfy-hook-1',
            enabled: true,
            trigger: 'feature_success',
            name: 'Ntfy Hook with Custom Click URL',
            action: {
              type: 'ntfy',
              endpointId: 'endpoint-1',
              clickUrl: 'https://custom.example.com/custom-page',
            },
          },
        ];

        mockSettingsService = createMockSettingsService(hooks, [endpointWithDefaultClickUrl]);
        service.initialize(
          mockEmitter,
          mockSettingsService,
          mockEventHistoryService,
          mockFeatureLoader
        );

        mockEmitter.simulateEvent('auto-mode:event', {
          type: 'auto_mode_feature_complete',
          executionMode: 'auto',
          featureId: 'feat-789',
          featureName: 'Custom URL Test',
          passes: true,
          message: 'Feature completed',
          projectPath: '/test/project',
        });

        await vi.waitFor(() => {
          expect(mockFetch).toHaveBeenCalled();
        });

        const options = mockFetch.mock.calls[0][1];
        const clickUrl = options.headers['Click'];

        // Should use the hook-specific click URL with deep link params applied
        expect(clickUrl).toContain('https://custom.example.com/board');
        expect(clickUrl).toContain('featureId=feat-789');
      });

      it('should preserve existing query params when adding featureId', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
        });

        const endpointWithDefaultClickUrl = {
          ...mockNtfyEndpoint,
          defaultClickUrl: 'https://app.example.com/board?view=list',
        };

        const hooks = [
          {
            id: 'ntfy-hook-1',
            enabled: true,
            trigger: 'feature_success',
            name: 'Ntfy Hook',
            action: {
              type: 'ntfy',
              endpointId: 'endpoint-1',
            },
          },
        ];

        mockSettingsService = createMockSettingsService(hooks, [endpointWithDefaultClickUrl]);
        service.initialize(
          mockEmitter,
          mockSettingsService,
          mockEventHistoryService,
          mockFeatureLoader
        );

        mockEmitter.simulateEvent('auto-mode:event', {
          type: 'auto_mode_feature_complete',
          executionMode: 'auto',
          featureId: 'feat-456',
          featureName: 'Test Feature',
          passes: true,
          message: 'Feature completed',
          projectPath: '/test/project',
        });

        await vi.waitFor(() => {
          expect(mockFetch).toHaveBeenCalled();
        });

        const options = mockFetch.mock.calls[0][1];
        const clickUrl = options.headers['Click'];

        // Should preserve existing query params and add featureId
        expect(clickUrl).toContain('view=list');
        expect(clickUrl).toContain('featureId=feat-456');
        // Should be properly formatted URL
        expect(clickUrl).toMatch(/^https:\/\/app\.example\.com\/board\?.+$/);
      });
    });
  });
});
