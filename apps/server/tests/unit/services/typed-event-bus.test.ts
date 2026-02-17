import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TypedEventBus } from '../../../src/services/typed-event-bus.js';
import type { EventEmitter, EventCallback, EventType } from '../../../src/lib/events.js';

/**
 * Create a mock EventEmitter for testing
 */
function createMockEventEmitter(): EventEmitter & {
  emitCalls: Array<{ type: EventType; payload: unknown }>;
  subscribers: Set<EventCallback>;
} {
  const subscribers = new Set<EventCallback>();
  const emitCalls: Array<{ type: EventType; payload: unknown }> = [];

  return {
    emitCalls,
    subscribers,
    emit(type: EventType, payload: unknown) {
      emitCalls.push({ type, payload });
      // Also call subscribers to simulate real behavior
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
  };
}

describe('TypedEventBus', () => {
  let mockEmitter: ReturnType<typeof createMockEventEmitter>;
  let eventBus: TypedEventBus;

  beforeEach(() => {
    mockEmitter = createMockEventEmitter();
    eventBus = new TypedEventBus(mockEmitter);
  });

  describe('constructor', () => {
    it('should wrap an EventEmitter', () => {
      expect(eventBus).toBeInstanceOf(TypedEventBus);
    });

    it('should store the underlying emitter', () => {
      expect(eventBus.getUnderlyingEmitter()).toBe(mockEmitter);
    });
  });

  describe('emit', () => {
    it('should pass events directly to the underlying emitter', () => {
      const payload = { test: 'data' };
      eventBus.emit('feature:created', payload);

      expect(mockEmitter.emitCalls).toHaveLength(1);
      expect(mockEmitter.emitCalls[0]).toEqual({
        type: 'feature:created',
        payload: { test: 'data' },
      });
    });

    it('should handle various event types', () => {
      eventBus.emit('feature:updated', { id: '1' });
      eventBus.emit('agent:streaming', { chunk: 'data' });
      eventBus.emit('error', { message: 'error' });

      expect(mockEmitter.emitCalls).toHaveLength(3);
      expect(mockEmitter.emitCalls[0].type).toBe('feature:updated');
      expect(mockEmitter.emitCalls[1].type).toBe('agent:streaming');
      expect(mockEmitter.emitCalls[2].type).toBe('error');
    });
  });

  describe('emitAutoModeEvent', () => {
    it('should wrap events in auto-mode:event format', () => {
      eventBus.emitAutoModeEvent('auto_mode_started', { projectPath: '/test' });

      expect(mockEmitter.emitCalls).toHaveLength(1);
      expect(mockEmitter.emitCalls[0].type).toBe('auto-mode:event');
    });

    it('should include event type in payload', () => {
      eventBus.emitAutoModeEvent('auto_mode_started', { projectPath: '/test' });

      const payload = mockEmitter.emitCalls[0].payload as Record<string, unknown>;
      expect(payload.type).toBe('auto_mode_started');
    });

    it('should spread additional data into payload', () => {
      eventBus.emitAutoModeEvent('auto_mode_feature_start', {
        featureId: 'feat-1',
        featureName: 'Test Feature',
        projectPath: '/project',
      });

      const payload = mockEmitter.emitCalls[0].payload as Record<string, unknown>;
      expect(payload).toEqual({
        type: 'auto_mode_feature_start',
        featureId: 'feat-1',
        featureName: 'Test Feature',
        projectPath: '/project',
      });
    });

    it('should handle empty data object', () => {
      eventBus.emitAutoModeEvent('auto_mode_idle', {});

      const payload = mockEmitter.emitCalls[0].payload as Record<string, unknown>;
      expect(payload).toEqual({ type: 'auto_mode_idle' });
    });

    it('should preserve exact event format for frontend compatibility', () => {
      // This test verifies the exact format that the frontend expects
      eventBus.emitAutoModeEvent('auto_mode_progress', {
        featureId: 'feat-123',
        progress: 50,
        message: 'Processing...',
      });

      expect(mockEmitter.emitCalls[0]).toEqual({
        type: 'auto-mode:event',
        payload: {
          type: 'auto_mode_progress',
          featureId: 'feat-123',
          progress: 50,
          message: 'Processing...',
        },
      });
    });

    it('should handle all standard auto-mode event types', () => {
      const eventTypes = [
        'auto_mode_started',
        'auto_mode_stopped',
        'auto_mode_idle',
        'auto_mode_error',
        'auto_mode_paused_failures',
        'auto_mode_feature_start',
        'auto_mode_feature_complete',
        'auto_mode_feature_resuming',
        'auto_mode_progress',
        'auto_mode_tool',
        'auto_mode_task_started',
        'auto_mode_task_complete',
        'planning_started',
        'plan_approval_required',
        'plan_approved',
        'plan_rejected',
      ] as const;

      for (const eventType of eventTypes) {
        eventBus.emitAutoModeEvent(eventType, { test: true });
      }

      expect(mockEmitter.emitCalls).toHaveLength(eventTypes.length);
      mockEmitter.emitCalls.forEach((call, index) => {
        expect(call.type).toBe('auto-mode:event');
        const payload = call.payload as Record<string, unknown>;
        expect(payload.type).toBe(eventTypes[index]);
      });
    });

    it('should allow custom event types (string extensibility)', () => {
      eventBus.emitAutoModeEvent('custom_event_type', { custom: 'data' });

      const payload = mockEmitter.emitCalls[0].payload as Record<string, unknown>;
      expect(payload.type).toBe('custom_event_type');
    });
  });

  describe('subscribe', () => {
    it('should pass subscriptions to the underlying emitter', () => {
      const callback = vi.fn();
      eventBus.subscribe(callback);

      expect(mockEmitter.subscribers.has(callback)).toBe(true);
    });

    it('should return an unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = eventBus.subscribe(callback);

      expect(mockEmitter.subscribers.has(callback)).toBe(true);

      unsubscribe();

      expect(mockEmitter.subscribers.has(callback)).toBe(false);
    });

    it('should receive events when subscribed', () => {
      const callback = vi.fn();
      eventBus.subscribe(callback);

      eventBus.emit('feature:created', { id: '1' });

      expect(callback).toHaveBeenCalledWith('feature:created', { id: '1' });
    });

    it('should receive auto-mode events when subscribed', () => {
      const callback = vi.fn();
      eventBus.subscribe(callback);

      eventBus.emitAutoModeEvent('auto_mode_started', { projectPath: '/test' });

      expect(callback).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_started',
        projectPath: '/test',
      });
    });

    it('should not receive events after unsubscribe', () => {
      const callback = vi.fn();
      const unsubscribe = eventBus.subscribe(callback);

      eventBus.emit('event1', {});
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      eventBus.emit('event2', {});
      expect(callback).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });

  describe('getUnderlyingEmitter', () => {
    it('should return the wrapped EventEmitter', () => {
      const emitter = eventBus.getUnderlyingEmitter();
      expect(emitter).toBe(mockEmitter);
    });

    it('should allow direct access for special cases', () => {
      const emitter = eventBus.getUnderlyingEmitter();

      // Verify we can use it directly
      emitter.emit('direct:event', { direct: true });

      expect(mockEmitter.emitCalls).toHaveLength(1);
      expect(mockEmitter.emitCalls[0].type).toBe('direct:event');
    });
  });

  describe('integration with real EventEmitter pattern', () => {
    it('should produce the exact payload format used by AutoModeService', () => {
      // This test documents the exact format that was in AutoModeService.emitAutoModeEvent
      // before extraction, ensuring backward compatibility

      const receivedEvents: Array<{ type: EventType; payload: unknown }> = [];

      eventBus.subscribe((type, payload) => {
        receivedEvents.push({ type, payload });
      });

      // Simulate the exact call pattern from AutoModeService
      eventBus.emitAutoModeEvent('auto_mode_feature_start', {
        featureId: 'abc-123',
        featureName: 'Add user authentication',
        projectPath: '/home/user/project',
      });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual({
        type: 'auto-mode:event',
        payload: {
          type: 'auto_mode_feature_start',
          featureId: 'abc-123',
          featureName: 'Add user authentication',
          projectPath: '/home/user/project',
        },
      });
    });

    it('should handle complex nested data in events', () => {
      eventBus.emitAutoModeEvent('auto_mode_tool', {
        featureId: 'feat-1',
        tool: {
          name: 'write_file',
          input: {
            path: '/src/index.ts',
            content: 'const x = 1;',
          },
        },
        timestamp: 1234567890,
      });

      const payload = mockEmitter.emitCalls[0].payload as Record<string, unknown>;
      expect(payload.type).toBe('auto_mode_tool');
      expect(payload.tool).toEqual({
        name: 'write_file',
        input: {
          path: '/src/index.ts',
          content: 'const x = 1;',
        },
      });
    });
  });
});
