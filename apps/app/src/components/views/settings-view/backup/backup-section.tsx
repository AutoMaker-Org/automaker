"use client";

import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Database,
  Shield,
  RefreshCw,
  Download,
  Upload,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  HardDrive,
  Loader2,
  FolderArchive,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getHttpApiClient } from "@/lib/http-api-client";
import { toast } from "sonner";
import type { BackupMetadata, BackupConfig, BackupStats, BackupHealth } from "@/lib/electron";

interface BackupSectionProps {
  projectPath: string | null;
}

export function BackupSection({ projectPath }: BackupSectionProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [health, setHealth] = useState<BackupHealth | null>(null);
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [showBackupList, setShowBackupList] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [deletingBackupId, setDeletingBackupId] = useState<string | null>(null);

  const httpClient = getHttpApiClient();

  const loadData = useCallback(async () => {
    if (!projectPath) return;

    setIsLoading(true);
    try {
      const [configResult, statsResult, healthResult, backupsResult] = await Promise.all([
        httpClient.backup.getConfig(),
        httpClient.backup.stats(projectPath),
        httpClient.backup.checkHealth(projectPath),
        httpClient.backup.list(projectPath),
      ]);

      if (configResult.success && configResult.config) {
        setConfig(configResult.config);
      }
      if (statsResult.success && statsResult.stats) {
        setStats(statsResult.stats);
      }
      if (healthResult.success && healthResult.health) {
        setHealth(healthResult.health);
      }
      if (backupsResult.success && backupsResult.backups) {
        setBackups(backupsResult.backups);
      }
    } catch (error) {
      console.error("Failed to load backup data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath, httpClient.backup]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateBackup = async () => {
    if (!projectPath) return;

    setIsCreatingBackup(true);
    try {
      const result = await httpClient.backup.create(projectPath, "manual");
      if (result.success) {
        toast.success("Backup created successfully", {
          description: `Backup ID: ${result.backupId}`,
        });
        await loadData();
      } else {
        toast.error("Failed to create backup", {
          description: result.error,
        });
      }
    } catch (error) {
      toast.error("Failed to create backup", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleRestoreLatest = async () => {
    if (!projectPath) return;

    setIsRestoring(true);
    try {
      const result = await httpClient.backup.restore(projectPath);
      if (result.success) {
        toast.success("Backup restored successfully", {
          description: `Restored ${result.filesRestored} files from ${result.backupId}`,
        });
        await loadData();
      } else {
        toast.error("Failed to restore backup", {
          description: result.error,
        });
      }
    } catch (error) {
      toast.error("Failed to restore backup", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRestoreBackup = async (backupId: string) => {
    if (!projectPath) return;

    setIsRestoring(true);
    try {
      const result = await httpClient.backup.restore(projectPath, backupId);
      if (result.success) {
        toast.success("Backup restored successfully", {
          description: `Restored ${result.filesRestored} files`,
        });
        await loadData();
      } else {
        toast.error("Failed to restore backup", {
          description: result.error,
        });
      }
    } catch (error) {
      toast.error("Failed to restore backup", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!projectPath) return;

    setDeletingBackupId(backupId);
    try {
      const result = await httpClient.backup.delete(projectPath, backupId);
      if (result.success) {
        toast.success("Backup deleted");
        await loadData();
      } else {
        toast.error("Failed to delete backup", {
          description: result.error,
        });
      }
    } catch (error) {
      toast.error("Failed to delete backup", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setDeletingBackupId(null);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    if (!projectPath) return;

    try {
      const result = await httpClient.backup.updateConfig(projectPath, { enabled });
      if (result.success && result.config) {
        setConfig(result.config);
        toast.success(`Backup system ${enabled ? "enabled" : "disabled"}`);
      } else {
        toast.error("Failed to update configuration", {
          description: result.error,
        });
      }
    } catch (error) {
      toast.error("Failed to update configuration", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleToggleAutoRestore = async (autoRestore: boolean) => {
    if (!projectPath) return;

    try {
      const result = await httpClient.backup.updateConfig(projectPath, { autoRestore });
      if (result.success && result.config) {
        setConfig(result.config);
        toast.success(`Auto-restore ${autoRestore ? "enabled" : "disabled"}`);
      } else {
        toast.error("Failed to update configuration", {
          description: result.error,
        });
      }
    } catch (error) {
      toast.error("Failed to update configuration", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getTriggerLabel = (trigger: string) => {
    const labels: Record<string, string> = {
      manual: "Manual",
      "git-pull": "Git Pull",
      "git-merge": "Git Merge",
      "git-checkout": "Git Checkout",
      "git-switch": "Git Switch",
      "git-rebase": "Git Rebase",
      scheduled: "Scheduled",
      "auto-restore": "Auto Restore",
    };
    return labels[trigger] || trigger;
  };

  if (!projectPath) {
    return (
      <div
        className={cn(
          "rounded-2xl overflow-hidden",
          "border border-border/50",
          "bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl",
          "shadow-sm shadow-black/5"
        )}
      >
        <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
              <Database className="w-5 h-5 text-brand-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              Configuration Backup
            </h2>
          </div>
          <p className="text-sm text-muted-foreground/80 ml-12">
            Protect your .automaker configuration with automatic backups.
          </p>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <AlertCircle className="w-5 h-5 mr-2" />
            Select a project to manage backups
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden",
        "border border-border/50",
        "bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl",
        "shadow-sm shadow-black/5"
      )}
    >
      {/* Header */}
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <Database className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Configuration Backup
          </h2>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Protect your .automaker configuration with automatic backups before git operations.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Health Status */}
        {health && (
          <div
            className={cn(
              "p-4 rounded-xl border",
              health.healthy
                ? "bg-green-500/5 border-green-500/20"
                : "bg-amber-500/5 border-amber-500/20"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              {health.healthy ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-500" />
              )}
              <span
                className={cn(
                  "font-medium",
                  health.healthy ? "text-green-500" : "text-amber-500"
                )}
              >
                {health.healthy ? "Configuration Healthy" : "Issues Detected"}
              </span>
            </div>
            {health.issues.length > 0 && (
              <ul className="text-sm text-muted-foreground space-y-1 ml-7">
                {health.issues.map((issue, i) => (
                  <li key={i}>• {issue}</li>
                ))}
              </ul>
            )}
            {health.suggestions.length > 0 && (
              <div className="mt-2 ml-7">
                <p className="text-xs text-muted-foreground/70 mb-1">Suggestions:</p>
                <ul className="text-xs text-muted-foreground/70 space-y-0.5">
                  {health.suggestions.map((suggestion, i) => (
                    <li key={i}>→ {suggestion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 rounded-xl bg-accent/20 border border-border/30">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FolderArchive className="w-4 h-4" />
                <span className="text-xs">Total Backups</span>
              </div>
              <p className="text-lg font-semibold">{stats.totalBackups}</p>
            </div>
            <div className="p-3 rounded-xl bg-accent/20 border border-border/30">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs">Valid Backups</span>
              </div>
              <p className="text-lg font-semibold">{stats.validBackups}</p>
            </div>
            <div className="p-3 rounded-xl bg-accent/20 border border-border/30">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <HardDrive className="w-4 h-4" />
                <span className="text-xs">Total Size</span>
              </div>
              <p className="text-lg font-semibold">{formatBytes(stats.totalSize)}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleCreateBackup}
            disabled={isCreatingBackup}
            className="flex-1"
          >
            {isCreatingBackup ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Create Backup
          </Button>
          <Button
            onClick={handleRestoreLatest}
            disabled={isRestoring || !stats || stats.validBackups === 0}
            variant="outline"
            className="flex-1"
          >
            {isRestoring ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Restore Latest
          </Button>
          <Button
            onClick={loadData}
            disabled={isLoading}
            variant="ghost"
            size="icon"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </Button>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Settings */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand-500" />
            Backup Settings
          </h3>

          {/* Enable Backup System */}
          <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
            <Checkbox
              id="backup-enabled"
              checked={config?.enabled ?? true}
              onCheckedChange={(checked) => handleToggleEnabled(checked === true)}
              className="mt-1"
              data-testid="backup-enabled-checkbox"
            />
            <div className="space-y-1.5">
              <Label
                htmlFor="backup-enabled"
                className="text-foreground cursor-pointer font-medium flex items-center gap-2"
              >
                Enable automatic backups
              </Label>
              <p className="text-xs text-muted-foreground/80 leading-relaxed">
                Automatically create backups before git operations (pull, merge, checkout, etc.)
              </p>
            </div>
          </div>

          {/* Auto Restore */}
          <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
            <Checkbox
              id="auto-restore"
              checked={config?.autoRestore ?? false}
              onCheckedChange={(checked) => handleToggleAutoRestore(checked === true)}
              className="mt-1"
              data-testid="auto-restore-checkbox"
            />
            <div className="space-y-1.5">
              <Label
                htmlFor="auto-restore"
                className="text-foreground cursor-pointer font-medium flex items-center gap-2"
              >
                Enable auto-restore
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/20 font-medium">
                  caution
                </span>
              </Label>
              <p className="text-xs text-muted-foreground/80 leading-relaxed">
                Automatically restore from backup if .automaker is corrupted or missing after git operations.
              </p>
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Backup List */}
        <div>
          <button
            onClick={() => setShowBackupList(!showBackupList)}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-accent/30 transition-colors"
          >
            <span className="text-sm font-medium text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-500" />
              Backup History ({backups.length})
            </span>
            {showBackupList ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {showBackupList && (
            <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto">
              {backups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No backups yet
                </p>
              ) : (
                backups.map((backup) => (
                  <div
                    key={backup.id}
                    className={cn(
                      "p-3 rounded-lg border",
                      backup.valid
                        ? "bg-card/50 border-border/50"
                        : "bg-destructive/5 border-destructive/20"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {backup.valid ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-destructive shrink-0" />
                          )}
                          <span className="text-xs font-mono truncate">
                            {backup.id}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{formatDate(backup.timestamp)}</span>
                          <span className="px-1.5 py-0.5 rounded bg-accent/50">
                            {getTriggerLabel(backup.trigger)}
                          </span>
                          <span>{backup.fileCount} files</span>
                          <span>{formatBytes(backup.totalSize)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRestoreBackup(backup.id)}
                          disabled={isRestoring || !backup.valid}
                          title="Restore this backup"
                        >
                          <Upload className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteBackup(backup.id)}
                          disabled={deletingBackupId === backup.id}
                          title="Delete this backup"
                          className="text-destructive hover:text-destructive"
                        >
                          {deletingBackupId === backup.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
