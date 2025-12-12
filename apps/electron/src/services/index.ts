/**
 * Services Module - Main Entry Point
 *
 * This module provides a platform-agnostic service layer that abstracts
 * the underlying implementation (Electron IPC, REST API, or mock).
 *
 * Usage:
 *   import { services, eventBus } from '@/services';
 *
 *   // Call service methods
 *   const result = await services.agent.send(sessionId, message);
 *
 *   // Subscribe to events
 *   const { unsubscribe } = services.autoMode.onEvent(handler);
 */

import { serviceRegistry, type ServiceMap, type ServiceName } from "./core/ServiceRegistry";
import { eventBus, EventBus } from "./core/EventBus";

// Re-export bootstrap functions
export { bootstrapServices, isBootstrapped, disposeServices } from "./bootstrap";

// Re-export core classes
export { EventBus, eventBus } from "./core/EventBus";
export { serviceRegistry, type ServiceMap, type ServiceName } from "./core/ServiceRegistry";

// Re-export types
export * from "./types";
export * from "./types/events";

// Re-export interfaces
export * from "./interfaces";

/**
 * Get a service by name
 * @throws Error if service is not registered
 */
export function getService<K extends ServiceName>(name: K): ServiceMap[K] {
  return serviceRegistry.get(name);
}

/**
 * Convenience accessor for all services
 * Use this for most service access: `services.agent.send(...)`
 */
export const services = {
  get fileSystem() {
    return serviceRegistry.get("fileSystem");
  },
  get agent() {
    return serviceRegistry.get("agent");
  },
  get sessions() {
    return serviceRegistry.get("sessions");
  },
  get autoMode() {
    return serviceRegistry.get("autoMode");
  },
  get worktree() {
    return serviceRegistry.get("worktree");
  },
  get git() {
    return serviceRegistry.get("git");
  },
  get suggestions() {
    return serviceRegistry.get("suggestions");
  },
  get specRegeneration() {
    return serviceRegistry.get("specRegeneration");
  },
  get setup() {
    return serviceRegistry.get("setup");
  },
  get features() {
    return serviceRegistry.get("features");
  },
  get runningAgents() {
    return serviceRegistry.get("runningAgents");
  },
  get dialog() {
    return serviceRegistry.get("dialog");
  },
  get app() {
    return serviceRegistry.get("app");
  },
  get model() {
    return serviceRegistry.get("model");
  },
};

// Type for the services object
export type Services = typeof services;
