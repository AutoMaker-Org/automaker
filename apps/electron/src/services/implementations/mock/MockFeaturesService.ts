/**
 * Mock implementation of IFeaturesService
 * For web development and testing without Electron
 */

import type { IFeaturesService } from "../../interfaces/IFeaturesService";
import type { Feature } from "@/store/app-store";
import type { ServiceResult } from "../../types";
import { mockFileSystem } from "./MockFileSystemService";

// Default mock features
const defaultMockFeatures: Partial<Feature>[] = [
  {
    category: "Core",
    description: "Sample Feature",
    steps: ["Step 1", "Step 2"],
    passes: false,
  },
];

export class MockFeaturesService implements IFeaturesService {
  async getAll(projectPath: string): Promise<ServiceResult<Feature[]>> {
    console.log("[Mock] Getting all features for:", projectPath);

    // Check if test has set mock features via global variable
    const testFeatures = (window as any).__mockFeatures;
    if (testFeatures !== undefined) {
      return { success: true, data: testFeatures };
    }

    // Try to read from mock file system
    const featuresDir = `${projectPath}/.automaker/features`;
    const features: Feature[] = [];

    const featureKeys = Object.keys(mockFileSystem).filter(
      (key) => key.startsWith(featuresDir) && key.endsWith("/feature.json")
    );

    for (const key of featureKeys) {
      try {
        const content = mockFileSystem[key];
        if (content) {
          const feature = JSON.parse(content);
          features.push(feature);
        }
      } catch (error) {
        console.error("[Mock] Failed to parse feature:", error);
      }
    }

    // Return default mock features if none found
    if (features.length === 0) {
      return { success: true, data: defaultMockFeatures as Feature[] };
    }

    return { success: true, data: features };
  }

  async get(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<Feature>> {
    console.log("[Mock] Getting feature:", { projectPath, featureId });

    const featurePath = `${projectPath}/.automaker/features/${featureId}/feature.json`;
    const content = mockFileSystem[featurePath];

    if (content) {
      return { success: true, data: JSON.parse(content) };
    }

    return { success: false, error: "Feature not found" };
  }

  async create(
    projectPath: string,
    feature: Feature
  ): Promise<ServiceResult<Feature>> {
    console.log("[Mock] Creating feature:", { projectPath, featureId: feature.id });

    const featurePath = `${projectPath}/.automaker/features/${feature.id}/feature.json`;
    mockFileSystem[featurePath] = JSON.stringify(feature, null, 2);

    return { success: true, data: feature };
  }

  async update(
    projectPath: string,
    featureId: string,
    updates: Partial<Feature>
  ): Promise<ServiceResult<Feature>> {
    console.log("[Mock] Updating feature:", { projectPath, featureId, updates });

    const featurePath = `${projectPath}/.automaker/features/${featureId}/feature.json`;
    const existing = mockFileSystem[featurePath];

    if (!existing) {
      return { success: false, error: "Feature not found" };
    }

    const feature = { ...JSON.parse(existing), ...updates };
    mockFileSystem[featurePath] = JSON.stringify(feature, null, 2);

    return { success: true, data: feature };
  }

  async delete(projectPath: string, featureId: string): Promise<ServiceResult> {
    console.log("[Mock] Deleting feature:", { projectPath, featureId });

    const featurePath = `${projectPath}/.automaker/features/${featureId}/feature.json`;
    delete mockFileSystem[featurePath];

    // Also delete agent-output.md if it exists
    const agentOutputPath = `${projectPath}/.automaker/features/${featureId}/agent-output.md`;
    delete mockFileSystem[agentOutputPath];

    return { success: true };
  }

  async getAgentOutput(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<string | null>> {
    console.log("[Mock] Getting agent output:", { projectPath, featureId });

    const agentOutputPath = `${projectPath}/.automaker/features/${featureId}/agent-output.md`;
    const content = mockFileSystem[agentOutputPath];

    return { success: true, data: content || null };
  }
}
