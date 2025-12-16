import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BackupService } from "@/services/backup-service.js";
import * as fs from "fs/promises";
import path from "path";
import crypto from "crypto";

vi.mock("fs/promises");
vi.mock("crypto");

describe("backup-service.ts", () => {
  let backupService: BackupService;
  const testProjectPath = "/test/project";

  beforeEach(() => {
    vi.clearAllMocks();
    backupService = new BackupService();

    // Mock crypto.randomBytes
    vi.mocked(crypto.randomBytes).mockReturnValue(Buffer.from("testrand"));

    // Mock crypto.createHash
    const mockHashUpdate = vi.fn().mockReturnThis();
    const mockHashDigest = vi.fn().mockReturnValue("testhash123");
    vi.mocked(crypto.createHash).mockReturnValue({
      update: mockHashUpdate,
      digest: mockHashDigest,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getBackupDir", () => {
    it("should return backup directory path", () => {
      const result = backupService.getBackupDir(testProjectPath);
      expect(result).toContain(".automaker-backups");
      expect(result).toContain("test");
      expect(result).toContain("project");
    });
  });

  describe("getAutomakerDir", () => {
    it("should return .automaker directory path", () => {
      const result = backupService.getAutomakerDir(testProjectPath);
      expect(result).toContain(".automaker");
      expect(result).not.toContain("backups");
    });
  });

  describe("generateBackupId", () => {
    it("should generate unique backup ID with timestamp", () => {
      const id1 = backupService.generateBackupId();
      expect(id1).toMatch(/^backup-\d+-[a-f0-9]+$/);
    });

    it("should start with 'backup-'", () => {
      const id = backupService.generateBackupId();
      expect(id).toMatch(/^backup-/);
    });
  });

  describe("loadManifest", () => {
    it("should return default manifest when file doesn't exist", async () => {
      const error: any = new Error("File not found");
      error.code = "ENOENT";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await backupService.loadManifest(testProjectPath);

      expect(result).toEqual({
        version: 1,
        backups: [],
        retentionCount: 10,
        lastCleanup: null,
      });
    });

    it("should load existing manifest from file", async () => {
      const mockManifest = {
        version: 1,
        backups: [
          {
            id: "backup-123",
            timestamp: "2024-01-01T00:00:00.000Z",
            projectPath: testProjectPath,
            trigger: "manual",
            fileCount: 5,
            totalSize: 1000,
            checksum: "abc123",
            valid: true,
          },
        ],
        retentionCount: 10,
        lastCleanup: null,
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockManifest));

      const result = await backupService.loadManifest(testProjectPath);

      expect(result).toEqual(mockManifest);
    });
  });

  describe("saveManifest", () => {
    it("should save manifest to file", async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const manifest = {
        version: 1,
        backups: [],
        retentionCount: 10,
        lastCleanup: null,
      };

      await backupService.saveManifest(testProjectPath, manifest);

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("manifest.json"),
        expect.any(String),
        "utf-8"
      );
    });
  });

  describe("createBackup", () => {
    it("should return error when .automaker doesn't exist", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const result = await backupService.createBackup(testProjectPath, "manual");

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should create backup successfully", async () => {
      // Mock access for .automaker check
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: "categories.json", isDirectory: () => false, isFile: () => true } as any,
        { name: "features", isDirectory: () => true, isFile: () => false } as any,
      ]);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          backups: [],
          retentionCount: 10,
          lastCleanup: null,
        })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as any);

      const result = await backupService.createBackup(testProjectPath, "manual");

      expect(result.success).toBe(true);
      expect(result.backupId).toBeDefined();
      expect(result.backupId).toMatch(/^backup-/);
    });
  });

  describe("restoreBackup", () => {
    it("should return error when backup doesn't exist", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const result = await backupService.restoreBackup(testProjectPath, "backup-123");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should restore backup successfully", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: "categories.json", isDirectory: () => false, isFile: () => true } as any,
      ]);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rm).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          backups: [
            {
              id: "backup-123",
              timestamp: "2024-01-01T00:00:00.000Z",
              projectPath: testProjectPath,
              trigger: "manual",
              fileCount: 1,
              totalSize: 100,
              checksum: "testhash123",
              valid: true,
            },
          ],
          retentionCount: 10,
          lastCleanup: null,
        })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as any);

      const result = await backupService.restoreBackup(testProjectPath, "backup-123");

      expect(result.success).toBe(true);
      expect(result.filesRestored).toBeGreaterThanOrEqual(0);
    });
  });

  describe("listBackups", () => {
    it("should return empty array when no backups exist", async () => {
      const error: any = new Error("File not found");
      error.code = "ENOENT";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await backupService.listBackups(testProjectPath);

      expect(result).toEqual([]);
    });

    it("should return sorted list of backups", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          backups: [
            {
              id: "backup-1",
              timestamp: "2024-01-01T00:00:00.000Z",
              projectPath: testProjectPath,
              trigger: "manual",
              fileCount: 5,
              totalSize: 1000,
              checksum: "abc123",
              valid: true,
            },
            {
              id: "backup-2",
              timestamp: "2024-01-02T00:00:00.000Z",
              projectPath: testProjectPath,
              trigger: "git-pull",
              fileCount: 6,
              totalSize: 1100,
              checksum: "def456",
              valid: true,
            },
          ],
          retentionCount: 10,
          lastCleanup: null,
        })
      );

      const result = await backupService.listBackups(testProjectPath);

      expect(result).toHaveLength(2);
      // Should be sorted newest first
      expect(result[0].id).toBe("backup-2");
      expect(result[1].id).toBe("backup-1");
    });
  });

  describe("getBackup", () => {
    it("should return null when backup doesn't exist", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          backups: [],
          retentionCount: 10,
          lastCleanup: null,
        })
      );

      const result = await backupService.getBackup(testProjectPath, "nonexistent");

      expect(result).toBeNull();
    });

    it("should return backup metadata when found", async () => {
      const backupMetadata = {
        id: "backup-123",
        timestamp: "2024-01-01T00:00:00.000Z",
        projectPath: testProjectPath,
        trigger: "manual",
        fileCount: 5,
        totalSize: 1000,
        checksum: "abc123",
        valid: true,
      };

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          backups: [backupMetadata],
          retentionCount: 10,
          lastCleanup: null,
        })
      );

      const result = await backupService.getBackup(testProjectPath, "backup-123");

      expect(result).toEqual(backupMetadata);
    });
  });

  describe("deleteBackup", () => {
    it("should delete backup and update manifest", async () => {
      vi.mocked(fs.rm).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          backups: [
            {
              id: "backup-123",
              timestamp: "2024-01-01T00:00:00.000Z",
              projectPath: testProjectPath,
              trigger: "manual",
              fileCount: 5,
              totalSize: 1000,
              checksum: "abc123",
              valid: true,
            },
          ],
          retentionCount: 10,
          lastCleanup: null,
        })
      );

      const result = await backupService.deleteBackup(testProjectPath, "backup-123");

      expect(result).toBe(true);
      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringContaining("backup-123"),
        { recursive: true, force: true }
      );
    });

    it("should return false on deletion error", async () => {
      vi.mocked(fs.rm).mockRejectedValue(new Error("Permission denied"));

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await backupService.deleteBackup(testProjectPath, "backup-123");

      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe("validateBackup", () => {
    it("should return false when backup not in manifest", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          backups: [],
          retentionCount: 10,
          lastCleanup: null,
        })
      );

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await backupService.validateBackup(testProjectPath, "nonexistent");

      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });

    it("should return true when checksum matches", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([]);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          backups: [
            {
              id: "backup-123",
              timestamp: "2024-01-01T00:00:00.000Z",
              projectPath: testProjectPath,
              trigger: "manual",
              fileCount: 5,
              totalSize: 1000,
              checksum: "testhash123",
              valid: true,
            },
          ],
          retentionCount: 10,
          lastCleanup: null,
        })
      );

      const result = await backupService.validateBackup(testProjectPath, "backup-123");

      expect(result).toBe(true);
    });
  });

  describe("detectChanges", () => {
    it("should detect missing .automaker directory", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const result = await backupService.detectChanges(testProjectPath);

      expect(result.changed).toBe(true);
      expect(result.missing).toBe(true);
    });

    it("should detect missing required directories", async () => {
      vi.mocked(fs.access)
        .mockResolvedValueOnce(undefined) // .automaker exists
        .mockRejectedValue(new Error("ENOENT")); // sub-directory missing

      const result = await backupService.detectChanges(testProjectPath);

      expect(result.changed).toBe(true);
      expect(result.missing).toBe(false);
      expect(result.details).toContain("missing");
    });

    it("should return no changes when everything is present", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await backupService.detectChanges(testProjectPath);

      expect(result.changed).toBe(false);
      expect(result.missing).toBe(false);
    });
  });

  describe("getStats", () => {
    it("should return empty stats when no backups exist", async () => {
      const error: any = new Error("File not found");
      error.code = "ENOENT";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await backupService.getStats(testProjectPath);

      expect(result.totalBackups).toBe(0);
      expect(result.validBackups).toBe(0);
      expect(result.totalSize).toBe(0);
      expect(result.oldestBackup).toBeNull();
      expect(result.newestBackup).toBeNull();
    });

    it("should return correct stats with backups", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          backups: [
            {
              id: "backup-1",
              timestamp: "2024-01-01T00:00:00.000Z",
              projectPath: testProjectPath,
              trigger: "manual",
              fileCount: 5,
              totalSize: 1000,
              checksum: "abc123",
              valid: true,
            },
            {
              id: "backup-2",
              timestamp: "2024-01-02T00:00:00.000Z",
              projectPath: testProjectPath,
              trigger: "git-pull",
              fileCount: 6,
              totalSize: 1100,
              checksum: "def456",
              valid: false,
            },
          ],
          retentionCount: 10,
          lastCleanup: null,
        })
      );

      const result = await backupService.getStats(testProjectPath);

      expect(result.totalBackups).toBe(2);
      expect(result.validBackups).toBe(1);
      expect(result.totalSize).toBe(2100);
      expect(result.oldestBackup).toBe("2024-01-01T00:00:00.000Z");
      expect(result.newestBackup).toBe("2024-01-02T00:00:00.000Z");
    });
  });

  describe("setRetentionCount", () => {
    it("should update retention count in manifest", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          backups: [],
          retentionCount: 10,
          lastCleanup: null,
        })
      );
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await backupService.setRetentionCount(testProjectPath, 5);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"retentionCount": 5'),
        "utf-8"
      );
    });
  });
});
