/**
 * Service Bootstrap
 * Initializes and registers all service implementations based on environment
 */

import { serviceRegistry } from "./core/ServiceRegistry";
import { isElectron } from "@/lib/electron";

// Electron implementations
import {
  ElectronFileSystemService,
  ElectronAgentService,
  ElectronSessionsService,
  ElectronAutoModeService,
  ElectronWorktreeService,
  ElectronGitService,
  ElectronSuggestionsService,
  ElectronSpecRegenerationService,
  ElectronSetupService,
  ElectronFeaturesService,
  ElectronRunningAgentsService,
  ElectronDialogService,
  ElectronAppService,
  ElectronModelService,
} from "./implementations/electron";

// Mock implementations
import {
  MockFileSystemService,
  MockAgentService,
  MockSessionsService,
  MockAutoModeService,
  MockWorktreeService,
  MockGitService,
  MockSuggestionsService,
  MockSpecRegenerationService,
  MockSetupService,
  MockFeaturesService,
  MockRunningAgentsService,
  MockDialogService,
  MockAppService,
  MockModelService,
} from "./implementations/mock";

let bootstrapped = false;

/**
 * Bootstrap all services based on the current environment
 * Call this once at application startup
 */
export async function bootstrapServices(): Promise<void> {
  if (bootstrapped) {
    console.warn("[bootstrapServices] Services already bootstrapped");
    return;
  }

  console.log("[bootstrapServices] Starting service bootstrap...");

  if (isElectron()) {
    console.log("[bootstrapServices] Registering Electron implementations");

    // Register Electron implementations
    serviceRegistry.register("fileSystem", new ElectronFileSystemService());
    serviceRegistry.register("agent", new ElectronAgentService());
    serviceRegistry.register("sessions", new ElectronSessionsService());
    serviceRegistry.register("autoMode", new ElectronAutoModeService());
    serviceRegistry.register("worktree", new ElectronWorktreeService());
    serviceRegistry.register("git", new ElectronGitService());
    serviceRegistry.register("suggestions", new ElectronSuggestionsService());
    serviceRegistry.register("specRegeneration", new ElectronSpecRegenerationService());
    serviceRegistry.register("setup", new ElectronSetupService());
    serviceRegistry.register("features", new ElectronFeaturesService());
    serviceRegistry.register("runningAgents", new ElectronRunningAgentsService());
    serviceRegistry.register("dialog", new ElectronDialogService());
    serviceRegistry.register("app", new ElectronAppService());
    serviceRegistry.register("model", new ElectronModelService());
  } else {
    console.log("[bootstrapServices] Registering Mock implementations (web development)");

    // Register Mock implementations for web development
    serviceRegistry.register("fileSystem", new MockFileSystemService());
    serviceRegistry.register("agent", new MockAgentService());
    serviceRegistry.register("sessions", new MockSessionsService());
    serviceRegistry.register("autoMode", new MockAutoModeService());
    serviceRegistry.register("worktree", new MockWorktreeService());
    serviceRegistry.register("git", new MockGitService());
    serviceRegistry.register("suggestions", new MockSuggestionsService());
    serviceRegistry.register("specRegeneration", new MockSpecRegenerationService());
    serviceRegistry.register("setup", new MockSetupService());
    serviceRegistry.register("features", new MockFeaturesService());
    serviceRegistry.register("runningAgents", new MockRunningAgentsService());
    serviceRegistry.register("dialog", new MockDialogService());
    serviceRegistry.register("app", new MockAppService());
    serviceRegistry.register("model", new MockModelService());
  }

  // Initialize all services
  await serviceRegistry.initialize();

  bootstrapped = true;
  console.log("[bootstrapServices] Service bootstrap complete");
}

/**
 * Check if services have been bootstrapped
 */
export function isBootstrapped(): boolean {
  return bootstrapped;
}

/**
 * Dispose all services and reset bootstrap state
 * Useful for testing or hot module replacement
 */
export function disposeServices(): void {
  serviceRegistry.dispose();
  bootstrapped = false;
  console.log("[disposeServices] All services disposed");
}
