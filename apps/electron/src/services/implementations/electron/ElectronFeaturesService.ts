/**
 * Electron implementation of IFeaturesService
 * Wraps window.electronAPI.features methods
 */

import type { IFeaturesService } from "../../interfaces/IFeaturesService";
import type { Feature } from "@/store/app-store";
import type { ServiceResult } from "../../types";

export class ElectronFeaturesService implements IFeaturesService {
  async getAll(projectPath: string): Promise<ServiceResult<Feature[]>> {
    if (!window.electronAPI?.features) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.features.getAll(projectPath);

    if (result.success && result.features) {
      return { success: true, data: result.features };
    }

    return { success: false, error: result.error || "Failed to get features" };
  }

  async get(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<Feature>> {
    if (!window.electronAPI?.features) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.features.get(projectPath, featureId);

    if (result.success && result.feature) {
      return { success: true, data: result.feature };
    }

    return { success: false, error: result.error || "Failed to get feature" };
  }

  async create(
    projectPath: string,
    feature: Feature
  ): Promise<ServiceResult<Feature>> {
    if (!window.electronAPI?.features) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.features.create(projectPath, feature);

    if (result.success && result.feature) {
      return { success: true, data: result.feature };
    }

    return { success: false, error: result.error || "Failed to create feature" };
  }

  async update(
    projectPath: string,
    featureId: string,
    updates: Partial<Feature>
  ): Promise<ServiceResult<Feature>> {
    if (!window.electronAPI?.features) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.features.update(
      projectPath,
      featureId,
      updates
    );

    if (result.success && result.feature) {
      return { success: true, data: result.feature };
    }

    return { success: false, error: result.error || "Failed to update feature" };
  }

  async delete(projectPath: string, featureId: string): Promise<ServiceResult> {
    if (!window.electronAPI?.features) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.features.delete(projectPath, featureId);
    return { success: result.success, error: result.error };
  }

  async getAgentOutput(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<string | null>> {
    if (!window.electronAPI?.features) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.features.getAgentOutput(
      projectPath,
      featureId
    );

    if (result.success) {
      return { success: true, data: result.content ?? null };
    }

    return { success: false, error: result.error || "Failed to get agent output" };
  }
}
