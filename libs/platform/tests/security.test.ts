import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";

describe("security.ts", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Reset modules to get fresh state
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("initAllowedPaths", () => {
    it("should load ALLOWED_ROOT_DIRECTORY if set", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/projects";
      delete process.env.DATA_DIR;

      const { initAllowedPaths, getAllowedPaths } =
        await import("../src/security");
      initAllowedPaths();

      const allowed = getAllowedPaths();
      expect(allowed).toContain(path.resolve("/projects"));
    });

    it("should load DATA_DIR if set", async () => {
      delete process.env.ALLOWED_ROOT_DIRECTORY;
      process.env.DATA_DIR = "/data/directory";

      const { initAllowedPaths, getAllowedPaths } =
        await import("../src/security");
      initAllowedPaths();

      const allowed = getAllowedPaths();
      expect(allowed).toContain(path.resolve("/data/directory"));
    });

    it("should load both ALLOWED_ROOT_DIRECTORY and DATA_DIR if both set", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/projects";
      process.env.DATA_DIR = "/app/data";

      const { initAllowedPaths, getAllowedPaths } =
        await import("../src/security");
      initAllowedPaths();

      const allowed = getAllowedPaths();
      expect(allowed).toContain(path.resolve("/projects"));
      expect(allowed).toContain(path.resolve("/app/data"));
    });

    it("should handle missing environment variables gracefully", async () => {
      delete process.env.ALLOWED_ROOT_DIRECTORY;
      delete process.env.DATA_DIR;

      const { initAllowedPaths } = await import("../src/security");
      expect(() => initAllowedPaths()).not.toThrow();
    });
  });

  describe("isPathAllowed", () => {
    it("should allow paths within ALLOWED_ROOT_DIRECTORY", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/allowed";
      delete process.env.DATA_DIR;

      const { initAllowedPaths, isPathAllowed } =
        await import("../src/security");
      initAllowedPaths();

      expect(isPathAllowed("/allowed/file.txt")).toBe(true);
      expect(isPathAllowed("/allowed/subdir/file.txt")).toBe(true);
    });

    it("should deny paths outside ALLOWED_ROOT_DIRECTORY", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/allowed";
      delete process.env.DATA_DIR;

      const { initAllowedPaths, isPathAllowed } =
        await import("../src/security");
      initAllowedPaths();

      expect(isPathAllowed("/not-allowed/file.txt")).toBe(false);
      expect(isPathAllowed("/etc/passwd")).toBe(false);
    });

    it("should always allow DATA_DIR paths", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/projects";
      process.env.DATA_DIR = "/app/data";

      const { initAllowedPaths, isPathAllowed } =
        await import("../src/security");
      initAllowedPaths();

      // DATA_DIR paths are always allowed
      expect(isPathAllowed("/app/data/settings.json")).toBe(true);
      expect(isPathAllowed("/app/data/credentials.json")).toBe(true);
    });

    it("should allow all paths when no restrictions configured", async () => {
      delete process.env.ALLOWED_ROOT_DIRECTORY;
      delete process.env.DATA_DIR;

      const { initAllowedPaths, isPathAllowed } =
        await import("../src/security");
      initAllowedPaths();

      expect(isPathAllowed("/any/path")).toBe(true);
      expect(isPathAllowed("/etc/passwd")).toBe(true);
    });

    it("should allow all paths when only DATA_DIR is configured", async () => {
      delete process.env.ALLOWED_ROOT_DIRECTORY;
      process.env.DATA_DIR = "/data";

      const { initAllowedPaths, isPathAllowed } =
        await import("../src/security");
      initAllowedPaths();

      // DATA_DIR should be allowed
      expect(isPathAllowed("/data/file.txt")).toBe(true);
      // And all other paths should be allowed since no ALLOWED_ROOT_DIRECTORY restriction
      expect(isPathAllowed("/any/path")).toBe(true);
    });
  });

  describe("validatePath", () => {
    it("should return resolved path for allowed paths", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/allowed";
      delete process.env.DATA_DIR;

      const { initAllowedPaths, validatePath } =
        await import("../src/security");
      initAllowedPaths();

      const result = validatePath("/allowed/file.txt");
      expect(result).toBe(path.resolve("/allowed/file.txt"));
    });

    it("should throw error for paths outside allowed directories", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/allowed";
      delete process.env.DATA_DIR;

      const { initAllowedPaths, validatePath, PathNotAllowedError } =
        await import("../src/security");
      initAllowedPaths();

      expect(() => validatePath("/not-allowed/file.txt")).toThrow(
        PathNotAllowedError
      );
    });

    it("should resolve relative paths", async () => {
      const cwd = process.cwd();
      process.env.ALLOWED_ROOT_DIRECTORY = cwd;
      delete process.env.DATA_DIR;

      const { initAllowedPaths, validatePath } =
        await import("../src/security");
      initAllowedPaths();

      const result = validatePath("./file.txt");
      expect(result).toBe(path.resolve(cwd, "./file.txt"));
    });

    it("should not throw when no restrictions configured", async () => {
      delete process.env.ALLOWED_ROOT_DIRECTORY;
      delete process.env.DATA_DIR;

      const { initAllowedPaths, validatePath } =
        await import("../src/security");
      initAllowedPaths();

      expect(() => validatePath("/any/path")).not.toThrow();
    });
  });

  describe("getAllowedPaths", () => {
    it("should return empty array when no paths configured", async () => {
      delete process.env.ALLOWED_ROOT_DIRECTORY;
      delete process.env.DATA_DIR;

      const { initAllowedPaths, getAllowedPaths } =
        await import("../src/security");
      initAllowedPaths();

      const allowed = getAllowedPaths();
      expect(Array.isArray(allowed)).toBe(true);
      expect(allowed).toHaveLength(0);
    });

    it("should return configured paths", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/projects";
      process.env.DATA_DIR = "/data";

      const { initAllowedPaths, getAllowedPaths } =
        await import("../src/security");
      initAllowedPaths();

      const allowed = getAllowedPaths();
      expect(allowed).toContain(path.resolve("/projects"));
      expect(allowed).toContain(path.resolve("/data"));
    });
  });

  describe("getAllowedRootDirectory", () => {
    it("should return the configured root directory", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/projects";

      const { initAllowedPaths, getAllowedRootDirectory } =
        await import("../src/security");
      initAllowedPaths();

      expect(getAllowedRootDirectory()).toBe(path.resolve("/projects"));
    });

    it("should return null when not configured", async () => {
      delete process.env.ALLOWED_ROOT_DIRECTORY;

      const { initAllowedPaths, getAllowedRootDirectory } =
        await import("../src/security");
      initAllowedPaths();

      expect(getAllowedRootDirectory()).toBeNull();
    });
  });

  describe("getDataDirectory", () => {
    it("should return the configured data directory", async () => {
      process.env.DATA_DIR = "/data";

      const { initAllowedPaths, getDataDirectory } =
        await import("../src/security");
      initAllowedPaths();

      expect(getDataDirectory()).toBe(path.resolve("/data"));
    });

    it("should return null when not configured", async () => {
      delete process.env.DATA_DIR;

      const { initAllowedPaths, getDataDirectory } =
        await import("../src/security");
      initAllowedPaths();

      expect(getDataDirectory()).toBeNull();
    });
  });
});
