import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "path";

/**
 * Note: security.ts maintains module-level state (allowed paths Set).
 * We need to reset modules and reimport for each test to get fresh state.
 */
describe("security.ts", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("initAllowedPaths", () => {
    it("should load ALLOWED_ROOT_DIRECTORY if set", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/projects";
      delete process.env.DATA_DIR;

      const { initAllowedPaths, getAllowedPaths } =
        await import("@automaker/platform");
      initAllowedPaths();

      const allowed = getAllowedPaths();
      expect(allowed).toContain(path.resolve("/projects"));
    });

    it("should include DATA_DIR if set", async () => {
      delete process.env.ALLOWED_ROOT_DIRECTORY;
      process.env.DATA_DIR = "/data/dir";

      const { initAllowedPaths, getAllowedPaths } =
        await import("@automaker/platform");
      initAllowedPaths();

      const allowed = getAllowedPaths();
      expect(allowed).toContain(path.resolve("/data/dir"));
    });

    it("should include both ALLOWED_ROOT_DIRECTORY and DATA_DIR if both set", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/projects";
      process.env.DATA_DIR = "/data";

      const { initAllowedPaths, getAllowedPaths } =
        await import("@automaker/platform");
      initAllowedPaths();

      const allowed = getAllowedPaths();
      expect(allowed).toContain(path.resolve("/projects"));
      expect(allowed).toContain(path.resolve("/data"));
      expect(allowed).toHaveLength(2);
    });

    it("should return empty array when no paths configured", async () => {
      delete process.env.ALLOWED_ROOT_DIRECTORY;
      delete process.env.DATA_DIR;

      const { initAllowedPaths, getAllowedPaths } =
        await import("@automaker/platform");
      initAllowedPaths();

      const allowed = getAllowedPaths();
      expect(allowed).toHaveLength(0);
    });
  });

  describe("isPathAllowed", () => {
    it("should allow paths within ALLOWED_ROOT_DIRECTORY", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/allowed/project";
      process.env.DATA_DIR = "";

      const { initAllowedPaths, isPathAllowed } =
        await import("@automaker/platform");
      initAllowedPaths();

      // Paths within allowed directory should be allowed
      expect(isPathAllowed("/allowed/project/file.txt")).toBe(true);
      expect(isPathAllowed("/allowed/project/subdir/file.txt")).toBe(true);

      // Paths outside allowed directory should be denied
      expect(isPathAllowed("/not/allowed/file.txt")).toBe(false);
      expect(isPathAllowed("/tmp/file.txt")).toBe(false);
      expect(isPathAllowed("/etc/passwd")).toBe(false);
    });

    it("should allow all paths when no restrictions are configured", async () => {
      delete process.env.DATA_DIR;
      delete process.env.ALLOWED_ROOT_DIRECTORY;

      const { initAllowedPaths, isPathAllowed } =
        await import("@automaker/platform");
      initAllowedPaths();

      // All paths should be allowed when no restrictions are configured
      expect(isPathAllowed("/allowed/project/file.txt")).toBe(true);
      expect(isPathAllowed("/not/allowed/file.txt")).toBe(true);
      expect(isPathAllowed("/tmp/file.txt")).toBe(true);
      expect(isPathAllowed("/etc/passwd")).toBe(true);
      expect(isPathAllowed("/any/path")).toBe(true);
    });

    it("should allow all paths when DATA_DIR is set but ALLOWED_ROOT_DIRECTORY is not", async () => {
      process.env.DATA_DIR = "/data";
      delete process.env.ALLOWED_ROOT_DIRECTORY;

      const { initAllowedPaths, isPathAllowed } =
        await import("@automaker/platform");
      initAllowedPaths();

      // DATA_DIR should be allowed
      expect(isPathAllowed("/data/settings.json")).toBe(true);
      // But all other paths should also be allowed when ALLOWED_ROOT_DIRECTORY is not set
      expect(isPathAllowed("/allowed/project/file.txt")).toBe(true);
      expect(isPathAllowed("/not/allowed/file.txt")).toBe(true);
      expect(isPathAllowed("/tmp/file.txt")).toBe(true);
      expect(isPathAllowed("/etc/passwd")).toBe(true);
      expect(isPathAllowed("/any/path")).toBe(true);
    });
  });

  describe("validatePath", () => {
    it("should return resolved path for allowed paths", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/allowed";
      process.env.DATA_DIR = "";

      const { initAllowedPaths, validatePath } =
        await import("@automaker/platform");
      initAllowedPaths();

      const result = validatePath("/allowed/file.txt");
      expect(result).toBe(path.resolve("/allowed/file.txt"));
    });

    it("should throw error for paths outside allowed directories", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/allowed";
      process.env.DATA_DIR = "";

      const { initAllowedPaths, validatePath } =
        await import("@automaker/platform");
      initAllowedPaths();

      // Disallowed paths should throw PathNotAllowedError
      expect(() => validatePath("/disallowed/file.txt")).toThrow();
    });

    it("should not throw error for any path when no restrictions are configured", async () => {
      delete process.env.DATA_DIR;
      delete process.env.ALLOWED_ROOT_DIRECTORY;

      const { initAllowedPaths, validatePath } =
        await import("@automaker/platform");
      initAllowedPaths();

      // All paths are allowed when no restrictions configured
      expect(() => validatePath("/disallowed/file.txt")).not.toThrow();
      expect(validatePath("/disallowed/file.txt")).toBe(
        path.resolve("/disallowed/file.txt")
      );
    });

    it("should resolve relative paths within allowed directory", async () => {
      const cwd = process.cwd();
      process.env.ALLOWED_ROOT_DIRECTORY = cwd;
      process.env.DATA_DIR = "";

      const { initAllowedPaths, validatePath } =
        await import("@automaker/platform");
      initAllowedPaths();

      const result = validatePath("./file.txt");
      expect(result).toBe(path.resolve(cwd, "./file.txt"));
    });
  });

  describe("getAllowedPaths", () => {
    it("should return array of allowed paths", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/projects";
      process.env.DATA_DIR = "/data";

      const { initAllowedPaths, getAllowedPaths } =
        await import("@automaker/platform");
      initAllowedPaths();

      const result = getAllowedPaths();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result).toContain(path.resolve("/projects"));
      expect(result).toContain(path.resolve("/data"));
    });

    it("should return resolved paths", async () => {
      process.env.ALLOWED_ROOT_DIRECTORY = "/test";
      process.env.DATA_DIR = "";

      const { initAllowedPaths, getAllowedPaths } =
        await import("@automaker/platform");
      initAllowedPaths();

      const result = getAllowedPaths();
      expect(result[0]).toBe(path.resolve("/test"));
    });
  });
});
