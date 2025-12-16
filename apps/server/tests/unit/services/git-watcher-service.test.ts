import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitWatcherService } from "@/services/git-watcher-service.js";
import { BackupService } from "@/services/backup-service.js";
import { exec } from "child_process";
import { promisify } from "util";

// Mock child_process
vi.mock("child_process", () => ({
  exec: vi.fn(),
}));

vi.mock("util", () => ({
  promisify: vi.fn((fn) => fn),
}));

describe("git-watcher-service.ts", () => {
  let gitWatcher: GitWatcherService;
  let mockBackupService: BackupService;
  let mockEvents: { emit: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock backup service
    mockBackupService = {
      createBackup: vi.fn().mockResolvedValue({
        success: true,
        backupId: "backup-123",
        metadata: { id: "backup-123" },
      }),
      restoreBackup: vi.fn().mockResolvedValue({
        success: true,
        backupId: "backup-123",
        filesRestored: 5,
      }),
      detectChanges: vi.fn().mockResolvedValue({
        changed: false,
        missing: false,
      }),
      listBackups: vi.fn().mockResolvedValue([]),
      getBackup: vi.fn().mockResolvedValue(null),
      getStats: vi.fn().mockResolvedValue({
        totalBackups: 0,
        validBackups: 0,
        totalSize: 0,
        oldestBackup: null,
        newestBackup: null,
      }),
    } as unknown as BackupService;

    // Create mock event emitter
    mockEvents = {
      emit: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };

    gitWatcher = new GitWatcherService(mockBackupService, mockEvents as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isGitRepository", () => {
    it("should return true when inside git repository", async () => {
      vi.mocked(exec).mockImplementation((cmd: any, opts: any, callback?: any) => {
        const cb = callback || opts;
        cb(null, { stdout: "true", stderr: "" });
        return {} as any;
      });

      const result = await gitWatcher.isGitRepository("/test/project");

      expect(result).toBe(true);
    });

    it("should return false when not inside git repository", async () => {
      vi.mocked(exec).mockImplementation((cmd: any, opts: any, callback?: any) => {
        const cb = callback || opts;
        cb(new Error("Not a git repository"));
        return {} as any;
      });

      const result = await gitWatcher.isGitRepository("/test/project");

      expect(result).toBe(false);
    });
  });

  describe("getCurrentBranch", () => {
    it("should return current branch name", async () => {
      vi.mocked(exec).mockImplementation((cmd: any, opts: any, callback?: any) => {
        const cb = callback || opts;
        cb(null, { stdout: "main\n", stderr: "" });
        return {} as any;
      });

      const result = await gitWatcher.getCurrentBranch("/test/project");

      expect(result).toBe("main");
    });

    it("should return null on error", async () => {
      vi.mocked(exec).mockImplementation((cmd: any, opts: any, callback?: any) => {
        const cb = callback || opts;
        cb(new Error("Not a git repository"));
        return {} as any;
      });

      const result = await gitWatcher.getCurrentBranch("/test/project");

      expect(result).toBeNull();
    });
  });

  describe("getCurrentCommit", () => {
    it("should return current commit hash", async () => {
      vi.mocked(exec).mockImplementation((cmd: any, opts: any, callback?: any) => {
        const cb = callback || opts;
        cb(null, { stdout: "abc123def456\n", stderr: "" });
        return {} as any;
      });

      const result = await gitWatcher.getCurrentCommit("/test/project");

      expect(result).toBe("abc123def456");
    });

    it("should return null on error", async () => {
      vi.mocked(exec).mockImplementation((cmd: any, opts: any, callback?: any) => {
        const cb = callback || opts;
        cb(new Error("Not a git repository"));
        return {} as any;
      });

      const result = await gitWatcher.getCurrentCommit("/test/project");

      expect(result).toBeNull();
    });
  });

  describe("preOperation", () => {
    it("should create backup for watched operations", async () => {
      const result = await gitWatcher.preOperation("/test/project", "pull");

      expect(result.success).toBe(true);
      expect(result.backupId).toBe("backup-123");
      expect(mockBackupService.createBackup).toHaveBeenCalledWith(
        "/test/project",
        "git-pull"
      );
    });

    it("should skip backup for unwatched operations", async () => {
      const result = await gitWatcher.preOperation("/test/project", "status");

      expect(result.success).toBe(true);
      expect(result.backupId).toBeUndefined();
      expect(mockBackupService.createBackup).not.toHaveBeenCalled();
    });

    it("should skip backup when disabled", async () => {
      gitWatcher.setEnabled(false);

      const result = await gitWatcher.preOperation("/test/project", "pull");

      expect(result.success).toBe(true);
      expect(mockBackupService.createBackup).not.toHaveBeenCalled();
    });

    it("should emit backup:created event on success", async () => {
      await gitWatcher.preOperation("/test/project", "pull");

      expect(mockEvents.emit).toHaveBeenCalledWith(
        "backup:created",
        expect.objectContaining({
          projectPath: "/test/project",
          backupId: "backup-123",
        })
      );
    });
  });

  describe("postOperation", () => {
    it("should return success when no changes detected", async () => {
      // First create a pre-operation backup to track
      await gitWatcher.preOperation("/test/project", "pull");

      const result = await gitWatcher.postOperation("/test/project", "pull");

      expect(result.success).toBe(true);
      expect(result.changesDetected).toBe(false);
    });

    it("should detect missing .automaker directory", async () => {
      vi.mocked(mockBackupService.detectChanges).mockResolvedValue({
        changed: true,
        missing: true,
        details: ".automaker directory is missing",
      });

      await gitWatcher.preOperation("/test/project", "pull");
      const result = await gitWatcher.postOperation("/test/project", "pull");

      expect(result.success).toBe(false);
      expect(result.changesDetected).toBe(true);
    });

    it("should auto-restore when enabled and .automaker is missing", async () => {
      gitWatcher.setAutoRestore(true);

      vi.mocked(mockBackupService.detectChanges).mockResolvedValue({
        changed: true,
        missing: true,
        details: ".automaker directory is missing",
      });

      await gitWatcher.preOperation("/test/project", "pull");
      const result = await gitWatcher.postOperation("/test/project", "pull");

      expect(result.autoRestored).toBe(true);
      expect(mockBackupService.restoreBackup).toHaveBeenCalled();
    });
  });

  describe("checkAndSuggestRecovery", () => {
    it("should return healthy status when no issues", async () => {
      const result = await gitWatcher.checkAndSuggestRecovery("/test/project");

      expect(result.healthy).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("should detect missing .automaker and suggest recovery", async () => {
      vi.mocked(mockBackupService.detectChanges).mockResolvedValue({
        changed: true,
        missing: true,
        details: ".automaker directory is missing",
      });
      vi.mocked(mockBackupService.listBackups).mockResolvedValue([
        {
          id: "backup-123",
          timestamp: "2024-01-01T00:00:00.000Z",
          projectPath: "/test/project",
          trigger: "manual",
          fileCount: 5,
          totalSize: 1000,
          checksum: "abc123",
          valid: true,
        },
      ]);

      const result = await gitWatcher.checkAndSuggestRecovery("/test/project");

      expect(result.healthy).toBe(false);
      expect(result.issues).toContain(".automaker directory is missing");
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.availableBackups).toBe(1);
    });
  });

  describe("configuration", () => {
    it("should get current config", () => {
      const config = gitWatcher.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.watchedOperations).toContain("pull");
      expect(config.preOperationBackup).toBe(true);
    });

    it("should update config", () => {
      gitWatcher.updateConfig({
        enabled: false,
        autoRestore: true,
      });

      const config = gitWatcher.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.autoRestore).toBe(true);
    });

    it("should enable/disable watcher", () => {
      gitWatcher.setEnabled(false);
      expect(gitWatcher.getConfig().enabled).toBe(false);

      gitWatcher.setEnabled(true);
      expect(gitWatcher.getConfig().enabled).toBe(true);
    });

    it("should enable/disable auto-restore", () => {
      gitWatcher.setAutoRestore(true);
      expect(gitWatcher.getConfig().autoRestore).toBe(true);

      gitWatcher.setAutoRestore(false);
      expect(gitWatcher.getConfig().autoRestore).toBe(false);
    });
  });

  describe("project registration", () => {
    it("should register project for watching", () => {
      gitWatcher.registerProject("/test/project");
      // No assertion needed - just verifies no error thrown
    });

    it("should unregister project from watching", () => {
      gitWatcher.registerProject("/test/project");
      gitWatcher.unregisterProject("/test/project");
      // No assertion needed - just verifies no error thrown
    });
  });
});
