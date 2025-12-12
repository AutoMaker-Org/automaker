/**
 * Mock implementation of ISpecRegenerationService
 * For web development and testing without Electron
 */

import type {
  ISpecRegenerationService,
  SpecRegenerationStatus,
} from "../../interfaces/ISpecRegenerationService";
import type { ServiceResult, Subscription } from "../../types";
import type { SpecRegenerationEvent } from "../../types/events";
import { eventBus } from "../../core/EventBus";
import { mockFileSystem } from "./MockFileSystemService";

let mockSpecRegenerationRunning = false;
let mockSpecRegenerationPhase = "";
let mockSpecRegenerationTimeout: NodeJS.Timeout | null = null;

function emitSpecRegenerationEvent(event: SpecRegenerationEvent) {
  eventBus.emit("spec-regeneration:event", event);
}

async function simulateSpecCreation(
  projectPath: string,
  projectOverview: string,
  _generateFeatures: boolean
) {
  mockSpecRegenerationPhase = "initialization";
  emitSpecRegenerationEvent({
    type: "spec_regeneration_progress",
    content: "[Phase: initialization] Starting project analysis...\n",
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  mockSpecRegenerationPhase = "analysis";
  emitSpecRegenerationEvent({
    type: "spec_regeneration_progress",
    content: "[Phase: analysis] Detecting tech stack...\n",
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  // Write mock app_spec.txt
  mockFileSystem[`${projectPath}/.automaker/app_spec.txt`] = `<project_specification>
  <project_name>Demo Project</project_name>
  <overview>${projectOverview}</overview>
  <technology_stack>
    <frontend>
      <framework>Next.js</framework>
      <ui_library>React</ui_library>
      <styling>Tailwind CSS</styling>
    </frontend>
  </technology_stack>
</project_specification>`;

  mockSpecRegenerationPhase = "complete";
  emitSpecRegenerationEvent({
    type: "spec_regeneration_complete",
    message: "All tasks completed!",
  });

  mockSpecRegenerationRunning = false;
  mockSpecRegenerationPhase = "";
  mockSpecRegenerationTimeout = null;
}

async function simulateSpecRegeneration(
  projectPath: string,
  projectDefinition: string
) {
  mockSpecRegenerationPhase = "initialization";
  emitSpecRegenerationEvent({
    type: "spec_regeneration_progress",
    content: "[Phase: initialization] Starting spec regeneration...\n",
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  mockSpecRegenerationPhase = "analysis";
  emitSpecRegenerationEvent({
    type: "spec_regeneration_progress",
    content: "[Phase: analysis] Analyzing codebase...\n",
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  // Write regenerated spec
  mockFileSystem[`${projectPath}/.automaker/app_spec.txt`] = `<project_specification>
  <project_name>Regenerated Project</project_name>
  <overview>${projectDefinition}</overview>
  <technology_stack>
    <frontend>
      <framework>Next.js</framework>
      <ui_library>React</ui_library>
      <styling>Tailwind CSS</styling>
    </frontend>
  </technology_stack>
</project_specification>`;

  mockSpecRegenerationPhase = "complete";
  emitSpecRegenerationEvent({
    type: "spec_regeneration_complete",
    message: "All tasks completed!",
  });

  mockSpecRegenerationRunning = false;
  mockSpecRegenerationPhase = "";
  mockSpecRegenerationTimeout = null;
}

async function simulateFeatureGeneration(_projectPath: string) {
  mockSpecRegenerationPhase = "initialization";
  emitSpecRegenerationEvent({
    type: "spec_regeneration_progress",
    content:
      "[Phase: initialization] Starting feature generation from existing app_spec.txt...\n",
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  mockSpecRegenerationPhase = "feature_generation";
  emitSpecRegenerationEvent({
    type: "spec_regeneration_progress",
    content: "[Phase: feature_generation] Creating features from roadmap...\n",
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 1000);
  });
  if (!mockSpecRegenerationRunning) return;

  mockSpecRegenerationPhase = "complete";
  emitSpecRegenerationEvent({
    type: "spec_regeneration_complete",
    message: "All tasks completed!",
  });

  mockSpecRegenerationRunning = false;
  mockSpecRegenerationPhase = "";
  mockSpecRegenerationTimeout = null;
}

export class MockSpecRegenerationService implements ISpecRegenerationService {
  async create(
    projectPath: string,
    projectOverview: string,
    generateFeatures: boolean = true
  ): Promise<ServiceResult> {
    if (mockSpecRegenerationRunning) {
      return { success: false, error: "Spec creation is already running" };
    }

    mockSpecRegenerationRunning = true;
    console.log(`[Mock] Creating initial spec for: ${projectPath}`);

    simulateSpecCreation(projectPath, projectOverview, generateFeatures);

    return { success: true };
  }

  async generate(
    projectPath: string,
    projectDefinition: string
  ): Promise<ServiceResult> {
    if (mockSpecRegenerationRunning) {
      return { success: false, error: "Spec regeneration is already running" };
    }

    mockSpecRegenerationRunning = true;
    console.log(`[Mock] Regenerating spec for: ${projectPath}`);

    simulateSpecRegeneration(projectPath, projectDefinition);

    return { success: true };
  }

  async generateFeatures(projectPath: string): Promise<ServiceResult> {
    if (mockSpecRegenerationRunning) {
      return { success: false, error: "Feature generation is already running" };
    }

    mockSpecRegenerationRunning = true;
    console.log(`[Mock] Generating features for: ${projectPath}`);

    simulateFeatureGeneration(projectPath);

    return { success: true };
  }

  async stop(): Promise<ServiceResult> {
    mockSpecRegenerationRunning = false;
    mockSpecRegenerationPhase = "";
    if (mockSpecRegenerationTimeout) {
      clearTimeout(mockSpecRegenerationTimeout);
      mockSpecRegenerationTimeout = null;
    }
    return { success: true };
  }

  async status(): Promise<ServiceResult<SpecRegenerationStatus>> {
    return {
      success: true,
      data: {
        isRunning: mockSpecRegenerationRunning,
        currentPhase: mockSpecRegenerationPhase,
      },
    };
  }

  onEvent(callback: (event: SpecRegenerationEvent) => void): Subscription {
    const unsubscribe = eventBus.on("spec-regeneration:event", callback);
    return { unsubscribe };
  }
}
