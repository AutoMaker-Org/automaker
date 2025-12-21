/**
 * Event emitter for streaming events to WebSocket clients
 */

import type { EventType, EventCallback } from "@automaker/types";

// Re-export event types from shared package
export type { EventType, EventCallback };

export interface EventEmitter {
  emit: (type: EventType, payload: unknown) => void;
  subscribe: (callback: EventCallback) => () => void;
}

export function createEventEmitter(): EventEmitter {
  const subscribers = new Set<EventCallback>();

  return {
    emit(type: EventType, payload: unknown) {
      for (const callback of subscribers) {
        try {
          callback(type, payload);
        } catch (error) {
          console.error("Error in event subscriber:", error);
        }
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
