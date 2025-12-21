import { describe, it, expect } from "vitest";
import {
  resolveDependencies,
  areDependenciesSatisfied,
  getBlockingDependencies,
  type DependencyResolutionResult,
} from "@automaker/dependency-resolver";
import type { Feature } from "@automaker/types";

// Helper to create test features
function createFeature(
  id: string,
  options: {
    status?: string;
    priority?: number;
    dependencies?: string[];
    category?: string;
    description?: string;
  } = {}
): Feature {
  return {
    id,
    category: options.category || "test",
    description: options.description || `Feature ${id}`,
    status: options.status || "backlog",
    priority: options.priority,
    dependencies: options.dependencies,
  };
}

describe("dependency-resolver.ts", () => {
  describe("resolveDependencies", () => {
    it("should handle empty feature list", () => {
      const result = resolveDependencies([]);

      expect(result.orderedFeatures).toEqual([]);
      expect(result.circularDependencies).toEqual([]);
      expect(result.missingDependencies.size).toBe(0);
      expect(result.blockedFeatures.size).toBe(0);
    });

    it("should handle features with no dependencies", () => {
      const features = [
        createFeature("f1", { priority: 1 }),
        createFeature("f2", { priority: 2 }),
        createFeature("f3", { priority: 3 }),
      ];

      const result = resolveDependencies(features);

      expect(result.orderedFeatures).toHaveLength(3);
      expect(result.orderedFeatures[0].id).toBe("f1"); // Highest priority first
      expect(result.orderedFeatures[1].id).toBe("f2");
      expect(result.orderedFeatures[2].id).toBe("f3");
      expect(result.circularDependencies).toEqual([]);
      expect(result.missingDependencies.size).toBe(0);
      expect(result.blockedFeatures.size).toBe(0);
    });

    it("should order features by dependencies (simple chain)", () => {
      const features = [
        createFeature("f3", { dependencies: ["f2"] }),
        createFeature("f1"),
        createFeature("f2", { dependencies: ["f1"] }),
      ];

      const result = resolveDependencies(features);

      expect(result.orderedFeatures).toHaveLength(3);
      expect(result.orderedFeatures[0].id).toBe("f1");
      expect(result.orderedFeatures[1].id).toBe("f2");
      expect(result.orderedFeatures[2].id).toBe("f3");
      expect(result.circularDependencies).toEqual([]);
    });

    it("should respect priority within same dependency level", () => {
      const features = [
        createFeature("f1", { priority: 3, dependencies: ["base"] }),
        createFeature("f2", { priority: 1, dependencies: ["base"] }),
        createFeature("f3", { priority: 2, dependencies: ["base"] }),
        createFeature("base"),
      ];

      const result = resolveDependencies(features);

      expect(result.orderedFeatures[0].id).toBe("base");
      expect(result.orderedFeatures[1].id).toBe("f2"); // Priority 1
      expect(result.orderedFeatures[2].id).toBe("f3"); // Priority 2
      expect(result.orderedFeatures[3].id).toBe("f1"); // Priority 3
    });

    it("should use default priority of 2 when not specified", () => {
      const features = [
        createFeature("f1", { priority: 1 }),
        createFeature("f2"), // No priority = default 2
        createFeature("f3", { priority: 3 }),
      ];

      const result = resolveDependencies(features);

      expect(result.orderedFeatures[0].id).toBe("f1");
      expect(result.orderedFeatures[1].id).toBe("f2");
      expect(result.orderedFeatures[2].id).toBe("f3");
    });

    it("should detect missing dependencies", () => {
      const features = [
        createFeature("f1", { dependencies: ["missing1", "missing2"] }),
        createFeature("f2", { dependencies: ["f1", "missing3"] }),
      ];

      const result = resolveDependencies(features);

      expect(result.missingDependencies.size).toBe(2);
      expect(result.missingDependencies.get("f1")).toEqual(["missing1", "missing2"]);
      expect(result.missingDependencies.get("f2")).toEqual(["missing3"]);
      expect(result.orderedFeatures).toHaveLength(2);
    });

    it("should detect blocked features (incomplete dependencies)", () => {
      const features = [
        createFeature("f1", { status: "in_progress" }),
        createFeature("f2", { status: "backlog", dependencies: ["f1"] }),
        createFeature("f3", { status: "completed" }),
        createFeature("f4", { status: "backlog", dependencies: ["f3"] }),
      ];

      const result = resolveDependencies(features);

      expect(result.blockedFeatures.size).toBe(1);
      expect(result.blockedFeatures.get("f2")).toEqual(["f1"]);
      expect(result.blockedFeatures.has("f4")).toBe(false); // f3 is completed
    });

    it("should not block features whose dependencies are verified", () => {
      const features = [
        createFeature("f1", { status: "verified" }),
        createFeature("f2", { status: "backlog", dependencies: ["f1"] }),
      ];

      const result = resolveDependencies(features);

      expect(result.blockedFeatures.size).toBe(0);
    });

    it("should detect circular dependencies (simple cycle)", () => {
      const features = [
        createFeature("f1", { dependencies: ["f2"] }),
        createFeature("f2", { dependencies: ["f1"] }),
      ];

      const result = resolveDependencies(features);

      expect(result.circularDependencies).toHaveLength(1);
      expect(result.circularDependencies[0]).toContain("f1");
      expect(result.circularDependencies[0]).toContain("f2");
      expect(result.orderedFeatures).toHaveLength(2); // Features still included
    });

    it("should detect circular dependencies (multi-node cycle)", () => {
      const features = [
        createFeature("f1", { dependencies: ["f3"] }),
        createFeature("f2", { dependencies: ["f1"] }),
        createFeature("f3", { dependencies: ["f2"] }),
      ];

      const result = resolveDependencies(features);

      expect(result.circularDependencies.length).toBeGreaterThan(0);
      expect(result.orderedFeatures).toHaveLength(3);
    });

    it("should handle mixed valid and circular dependencies", () => {
      const features = [
        createFeature("base"),
        createFeature("f1", { dependencies: ["base", "f2"] }),
        createFeature("f2", { dependencies: ["f1"] }), // Circular with f1
        createFeature("f3", { dependencies: ["base"] }),
      ];

      const result = resolveDependencies(features);

      expect(result.circularDependencies.length).toBeGreaterThan(0);
      expect(result.orderedFeatures[0].id).toBe("base");
      expect(result.orderedFeatures).toHaveLength(4);
    });

    it("should handle complex dependency graph", () => {
      const features = [
        createFeature("ui", { dependencies: ["api", "auth"], priority: 1 }),
        createFeature("api", { dependencies: ["db"], priority: 2 }),
        createFeature("auth", { dependencies: ["db"], priority: 1 }),
        createFeature("db", { priority: 1 }),
        createFeature("tests", { dependencies: ["ui"], priority: 3 }),
      ];

      const result = resolveDependencies(features);

      const order = result.orderedFeatures.map(f => f.id);

      expect(order[0]).toBe("db");
      expect(order.indexOf("db")).toBeLessThan(order.indexOf("api"));
      expect(order.indexOf("db")).toBeLessThan(order.indexOf("auth"));
      expect(order.indexOf("api")).toBeLessThan(order.indexOf("ui"));
      expect(order.indexOf("auth")).toBeLessThan(order.indexOf("ui"));
      expect(order.indexOf("ui")).toBeLessThan(order.indexOf("tests"));
      expect(result.circularDependencies).toEqual([]);
    });

    it("should handle features with empty dependencies array", () => {
      const features = [
        createFeature("f1", { dependencies: [] }),
        createFeature("f2", { dependencies: [] }),
      ];

      const result = resolveDependencies(features);

      expect(result.orderedFeatures).toHaveLength(2);
      expect(result.circularDependencies).toEqual([]);
      expect(result.blockedFeatures.size).toBe(0);
    });

    it("should track multiple blocking dependencies", () => {
      const features = [
        createFeature("f1", { status: "in_progress" }),
        createFeature("f2", { status: "backlog" }),
        createFeature("f3", { status: "backlog", dependencies: ["f1", "f2"] }),
      ];

      const result = resolveDependencies(features);

      expect(result.blockedFeatures.get("f3")).toEqual(["f1", "f2"]);
    });

    it("should handle self-referencing dependency", () => {
      const features = [
        createFeature("f1", { dependencies: ["f1"] }),
      ];

      const result = resolveDependencies(features);

      expect(result.circularDependencies.length).toBeGreaterThan(0);
      expect(result.orderedFeatures).toHaveLength(1);
    });
  });

  describe("areDependenciesSatisfied", () => {
    it("should return true for feature with no dependencies", () => {
      const feature = createFeature("f1");
      const allFeatures = [feature];

      expect(areDependenciesSatisfied(feature, allFeatures)).toBe(true);
    });

    it("should return true for feature with empty dependencies array", () => {
      const feature = createFeature("f1", { dependencies: [] });
      const allFeatures = [feature];

      expect(areDependenciesSatisfied(feature, allFeatures)).toBe(true);
    });

    it("should return true when all dependencies are completed", () => {
      const allFeatures = [
        createFeature("f1", { status: "completed" }),
        createFeature("f2", { status: "completed" }),
        createFeature("f3", { status: "backlog", dependencies: ["f1", "f2"] }),
      ];

      expect(areDependenciesSatisfied(allFeatures[2], allFeatures)).toBe(true);
    });

    it("should return true when all dependencies are verified", () => {
      const allFeatures = [
        createFeature("f1", { status: "verified" }),
        createFeature("f2", { status: "verified" }),
        createFeature("f3", { status: "backlog", dependencies: ["f1", "f2"] }),
      ];

      expect(areDependenciesSatisfied(allFeatures[2], allFeatures)).toBe(true);
    });

    it("should return true when dependencies are mix of completed and verified", () => {
      const allFeatures = [
        createFeature("f1", { status: "completed" }),
        createFeature("f2", { status: "verified" }),
        createFeature("f3", { status: "backlog", dependencies: ["f1", "f2"] }),
      ];

      expect(areDependenciesSatisfied(allFeatures[2], allFeatures)).toBe(true);
    });

    it("should return false when any dependency is in_progress", () => {
      const allFeatures = [
        createFeature("f1", { status: "completed" }),
        createFeature("f2", { status: "in_progress" }),
        createFeature("f3", { status: "backlog", dependencies: ["f1", "f2"] }),
      ];

      expect(areDependenciesSatisfied(allFeatures[2], allFeatures)).toBe(false);
    });

    it("should return false when any dependency is in backlog", () => {
      const allFeatures = [
        createFeature("f1", { status: "completed" }),
        createFeature("f2", { status: "backlog" }),
        createFeature("f3", { status: "backlog", dependencies: ["f1", "f2"] }),
      ];

      expect(areDependenciesSatisfied(allFeatures[2], allFeatures)).toBe(false);
    });

    it("should return false when dependency is missing", () => {
      const allFeatures = [
        createFeature("f1", { status: "backlog", dependencies: ["missing"] }),
      ];

      expect(areDependenciesSatisfied(allFeatures[0], allFeatures)).toBe(false);
    });

    it("should return false when multiple dependencies are incomplete", () => {
      const allFeatures = [
        createFeature("f1", { status: "backlog" }),
        createFeature("f2", { status: "in_progress" }),
        createFeature("f3", { status: "waiting_approval" }),
        createFeature("f4", { status: "backlog", dependencies: ["f1", "f2", "f3"] }),
      ];

      expect(areDependenciesSatisfied(allFeatures[3], allFeatures)).toBe(false);
    });
  });

  describe("getBlockingDependencies", () => {
    it("should return empty array for feature with no dependencies", () => {
      const feature = createFeature("f1");
      const allFeatures = [feature];

      expect(getBlockingDependencies(feature, allFeatures)).toEqual([]);
    });

    it("should return empty array for feature with empty dependencies array", () => {
      const feature = createFeature("f1", { dependencies: [] });
      const allFeatures = [feature];

      expect(getBlockingDependencies(feature, allFeatures)).toEqual([]);
    });

    it("should return empty array when all dependencies are completed", () => {
      const allFeatures = [
        createFeature("f1", { status: "completed" }),
        createFeature("f2", { status: "completed" }),
        createFeature("f3", { status: "backlog", dependencies: ["f1", "f2"] }),
      ];

      expect(getBlockingDependencies(allFeatures[2], allFeatures)).toEqual([]);
    });

    it("should return empty array when all dependencies are verified", () => {
      const allFeatures = [
        createFeature("f1", { status: "verified" }),
        createFeature("f2", { status: "verified" }),
        createFeature("f3", { status: "backlog", dependencies: ["f1", "f2"] }),
      ];

      expect(getBlockingDependencies(allFeatures[2], allFeatures)).toEqual([]);
    });

    it("should return blocking dependencies in backlog status", () => {
      const allFeatures = [
        createFeature("f1", { status: "backlog" }),
        createFeature("f2", { status: "completed" }),
        createFeature("f3", { status: "backlog", dependencies: ["f1", "f2"] }),
      ];

      expect(getBlockingDependencies(allFeatures[2], allFeatures)).toEqual(["f1"]);
    });

    it("should return blocking dependencies in in_progress status", () => {
      const allFeatures = [
        createFeature("f1", { status: "in_progress" }),
        createFeature("f2", { status: "verified" }),
        createFeature("f3", { status: "backlog", dependencies: ["f1", "f2"] }),
      ];

      expect(getBlockingDependencies(allFeatures[2], allFeatures)).toEqual(["f1"]);
    });

    it("should return blocking dependencies in waiting_approval status", () => {
      const allFeatures = [
        createFeature("f1", { status: "waiting_approval" }),
        createFeature("f2", { status: "completed" }),
        createFeature("f3", { status: "backlog", dependencies: ["f1", "f2"] }),
      ];

      expect(getBlockingDependencies(allFeatures[2], allFeatures)).toEqual(["f1"]);
    });

    it("should return all blocking dependencies", () => {
      const allFeatures = [
        createFeature("f1", { status: "backlog" }),
        createFeature("f2", { status: "in_progress" }),
        createFeature("f3", { status: "waiting_approval" }),
        createFeature("f4", { status: "completed" }),
        createFeature("f5", { status: "backlog", dependencies: ["f1", "f2", "f3", "f4"] }),
      ];

      const blocking = getBlockingDependencies(allFeatures[4], allFeatures);
      expect(blocking).toHaveLength(3);
      expect(blocking).toContain("f1");
      expect(blocking).toContain("f2");
      expect(blocking).toContain("f3");
      expect(blocking).not.toContain("f4");
    });

    it("should handle missing dependencies", () => {
      const allFeatures = [
        createFeature("f1", { status: "backlog", dependencies: ["missing"] }),
      ];

      // Missing dependencies won't be in the blocking list since they don't exist
      expect(getBlockingDependencies(allFeatures[0], allFeatures)).toEqual([]);
    });

    it("should handle mix of completed, verified, and incomplete dependencies", () => {
      const allFeatures = [
        createFeature("f1", { status: "completed" }),
        createFeature("f2", { status: "verified" }),
        createFeature("f3", { status: "in_progress" }),
        createFeature("f4", { status: "backlog" }),
        createFeature("f5", { status: "backlog", dependencies: ["f1", "f2", "f3", "f4"] }),
      ];

      const blocking = getBlockingDependencies(allFeatures[4], allFeatures);
      expect(blocking).toHaveLength(2);
      expect(blocking).toContain("f3");
      expect(blocking).toContain("f4");
    });
  });
});
