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
    it("should parse comma-separated directories from environment", async () => {
      process.env.ALLOWED_PROJECT_DIRS = "/path1,/path2,/path3";
      process.env.DATA_DIR = "";

      const { initAllowedPaths, getAllowedPaths } = await import(
        "@/lib/security.js"
      );
      initAllowedPaths();

      const allowed = getAllowedPaths();
      expect(allowed).toContain(path.resolve("/path1"));
      expect(allowed).toContain(path.resolve("/path2"));
      expect(allowed).toContain(path.resolve("/path3"));
    });

    it("should trim whitespace from paths", async () => {
      process.env.ALLOWED_PROJECT_DIRS = " /path1 , /path2 , /path3 ";
      process.env.DATA_DIR = "";

      const { initAllowedPaths, getAllowedPaths } = await import(
        "@/lib/security.js"
      );
      initAllowedPaths();

      const allowed = getAllowedPaths();
      expect(allowed).toContain(path.resolve("/path1"));
      expect(allowed).toContain(path.resolve("/path2"));
    });

    it("should always include DATA_DIR if set", async () => {
      process.env.ALLOWED_PROJECT_DIRS = "";
      process.env.DATA_DIR = "/data/dir";

      const { initAllowedPaths, getAllowedPaths } = await import(
        "@/lib/security.js"
      );
      initAllowedPaths();

      const allowed = getAllowedPaths();
      expect(allowed).toContain(path.resolve("/data/dir"));
    });

    it("should include WORKSPACE_DIR if set", async () => {
      process.env.ALLOWED_PROJECT_DIRS = "";
      process.env.DATA_DIR = "";
      process.env.WORKSPACE_DIR = "/workspace/dir";

      const { initAllowedPaths, getAllowedPaths } = await import(
        "@/lib/security.js"
      );
      initAllowedPaths();

      const allowed = getAllowedPaths();
      expect(allowed).toContain(path.resolve("/workspace/dir"));
    });

    it("should handle empty ALLOWED_PROJECT_DIRS", async () => {
      process.env.ALLOWED_PROJECT_DIRS = "";
      process.env.DATA_DIR = "/data";
      delete process.env.WORKSPACE_DIR;

      const { initAllowedPaths, getAllowedPaths } = await import(
        "@/lib/security.js"
      );
      initAllowedPaths();

      const allowed = getAllowedPaths();
      expect(allowed).toHaveLength(1);
      expect(allowed[0]).toBe(path.resolve("/data"));
    });

    it("should skip empty entries in comma list", async () => {
      process.env.ALLOWED_PROJECT_DIRS = "/path1,,/path2,  ,/path3";
      process.env.DATA_DIR = "";
      delete process.env.WORKSPACE_DIR;

      const { initAllowedPaths, getAllowedPaths } = await import(
        "@/lib/security.js"
      );
      initAllowedPaths();

      const allowed = getAllowedPaths();
      expect(allowed).toHaveLength(3);
    });
  });

  describe("addAllowedPath", () => {
    it("should add path to allowed list", async () => {
      process.env.ALLOWED_PROJECT_DIRS = "";
      process.env.DATA_DIR = "";

      const { initAllowedPaths, addAllowedPath, getAllowedPaths } =
        await import("@/lib/security.js");
      initAllowedPaths();

      addAllowedPath("/new/path");

      const allowed = getAllowedPaths();
      expect(allowed).toContain(path.resolve("/new/path"));
    });

    it("should resolve relative paths before adding", async () => {
      process.env.ALLOWED_PROJECT_DIRS = "";
      process.env.DATA_DIR = "";

      const { initAllowedPaths, addAllowedPath, getAllowedPaths } =
        await import("@/lib/security.js");
      initAllowedPaths();

      addAllowedPath("./relative/path");

      const allowed = getAllowedPaths();
      const cwd = process.cwd();
      expect(allowed).toContain(path.resolve(cwd, "./relative/path"));
    });
  });

  describe("isPathAllowed", () => {
    it("should allow paths within configured allowed directories", async () => {
      process.env.ALLOWED_PROJECT_DIRS = "/allowed/project";
      process.env.DATA_DIR = "";
      delete process.env.ALLOWED_ROOT_DIRECTORY;

      const { initAllowedPaths, isPathAllowed } = await import(
        "@/lib/security.js"
      );
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
      delete process.env.ALLOWED_PROJECT_DIRS;
      delete process.env.DATA_DIR;
      delete process.env.WORKSPACE_DIR;
      delete process.env.ALLOWED_ROOT_DIRECTORY;

      const { initAllowedPaths, isPathAllowed } = await import(
        "@/lib/security.js"
      );
      initAllowedPaths();

      // All paths should be allowed when no restrictions are configured
      expect(isPathAllowed("/allowed/project/file.txt")).toBe(true);
      expect(isPathAllowed("/not/allowed/file.txt")).toBe(true);
      expect(isPathAllowed("/tmp/file.txt")).toBe(true);
      expect(isPathAllowed("/etc/passwd")).toBe(true);
      expect(isPathAllowed("/any/path")).toBe(true);
    });
  });

  describe("validatePath", () => {
    it("should return resolved path for allowed paths", async () => {
      process.env.ALLOWED_PROJECT_DIRS = "/allowed";
      process.env.DATA_DIR = "";
      delete process.env.ALLOWED_ROOT_DIRECTORY;

      const { initAllowedPaths, validatePath } = await import(
        "@/lib/security.js"
      );
      initAllowedPaths();

      const result = validatePath("/allowed/file.txt");
      expect(result).toBe(path.resolve("/allowed/file.txt"));
    });

    it("should throw error for paths outside allowed directories", async () => {
      process.env.ALLOWED_PROJECT_DIRS = "/allowed";
      process.env.DATA_DIR = "";
      delete process.env.ALLOWED_ROOT_DIRECTORY;

      const { initAllowedPaths, validatePath } = await import(
        "@/lib/security.js"
      );
      initAllowedPaths();

      // Disallowed paths should throw PathNotAllowedError
      expect(() => validatePath("/disallowed/file.txt")).toThrow();
    });

    it("should not throw error for any path when no restrictions are configured", async () => {
      delete process.env.ALLOWED_PROJECT_DIRS;
      delete process.env.DATA_DIR;
      delete process.env.WORKSPACE_DIR;
      delete process.env.ALLOWED_ROOT_DIRECTORY;

      const { initAllowedPaths, validatePath } = await import(
        "@/lib/security.js"
      );
      initAllowedPaths();

      // All paths are allowed when no restrictions configured
      expect(() => validatePath("/disallowed/file.txt")).not.toThrow();
      expect(validatePath("/disallowed/file.txt")).toBe(
        path.resolve("/disallowed/file.txt")
      );
    });

    it("should resolve relative paths within allowed directory", async () => {
      const cwd = process.cwd();
      process.env.ALLOWED_PROJECT_DIRS = cwd;
      process.env.DATA_DIR = "";
      delete process.env.ALLOWED_ROOT_DIRECTORY;

      const { initAllowedPaths, validatePath } = await import(
        "@/lib/security.js"
      );
      initAllowedPaths();

      const result = validatePath("./file.txt");
      expect(result).toBe(path.resolve(cwd, "./file.txt"));
    });
  });

  describe("getAllowedPaths", () => {
    it("should return array of allowed paths", async () => {
      process.env.ALLOWED_PROJECT_DIRS = "/path1,/path2";
      process.env.DATA_DIR = "/data";

      const { initAllowedPaths, getAllowedPaths } = await import(
        "@/lib/security.js"
      );
      initAllowedPaths();

      const result = getAllowedPaths();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should return resolved paths", async () => {
      process.env.ALLOWED_PROJECT_DIRS = "/test";
      process.env.DATA_DIR = "";

      const { initAllowedPaths, getAllowedPaths } = await import(
        "@/lib/security.js"
      );
      initAllowedPaths();

      const result = getAllowedPaths();
      expect(result[0]).toBe(path.resolve("/test"));
    });
  });
});
