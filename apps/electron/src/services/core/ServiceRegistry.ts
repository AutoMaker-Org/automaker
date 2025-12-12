/**
 * ServiceRegistry - Central registry for service instances
 * Provides dependency injection and lifecycle management
 */

import type { IService } from "../types";

// Import all service interfaces (will be added as we create them)
import type { IFileSystemService } from "../interfaces/IFileSystemService";
import type { IAgentService } from "../interfaces/IAgentService";
import type { ISessionsService } from "../interfaces/ISessionsService";
import type { IAutoModeService } from "../interfaces/IAutoModeService";
import type { IWorktreeService } from "../interfaces/IWorktreeService";
import type { IGitService } from "../interfaces/IGitService";
import type { ISuggestionsService } from "../interfaces/ISuggestionsService";
import type { ISpecRegenerationService } from "../interfaces/ISpecRegenerationService";
import type { ISetupService } from "../interfaces/ISetupService";
import type { IFeaturesService } from "../interfaces/IFeaturesService";
import type { IRunningAgentsService } from "../interfaces/IRunningAgentsService";
import type { IDialogService } from "../interfaces/IDialogService";
import type { IAppService } from "../interfaces/IAppService";
import type { IModelService } from "../interfaces/IModelService";

/**
 * Map of service names to their interface types
 */
export interface ServiceMap {
  fileSystem: IFileSystemService;
  agent: IAgentService;
  sessions: ISessionsService;
  autoMode: IAutoModeService;
  worktree: IWorktreeService;
  git: IGitService;
  suggestions: ISuggestionsService;
  specRegeneration: ISpecRegenerationService;
  setup: ISetupService;
  features: IFeaturesService;
  runningAgents: IRunningAgentsService;
  dialog: IDialogService;
  app: IAppService;
  model: IModelService;
}

export type ServiceName = keyof ServiceMap;

class ServiceRegistryImpl {
  private services: Partial<ServiceMap> = {};
  private initialized = false;

  /**
   * Register a service implementation
   */
  register<K extends ServiceName>(name: K, service: ServiceMap[K]): void {
    if (this.initialized) {
      console.warn(
        `[ServiceRegistry] Registering service "${name}" after initialization. ` +
          "Service will not be auto-initialized."
      );
    }
    this.services[name] = service;
  }

  /**
   * Get a service by name
   * @throws Error if service is not registered
   */
  get<K extends ServiceName>(name: K): ServiceMap[K] {
    const service = this.services[name];
    if (!service) {
      throw new Error(
        `[ServiceRegistry] Service "${name}" not registered. ` +
          "Make sure to call bootstrapServices() before accessing services."
      );
    }
    return service as ServiceMap[K];
  }

  /**
   * Check if a service is registered
   */
  has(name: ServiceName): boolean {
    return name in this.services;
  }

  /**
   * Initialize all registered services
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn("[ServiceRegistry] Already initialized");
      return;
    }

    console.log("[ServiceRegistry] Initializing services...");

    for (const [name, service] of Object.entries(this.services)) {
      if (service && typeof (service as IService).initialize === "function") {
        try {
          await (service as IService).initialize!();
          console.log(`[ServiceRegistry] Initialized: ${name}`);
        } catch (error) {
          console.error(`[ServiceRegistry] Failed to initialize ${name}:`, error);
          throw error;
        }
      }
    }

    this.initialized = true;
    console.log("[ServiceRegistry] All services initialized");
  }

  /**
   * Dispose all registered services
   */
  dispose(): void {
    console.log("[ServiceRegistry] Disposing services...");

    for (const [name, service] of Object.entries(this.services)) {
      if (service && typeof (service as IService).dispose === "function") {
        try {
          (service as IService).dispose!();
          console.log(`[ServiceRegistry] Disposed: ${name}`);
        } catch (error) {
          console.error(`[ServiceRegistry] Failed to dispose ${name}:`, error);
        }
      }
    }

    this.services = {};
    this.initialized = false;
    console.log("[ServiceRegistry] All services disposed");
  }

  /**
   * Check if the registry has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get all registered service names
   */
  getRegisteredServices(): ServiceName[] {
    return Object.keys(this.services) as ServiceName[];
  }
}

// Singleton instance
export const serviceRegistry = new ServiceRegistryImpl();
