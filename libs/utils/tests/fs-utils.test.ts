import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { mkdirSafe, existsSafe } from "../src/fs-utils";

describe("fs-utils.ts", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-utils-test-"));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("mkdirSafe", () => {
    it("should create a new directory", async () => {
      const newDir = path.join(tempDir, "new-directory");

      await mkdirSafe(newDir);

      const stats = await fs.stat(newDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should create nested directories recursively", async () => {
      const nestedDir = path.join(tempDir, "level1", "level2", "level3");

      await mkdirSafe(nestedDir);

      const stats = await fs.stat(nestedDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should succeed when directory already exists", async () => {
      const existingDir = path.join(tempDir, "existing");
      await fs.mkdir(existingDir);

      await expect(mkdirSafe(existingDir)).resolves.not.toThrow();
    });

    it("should succeed when path is a symlink to a directory", async () => {
      const targetDir = path.join(tempDir, "target");
      const symlinkPath = path.join(tempDir, "symlink");

      await fs.mkdir(targetDir);
      await fs.symlink(targetDir, symlinkPath, "dir");

      await expect(mkdirSafe(symlinkPath)).resolves.not.toThrow();
    });

    it("should throw when path exists as a file", async () => {
      const filePath = path.join(tempDir, "existing-file.txt");
      await fs.writeFile(filePath, "content");

      await expect(mkdirSafe(filePath)).rejects.toThrow(
        "Path exists and is not a directory"
      );
    });

    it("should resolve relative paths", async () => {
      const originalCwd = process.cwd();
      try {
        process.chdir(tempDir);

        await mkdirSafe("relative-dir");

        const stats = await fs.stat(path.join(tempDir, "relative-dir"));
        expect(stats.isDirectory()).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("should handle concurrent creation gracefully", async () => {
      const newDir = path.join(tempDir, "concurrent");

      const promises = [
        mkdirSafe(newDir),
        mkdirSafe(newDir),
        mkdirSafe(newDir),
      ];

      await expect(Promise.all(promises)).resolves.not.toThrow();

      const stats = await fs.stat(newDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should handle paths with special characters", async () => {
      const specialDir = path.join(tempDir, "dir with spaces & special-chars");

      await mkdirSafe(specialDir);

      const stats = await fs.stat(specialDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe("existsSafe", () => {
    it("should return true for existing directory", async () => {
      const existingDir = path.join(tempDir, "exists");
      await fs.mkdir(existingDir);

      const result = await existsSafe(existingDir);

      expect(result).toBe(true);
    });

    it("should return true for existing file", async () => {
      const filePath = path.join(tempDir, "file.txt");
      await fs.writeFile(filePath, "content");

      const result = await existsSafe(filePath);

      expect(result).toBe(true);
    });

    it("should return false for non-existent path", async () => {
      const nonExistent = path.join(tempDir, "does-not-exist");

      const result = await existsSafe(nonExistent);

      expect(result).toBe(false);
    });

    it("should return true for symlink", async () => {
      const target = path.join(tempDir, "target.txt");
      const symlink = path.join(tempDir, "link.txt");

      await fs.writeFile(target, "content");
      await fs.symlink(target, symlink);

      const result = await existsSafe(symlink);

      expect(result).toBe(true);
    });

    it("should return true for broken symlink", async () => {
      const symlink = path.join(tempDir, "broken-link");

      // Create symlink to non-existent target
      await fs.symlink("/non/existent/path", symlink);

      const result = await existsSafe(symlink);

      // lstat succeeds on broken symlinks
      expect(result).toBe(true);
    });

    it("should handle relative paths", async () => {
      const originalCwd = process.cwd();
      try {
        process.chdir(tempDir);

        await fs.writeFile("test.txt", "content");

        const result = await existsSafe("test.txt");

        expect(result).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("should handle paths with special characters", async () => {
      const specialFile = path.join(tempDir, "file with spaces & chars.txt");
      await fs.writeFile(specialFile, "content");

      const result = await existsSafe(specialFile);

      expect(result).toBe(true);
    });

    it("should return false for parent of non-existent nested path", async () => {
      const nonExistent = path.join(tempDir, "does", "not", "exist");

      const result = await existsSafe(nonExistent);

      expect(result).toBe(false);
    });
  });

  describe("Error handling", () => {
    it("should handle permission errors in mkdirSafe", async () => {
      // Skip on Windows where permissions work differently
      if (process.platform === "win32") {
        return;
      }

      const restrictedDir = path.join(tempDir, "restricted");
      await fs.mkdir(restrictedDir);

      // Make directory read-only
      await fs.chmod(restrictedDir, 0o444);

      const newDir = path.join(restrictedDir, "new");

      try {
        await expect(mkdirSafe(newDir)).rejects.toThrow();
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(restrictedDir, 0o755);
      }
    });

    it("should propagate unexpected errors in existsSafe", async () => {
      const mockError = new Error("Unexpected error");
      (mockError as any).code = "EACCES";

      const spy = vi.spyOn(fs, "lstat").mockRejectedValueOnce(mockError);

      await expect(existsSafe("/some/path")).rejects.toThrow(
        "Unexpected error"
      );

      spy.mockRestore();
    });
  });

  describe("Integration scenarios", () => {
    it("should work together: check existence then create if missing", async () => {
      const dirPath = path.join(tempDir, "check-then-create");

      const existsBefore = await existsSafe(dirPath);
      expect(existsBefore).toBe(false);

      await mkdirSafe(dirPath);

      const existsAfter = await existsSafe(dirPath);
      expect(existsAfter).toBe(true);
    });

    it("should handle nested directory creation with existence checks", async () => {
      const level1 = path.join(tempDir, "level1");
      const level2 = path.join(level1, "level2");
      const level3 = path.join(level2, "level3");

      await mkdirSafe(level3);

      expect(await existsSafe(level1)).toBe(true);
      expect(await existsSafe(level2)).toBe(true);
      expect(await existsSafe(level3)).toBe(true);
    });
  });
});
