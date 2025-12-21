import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  getAutomakerDir,
  getFeaturesDir,
  getFeatureDir,
  getFeatureImagesDir,
  getBoardDir,
  getImagesDir,
  getContextDir,
  getWorktreesDir,
  getAppSpecPath,
  getBranchTrackingPath,
  ensureAutomakerDir,
  getGlobalSettingsPath,
  getCredentialsPath,
  getProjectSettingsPath,
  ensureDataDir,
} from "../src/paths";

describe("paths.ts", () => {
  let tempDir: string;
  let projectPath: string;
  let dataDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "platform-paths-test-"));
    projectPath = path.join(tempDir, "test-project");
    dataDir = path.join(tempDir, "user-data");
    await fs.mkdir(projectPath, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Project-level path construction", () => {
    it("should return automaker directory path", () => {
      const result = getAutomakerDir(projectPath);
      expect(result).toBe(path.join(projectPath, ".automaker"));
    });

    it("should return features directory path", () => {
      const result = getFeaturesDir(projectPath);
      expect(result).toBe(path.join(projectPath, ".automaker", "features"));
    });

    it("should return feature directory path", () => {
      const featureId = "auth-feature";
      const result = getFeatureDir(projectPath, featureId);
      expect(result).toBe(
        path.join(projectPath, ".automaker", "features", featureId)
      );
    });

    it("should return feature images directory path", () => {
      const featureId = "auth-feature";
      const result = getFeatureImagesDir(projectPath, featureId);
      expect(result).toBe(
        path.join(projectPath, ".automaker", "features", featureId, "images")
      );
    });

    it("should return board directory path", () => {
      const result = getBoardDir(projectPath);
      expect(result).toBe(path.join(projectPath, ".automaker", "board"));
    });

    it("should return images directory path", () => {
      const result = getImagesDir(projectPath);
      expect(result).toBe(path.join(projectPath, ".automaker", "images"));
    });

    it("should return context directory path", () => {
      const result = getContextDir(projectPath);
      expect(result).toBe(path.join(projectPath, ".automaker", "context"));
    });

    it("should return worktrees directory path", () => {
      const result = getWorktreesDir(projectPath);
      expect(result).toBe(path.join(projectPath, ".automaker", "worktrees"));
    });

    it("should return app spec file path", () => {
      const result = getAppSpecPath(projectPath);
      expect(result).toBe(
        path.join(projectPath, ".automaker", "app_spec.txt")
      );
    });

    it("should return branch tracking file path", () => {
      const result = getBranchTrackingPath(projectPath);
      expect(result).toBe(
        path.join(projectPath, ".automaker", "active-branches.json")
      );
    });

    it("should return project settings file path", () => {
      const result = getProjectSettingsPath(projectPath);
      expect(result).toBe(
        path.join(projectPath, ".automaker", "settings.json")
      );
    });
  });

  describe("Global settings path construction", () => {
    it("should return global settings path", () => {
      const result = getGlobalSettingsPath(dataDir);
      expect(result).toBe(path.join(dataDir, "settings.json"));
    });

    it("should return credentials path", () => {
      const result = getCredentialsPath(dataDir);
      expect(result).toBe(path.join(dataDir, "credentials.json"));
    });
  });

  describe("Directory creation", () => {
    it("should create automaker directory", async () => {
      const automakerDir = await ensureAutomakerDir(projectPath);

      expect(automakerDir).toBe(path.join(projectPath, ".automaker"));

      const stats = await fs.stat(automakerDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should be idempotent when creating automaker directory", async () => {
      // Create directory first time
      const firstResult = await ensureAutomakerDir(projectPath);

      // Create directory second time
      const secondResult = await ensureAutomakerDir(projectPath);

      expect(firstResult).toBe(secondResult);

      const stats = await fs.stat(firstResult);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should create data directory", async () => {
      const result = await ensureDataDir(dataDir);

      expect(result).toBe(dataDir);

      const stats = await fs.stat(dataDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should be idempotent when creating data directory", async () => {
      // Create directory first time
      const firstResult = await ensureDataDir(dataDir);

      // Create directory second time
      const secondResult = await ensureDataDir(dataDir);

      expect(firstResult).toBe(secondResult);

      const stats = await fs.stat(firstResult);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should create nested directories recursively", async () => {
      const deepProjectPath = path.join(
        tempDir,
        "nested",
        "deep",
        "project"
      );
      await fs.mkdir(deepProjectPath, { recursive: true });

      const automakerDir = await ensureAutomakerDir(deepProjectPath);

      const stats = await fs.stat(automakerDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe("Path handling with special characters", () => {
    it("should handle feature IDs with special characters", () => {
      const featureId = "feature-with-dashes_and_underscores";
      const result = getFeatureDir(projectPath, featureId);
      expect(result).toContain(featureId);
    });

    it("should handle paths with spaces", () => {
      const pathWithSpaces = path.join(tempDir, "path with spaces");
      const result = getAutomakerDir(pathWithSpaces);
      expect(result).toBe(path.join(pathWithSpaces, ".automaker"));
    });
  });

  describe("Path relationships", () => {
    it("should have feature dir as child of features dir", () => {
      const featuresDir = getFeaturesDir(projectPath);
      const featureDir = getFeatureDir(projectPath, "test-feature");

      expect(featureDir.startsWith(featuresDir)).toBe(true);
    });

    it("should have all project paths under automaker dir", () => {
      const automakerDir = getAutomakerDir(projectPath);
      const paths = [
        getFeaturesDir(projectPath),
        getBoardDir(projectPath),
        getImagesDir(projectPath),
        getContextDir(projectPath),
        getWorktreesDir(projectPath),
        getAppSpecPath(projectPath),
        getBranchTrackingPath(projectPath),
        getProjectSettingsPath(projectPath),
      ];

      paths.forEach((p) => {
        expect(p.startsWith(automakerDir)).toBe(true);
      });
    });
  });
});
