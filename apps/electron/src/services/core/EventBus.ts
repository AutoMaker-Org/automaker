/**
 * Type-safe EventBus for decoupling event producers from consumers
 * Replaces direct IPC event subscriptions with a platform-agnostic pattern
 */

import type { EventMap, EventName } from "../types/events";

type Listener<T> = (data: T) => void;
type Unsubscribe = () => void;

export class EventBus {
  private listeners: Map<string, Set<Listener<unknown>>> = new Map();

  /**
   * Subscribe to an event
   * @returns Unsubscribe function
   */
  on<K extends EventName>(event: K, listener: Listener<EventMap[K]>): Unsubscribe {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener<unknown>);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(listener as Listener<unknown>);
    };
  }

  /**
   * Subscribe to an event once (auto-unsubscribes after first emission)
   * @returns Unsubscribe function
   */
  once<K extends EventName>(event: K, listener: Listener<EventMap[K]>): Unsubscribe {
    const unsubscribe = this.on(event, (data) => {
      unsubscribe();
      listener(data);
    });
    return unsubscribe;
  }

  /**
   * Emit an event to all listeners
   */
  emit<K extends EventName>(event: K, data: EventMap[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((listener) => {
        try {
          listener(data);
        } catch (error) {
          console.error(`[EventBus] Error in listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for a specific event
   */
  off<K extends EventName>(event: K): void {
    this.listeners.delete(event);
  }

  /**
   * Remove all listeners for all events
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount<K extends EventName>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * Check if an event has any listeners
   */
  hasListeners<K extends EventName>(event: K): boolean {
    return this.listenerCount(event) > 0;
  }
}

// Singleton instance for the application
export const eventBus = new EventBus();
