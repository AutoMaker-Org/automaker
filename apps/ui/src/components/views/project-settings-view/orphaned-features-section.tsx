import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Unlink,
  Search,
  Trash2,
  GitBranch,
  ArrowRight,
  AlertTriangle,
  CheckSquare,
  MinusSquare,
  Square,
} from 'lucide-react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import type { Project } from '@/lib/electron';
import type { Feature } from '@automaker/types';

interface OrphanedFeatureInfo {
  feature: Feature;
  missingBranch: string;
}

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent: boolean;
  hasWorktree: boolean;
}

interface OrphanedFeaturesSectionProps {
  project: Project;
}

export function OrphanedFeaturesSection({ project }: OrphanedFeaturesSectionProps) {
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [orphanedFeatures, setOrphanedFeatures] = useState<OrphanedFeatureInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{
    featureIds: string[];
    labels: string[];
  } | null>(null);
  const [moveDialog, setMoveDialog] = useState<{
    featureIds: string[];
    labels: string[];
  } | null>(null);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('__main__');
  const [loadingWorktrees, setLoadingWorktrees] = useState(false);

  const allSelected = orphanedFeatures.length > 0 && selectedIds.size === orphanedFeatures.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < orphanedFeatures.length;
  const hasSelection = selectedIds.size > 0;

  const selectedLabels = useMemo(() => {
    return orphanedFeatures
      .filter((o) => selectedIds.has(o.feature.id))
      .map((o) => o.feature.title || o.feature.description?.slice(0, 60) || o.feature.id);
  }, [orphanedFeatures, selectedIds]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orphanedFeatures.map((o) => o.feature.id)));
    }
  }, [allSelected, orphanedFeatures]);

  const scanForOrphans = useCallback(async () => {
    setScanning(true);
    setSelectedIds(new Set());
    try {
      const api = getHttpApiClient();
      const result = await api.features.getOrphaned(project.path);
      if (result.success && result.orphanedFeatures) {
        setOrphanedFeatures(result.orphanedFeatures);
        setScanned(true);
        if (result.orphanedFeatures.length === 0) {
          toast.success('No orphaned features found');
        } else {
          toast.info(`Found ${result.orphanedFeatures.length} orphaned feature(s)`);
        }
      } else {
        toast.error('Failed to scan for orphaned features', {
          description: result.error,
        });
      }
    } catch (error) {
      toast.error('Failed to scan for orphaned features', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setScanning(false);
    }
  }, [project.path]);

  const loadWorktrees = useCallback(async () => {
    setLoadingWorktrees(true);
    try {
      const api = getHttpApiClient();
      const result = await api.worktree.listAll(project.path);
      if (result.success && result.worktrees) {
        setWorktrees(result.worktrees);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingWorktrees(false);
    }
  }, [project.path]);

  const resolveOrphan = useCallback(
    async (
      featureId: string,
      action: 'delete' | 'create-worktree' | 'move-to-branch',
      targetBranch?: string | null
    ) => {
      setResolvingIds((prev) => new Set(prev).add(featureId));
      try {
        const api = getHttpApiClient();
        const result = await api.features.resolveOrphaned(
          project.path,
          featureId,
          action,
          targetBranch
        );
        if (result.success) {
          setOrphanedFeatures((prev) => prev.filter((o) => o.feature.id !== featureId));
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(featureId);
            return next;
          });
          const messages: Record<string, string> = {
            deleted: 'Feature deleted',
            'worktree-created': 'Worktree created successfully',
            moved: 'Feature moved successfully',
          };
          toast.success(messages[result.action ?? action] ?? 'Resolved');
        } else {
          toast.error('Failed to resolve orphaned feature', {
            description: result.error,
          });
        }
      } catch (error) {
        toast.error('Failed to resolve orphaned feature', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setResolvingIds((prev) => {
          const next = new Set(prev);
          next.delete(featureId);
          return next;
        });
      }
    },
    [project.path]
  );

  const bulkResolve = useCallback(
    async (
      featureIds: string[],
      action: 'delete' | 'create-worktree' | 'move-to-branch',
      targetBranch?: string | null
    ) => {
      const ids = new Set(featureIds);
      setResolvingIds((prev) => new Set([...prev, ...ids]));
      try {
        const api = getHttpApiClient();
        const result = await api.features.bulkResolveOrphaned(
          project.path,
          featureIds,
          action,
          targetBranch
        );
        if (result.success || (result.resolvedCount && result.resolvedCount > 0)) {
          const resolvedIds = new Set(
            result.results?.filter((r) => r.success).map((r) => r.featureId) ?? featureIds
          );
          setOrphanedFeatures((prev) => prev.filter((o) => !resolvedIds.has(o.feature.id)));
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const id of resolvedIds) {
              next.delete(id);
            }
            return next;
          });

          const actionLabel =
            action === 'delete'
              ? 'deleted'
              : action === 'create-worktree'
                ? 'moved to worktrees'
                : 'moved';
          if (result.failedCount && result.failedCount > 0) {
            toast.warning(
              `${result.resolvedCount} feature(s) ${actionLabel}, ${result.failedCount} failed`
            );
          } else {
            toast.success(`${result.resolvedCount} feature(s) ${actionLabel}`);
          }
        } else {
          toast.error('Failed to resolve orphaned features', {
            description: result.error,
          });
        }
      } catch (error) {
        toast.error('Failed to resolve orphaned features', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setResolvingIds((prev) => {
          const next = new Set(prev);
          for (const id of featureIds) {
            next.delete(id);
          }
          return next;
        });
        setDeleteConfirm(null);
        setMoveDialog(null);
      }
    },
    [project.path]
  );

  const openMoveDialog = useCallback(
    async (featureIds: string[], labels: string[]) => {
      setMoveDialog({ featureIds, labels });
      setSelectedBranch('__main__');
      await loadWorktrees();
    },
    [loadWorktrees]
  );

  const handleMoveConfirm = useCallback(() => {
    if (!moveDialog) return;
    const targetBranch = selectedBranch === '__main__' ? null : selectedBranch;
    if (moveDialog.featureIds.length === 1) {
      resolveOrphan(moveDialog.featureIds[0], 'move-to-branch', targetBranch);
    } else {
      bulkResolve(moveDialog.featureIds, 'move-to-branch', targetBranch);
    }
    setMoveDialog(null);
  }, [moveDialog, selectedBranch, resolveOrphan, bulkResolve]);

  const isBulkResolving = resolvingIds.size > 0;

  return (
    <>
      <div
        className={cn(
          'rounded-2xl overflow-hidden',
          'border border-border/50',
          'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm shadow-black/5'
        )}
      >
        {/* Header */}
        <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/20">
              <Unlink className="w-5 h-5 text-amber-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              Orphaned Features
            </h2>
            {scanned && orphanedFeatures.length > 0 && (
              <span className="ml-auto inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-500 border border-amber-500/25">
                {orphanedFeatures.length} found
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground/80 ml-12">
            Detect features whose git branches no longer exist. You can delete them, create a new
            worktree, or move them to an existing branch.
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Scan Button */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">Scan for Orphaned Features</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Check all features for missing git branches.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={scanForOrphans}
              loading={scanning}
              className="gap-2"
              data-testid="scan-orphaned-features-button"
            >
              <Search className="w-4 h-4" />
              {scanning ? 'Scanning...' : scanned ? 'Rescan' : 'Scan for Orphans'}
            </Button>
          </div>

          {/* Results */}
          {scanned && (
            <>
              <div className="border-t border-border/50" />

              {orphanedFeatures.length === 0 ? (
                <div className="text-center py-6">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <GitBranch className="w-6 h-6 text-emerald-500" />
                  </div>
                  <p className="text-sm font-medium text-foreground">All clear</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No orphaned features detected.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Selection toolbar */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={toggleSelectAll}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="select-all-orphans"
                      >
                        {allSelected ? (
                          <CheckSquare className="w-4 h-4 text-brand-500" />
                        ) : someSelected ? (
                          <MinusSquare className="w-4 h-4 text-brand-500" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                        <span>
                          {allSelected ? 'Deselect all' : `Select all (${orphanedFeatures.length})`}
                        </span>
                      </button>
                      {hasSelection && (
                        <span className="text-xs text-muted-foreground">
                          {selectedIds.size} selected
                        </span>
                      )}
                    </div>

                    {/* Bulk actions */}
                    {hasSelection && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const ids = Array.from(selectedIds);
                            bulkResolve(ids, 'create-worktree');
                          }}
                          disabled={isBulkResolving}
                          className="gap-1.5 text-xs"
                          data-testid="bulk-create-worktree"
                        >
                          <GitBranch className="w-3.5 h-3.5" />
                          Create Worktrees ({selectedIds.size})
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openMoveDialog(Array.from(selectedIds), selectedLabels)}
                          disabled={isBulkResolving}
                          className="gap-1.5 text-xs"
                          data-testid="bulk-move-to-branch"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                          Move ({selectedIds.size})
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setDeleteConfirm({
                              featureIds: Array.from(selectedIds),
                              labels: selectedLabels,
                            })
                          }
                          disabled={isBulkResolving}
                          className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                          data-testid="bulk-delete-orphans"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete ({selectedIds.size})
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Feature list */}
                  <div className="space-y-2">
                    {orphanedFeatures.map(({ feature, missingBranch }) => {
                      const isResolving = resolvingIds.has(feature.id);
                      const isSelected = selectedIds.has(feature.id);
                      return (
                        <div
                          key={feature.id}
                          className={cn(
                            'rounded-xl border p-4',
                            'bg-gradient-to-r from-card/60 to-card/40',
                            'transition-all duration-200',
                            isResolving && 'opacity-60',
                            isSelected ? 'border-brand-500/40 bg-brand-500/5' : 'border-border/50'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            {/* Checkbox */}
                            <div className="pt-0.5">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelect(feature.id)}
                                disabled={isResolving}
                                data-testid={`select-orphan-${feature.id}`}
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground truncate">
                                {feature.title || feature.description?.slice(0, 80) || feature.id}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                                <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                Missing branch:{' '}
                                <code className="px-1.5 py-0.5 rounded bg-muted/50 font-mono text-[11px]">
                                  {missingBranch}
                                </code>
                              </p>
                            </div>
                          </div>

                          {/* Per-item actions */}
                          <div className="flex items-center gap-2 mt-3 ml-7 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => resolveOrphan(feature.id, 'create-worktree')}
                              disabled={isResolving}
                              loading={isResolving}
                              className="gap-1.5 text-xs"
                              data-testid={`create-worktree-${feature.id}`}
                            >
                              <GitBranch className="w-3.5 h-3.5" />
                              Create Worktree
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                openMoveDialog(
                                  [feature.id],
                                  [feature.title || feature.description?.slice(0, 60) || feature.id]
                                )
                              }
                              disabled={isResolving}
                              className="gap-1.5 text-xs"
                              data-testid={`move-orphan-${feature.id}`}
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                              Move to Branch
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setDeleteConfirm({
                                  featureIds: [feature.id],
                                  labels: [
                                    feature.title ||
                                      feature.description?.slice(0, 60) ||
                                      feature.id,
                                  ],
                                })
                              }
                              disabled={isResolving}
                              className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                              data-testid={`delete-orphan-${feature.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete{' '}
              {deleteConfirm && deleteConfirm.featureIds.length > 1
                ? `${deleteConfirm.featureIds.length} Orphaned Features`
                : 'Orphaned Feature'}
            </DialogTitle>
            <DialogDescription>
              {deleteConfirm && deleteConfirm.featureIds.length > 1 ? (
                <>
                  Are you sure you want to permanently delete these{' '}
                  {deleteConfirm.featureIds.length} features?
                  <span className="block mt-2 max-h-32 overflow-y-auto space-y-1">
                    {deleteConfirm.labels.map((label, i) => (
                      <span key={i} className="block text-sm font-medium text-foreground">
                        &bull; {label}
                      </span>
                    ))}
                  </span>
                </>
              ) : (
                <>
                  Are you sure you want to permanently delete this feature?
                  <span className="block mt-2 font-medium text-foreground">
                    &quot;{deleteConfirm?.labels[0]}&quot;
                  </span>
                </>
              )}
              <span className="block mt-2 text-destructive font-medium">
                This action cannot be undone.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={isBulkResolving}
              onClick={() => {
                if (deleteConfirm) {
                  if (deleteConfirm.featureIds.length === 1) {
                    resolveOrphan(deleteConfirm.featureIds[0], 'delete');
                    setDeleteConfirm(null);
                  } else {
                    bulkResolve(deleteConfirm.featureIds, 'delete');
                  }
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
              {deleteConfirm && deleteConfirm.featureIds.length > 1
                ? ` (${deleteConfirm.featureIds.length})`
                : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Branch Dialog */}
      <Dialog open={!!moveDialog} onOpenChange={(open) => !open && setMoveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-brand-500" />
              Move to Branch
            </DialogTitle>
            <DialogDescription>
              {moveDialog && moveDialog.featureIds.length > 1 ? (
                <>
                  Select where to move {moveDialog.featureIds.length} features. The branch reference
                  will be updated and the features will be set to pending.
                </>
              ) : (
                <>
                  Select where to move this feature. The branch reference will be updated and the
                  feature will be set to pending.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <label className="text-sm font-medium text-foreground mb-2 block">Target Branch</label>
            <Select
              value={selectedBranch}
              onValueChange={setSelectedBranch}
              disabled={loadingWorktrees}
            >
              <SelectTrigger className="w-full" data-testid="move-target-branch-select">
                <SelectValue placeholder="Select a branch..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__main__">Main worktree (clear branch reference)</SelectItem>
                {worktrees
                  .filter((w) => !w.isMain && w.branch)
                  .map((w) => (
                    <SelectItem key={w.branch} value={w.branch}>
                      {w.branch}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              {selectedBranch === '__main__'
                ? 'The branch reference will be cleared and the feature will use the main worktree.'
                : `The feature will be associated with the "${selectedBranch}" branch.`}
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoveDialog(null)}>
              Cancel
            </Button>
            <Button loading={isBulkResolving} onClick={handleMoveConfirm}>
              <ArrowRight className="w-4 h-4 mr-2" />
              Move
              {moveDialog && moveDialog.featureIds.length > 1
                ? ` (${moveDialog.featureIds.length})`
                : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
