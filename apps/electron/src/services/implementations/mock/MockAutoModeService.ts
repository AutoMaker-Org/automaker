/**
 * Mock implementation of IAutoModeService
 * For web development and testing without Electron
 */

import type {
  IAutoModeService,
  AutoModeStatus,
  AutoModeStopResult,
  AutoModeRunResult,
  AutoModeContextResult,
  AutoModeAnalyzeResult,
} from "../../interfaces/IAutoModeService";
import type { ServiceResult, Subscription } from "../../types";
import type { AutoModeEvent } from "../../types/events";
import { eventBus } from "../../core/EventBus";
import { mockFileSystem } from "./MockFileSystemService";

// Mock state
let mockAutoModeRunning = false;
let mockRunningFeatures = new Set<string>();
let mockAutoModeTimeouts = new Map<string, NodeJS.Timeout>();

function emitAutoModeEvent(event: AutoModeEvent) {
  eventBus.emit("auto-mode:event", event);
}

function delay(ms: number, featureId: string): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    mockAutoModeTimeouts.set(featureId, timeout);
  });
}

async function simulateAutoModeLoop(projectPath: string, featureId: string) {
  const mockFeature = {
    id: featureId,
    category: "Core",
    description: "Sample Feature",
    steps: ["Step 1", "Step 2"],
    passes: false,
  };

  emitAutoModeEvent({
    type: "auto_mode_feature_start",
    featureId,
    feature: mockFeature,
  });

  await delay(300, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  // Phase 1: PLANNING
  emitAutoModeEvent({
    type: "auto_mode_phase",
    featureId,
    phase: "planning",
    message: `Planning implementation for: ${mockFeature.description}`,
  });

  emitAutoModeEvent({
    type: "auto_mode_progress",
    featureId,
    content: "Analyzing codebase structure and creating implementation plan...",
  });

  await delay(500, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  // Phase 2: ACTION
  emitAutoModeEvent({
    type: "auto_mode_phase",
    featureId,
    phase: "action",
    message: `Executing implementation for: ${mockFeature.description}`,
  });

  emitAutoModeEvent({
    type: "auto_mode_tool",
    featureId,
    tool: "Read",
    input: { file: "package.json" },
  });

  await delay(300, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  emitAutoModeEvent({
    type: "auto_mode_tool",
    featureId,
    tool: "Write",
    input: { file: "src/feature.ts", content: "// Feature code" },
  });

  await delay(500, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  // Phase 3: VERIFICATION
  emitAutoModeEvent({
    type: "auto_mode_phase",
    featureId,
    phase: "verification",
    message: `Verifying implementation for: ${mockFeature.description}`,
  });

  emitAutoModeEvent({
    type: "auto_mode_progress",
    featureId,
    content: "✓ Verification successful: All tests passed",
  });

  // Feature complete
  emitAutoModeEvent({
    type: "auto_mode_feature_complete",
    featureId,
    passes: true,
    message: "Feature implemented successfully",
  });

  // Delete context file when feature is verified
  const contextFilePath = `${projectPath}/.automaker/features/${featureId}/agent-output.md`;
  delete mockFileSystem[contextFilePath];

  mockRunningFeatures.delete(featureId);
  mockAutoModeTimeouts.delete(featureId);
}

export class MockAutoModeService implements IAutoModeService {
  async start(projectPath: string, maxConcurrency?: number): Promise<ServiceResult> {
    if (mockAutoModeRunning) {
      return { success: false, error: "Auto mode is already running" };
    }

    mockAutoModeRunning = true;
    console.log(`[Mock] Auto mode started with maxConcurrency: ${maxConcurrency || 3}`);

    const featureId = "auto-mode-0";
    mockRunningFeatures.add(featureId);
    simulateAutoModeLoop(projectPath, featureId);

    return { success: true };
  }

  async stop(_projectPath: string): Promise<ServiceResult<AutoModeStopResult>> {
    mockAutoModeRunning = false;
    const runningCount = mockRunningFeatures.size;
    mockRunningFeatures.clear();
    mockAutoModeTimeouts.forEach((timeout) => clearTimeout(timeout));
    mockAutoModeTimeouts.clear();
    return { success: true, data: { runningFeatures: runningCount } };
  }

  async stopFeature(featureId: string): Promise<ServiceResult> {
    if (!mockRunningFeatures.has(featureId)) {
      return { success: false, error: `Feature ${featureId} is not running` };
    }

    const timeout = mockAutoModeTimeouts.get(featureId);
    if (timeout) {
      clearTimeout(timeout);
      mockAutoModeTimeouts.delete(featureId);
    }

    mockRunningFeatures.delete(featureId);

    emitAutoModeEvent({
      type: "auto_mode_feature_complete",
      featureId,
      passes: false,
      message: "Feature stopped by user",
    });

    return { success: true };
  }

  async status(_projectPath?: string): Promise<ServiceResult<AutoModeStatus>> {
    return {
      success: true,
      data: {
        isRunning: mockAutoModeRunning,
        autoLoopRunning: mockAutoModeRunning,
        currentFeatureId: mockAutoModeRunning ? "feature-0" : null,
        runningFeatures: Array.from(mockRunningFeatures),
        runningCount: mockRunningFeatures.size,
      },
    };
  }

  async runFeature(
    projectPath: string,
    featureId: string,
    _useWorktrees?: boolean
  ): Promise<ServiceResult<AutoModeRunResult>> {
    if (mockRunningFeatures.has(featureId)) {
      return { success: false, error: `Feature ${featureId} is already running` };
    }

    mockRunningFeatures.add(featureId);
    simulateAutoModeLoop(projectPath, featureId);

    return { success: true, data: { passes: true } };
  }

  async verifyFeature(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<AutoModeRunResult>> {
    if (mockRunningFeatures.has(featureId)) {
      return { success: false, error: `Feature ${featureId} is already running` };
    }

    mockRunningFeatures.add(featureId);
    simulateAutoModeLoop(projectPath, featureId);

    return { success: true, data: { passes: true } };
  }

  async resumeFeature(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<AutoModeRunResult>> {
    if (mockRunningFeatures.has(featureId)) {
      return { success: false, error: `Feature ${featureId} is already running` };
    }

    mockRunningFeatures.add(featureId);
    simulateAutoModeLoop(projectPath, featureId);

    return { success: true, data: { passes: true } };
  }

  async contextExists(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<AutoModeContextResult>> {
    const exists =
      mockFileSystem[
        `${projectPath}/.automaker/features/${featureId}/agent-output.md`
      ] !== undefined;
    return { success: true, data: { exists } };
  }

  async analyzeProject(
    projectPath: string
  ): Promise<ServiceResult<AutoModeAnalyzeResult>> {
    const analysisId = `project-analysis-${Date.now()}`;
    mockRunningFeatures.add(analysisId);

    emitAutoModeEvent({
      type: "auto_mode_feature_start",
      featureId: analysisId,
      feature: {
        id: analysisId,
        category: "Project Analysis",
        description: "Analyzing project structure and tech stack",
      },
    });

    await delay(300, analysisId);

    emitAutoModeEvent({
      type: "auto_mode_progress",
      featureId: analysisId,
      content: "Detected tech stack: Next.js, TypeScript, Tailwind CSS\n",
    });

    // Write mock app_spec.txt
    mockFileSystem[`${projectPath}/.automaker/app_spec.txt`] = `<project_specification>
  <project_name>Demo Project</project_name>
  <overview>A demo project analyzed by the Automaker AI agent.</overview>
  <technology_stack>
    <frontend>
      <framework>Next.js</framework>
      <language>TypeScript</language>
      <styling>Tailwind CSS</styling>
    </frontend>
  </technology_stack>
</project_specification>`;

    emitAutoModeEvent({
      type: "auto_mode_feature_complete",
      featureId: analysisId,
      passes: true,
      message: "Project analyzed successfully",
    });

    mockRunningFeatures.delete(analysisId);
    mockAutoModeTimeouts.delete(analysisId);

    return { success: true, data: { message: "Project analyzed successfully" } };
  }

  async followUpFeature(
    projectPath: string,
    featureId: string,
    _prompt: string,
    _imagePaths?: string[]
  ): Promise<ServiceResult> {
    if (mockRunningFeatures.has(featureId)) {
      return { success: false, error: `Feature ${featureId} is already running` };
    }

    mockRunningFeatures.add(featureId);
    simulateAutoModeLoop(projectPath, featureId);

    return { success: true };
  }

  async commitFeature(
    _projectPath: string,
    featureId: string
  ): Promise<ServiceResult> {
    emitAutoModeEvent({
      type: "auto_mode_feature_complete",
      featureId,
      passes: true,
      message: "Changes committed successfully",
    });

    return { success: true };
  }

  onEvent(callback: (event: AutoModeEvent) => void): Subscription {
    const unsubscribe = eventBus.on("auto-mode:event", callback);
    return { unsubscribe };
  }
}
