// @ts-nocheck
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { CircleDot, RefreshCw } from 'lucide-react';
import { getElectronAPI, GitHubIssue, IssueValidationResult } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { cn, pathsEqual } from '@/lib/utils';
import { toast } from 'sonner';
import { useGithubIssues, useIssueValidation } from './github-issues-view/hooks';
import { IssueRow, IssueDetailPanel, IssuesListHeader } from './github-issues-view/components';
import { ValidationDialog, ImportIssuesDialog } from './github-issues-view/dialogs';
import { formatDate, getFeaturePriority } from './github-issues-view/utils';
import { useModelOverride } from '@/components/shared';
import type { ValidateIssueOptions } from './github-issues-view/types';

const logger = createLogger('GitHubIssuesView');

export function GitHubIssuesView() {
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null);
  const [validationResult, setValidationResult] = useState<IssueValidationResult | null>(null);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [showRevalidateConfirm, setShowRevalidateConfirm] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [pendingRevalidateOptions, setPendingRevalidateOptions] =
    useState<ValidateIssueOptions | null>(null);

  const {
    currentProject,
    defaultAIProfileId,
    aiProfiles,
    getCurrentWorktree,
    worktreesByProject,
    githubAutoValidate,
    setGithubAutoValidate,
  } = useAppStore();

  // Model override for validation
  const validationModelOverride = useModelOverride({ phase: 'validationModel' });

  // Extract model string for API calls (backward compatibility)
  const validationModelString = validationModelOverride.effectiveModel;

  const { openIssues, closedIssues, loading, refreshing, error, refresh } = useGithubIssues();

  const { validatingIssues, cachedValidations, handleValidateIssue, handleViewCachedValidation } =
    useIssueValidation({
      selectedIssue,
      showValidationDialog,
      onValidationResultChange: setValidationResult,
      onShowValidationDialogChange: setShowValidationDialog,
    });

  // Track which issues we've already triggered auto-validate for (to avoid duplicates)
  const autoValidatedIssuesRef = useRef<Set<number>>(new Set());

  // Auto-validate issues when enabled and issues are loaded
  useEffect(() => {
    if (!githubAutoValidate || loading || openIssues.length === 0) return;

    // Find issues that need validation (not cached and not currently validating)
    const issuesToValidate = openIssues.filter((issue) => {
      // Skip if already auto-validated in this session
      if (autoValidatedIssuesRef.current.has(issue.number)) return false;
      // Skip if already has cached validation
      if (cachedValidations.has(issue.number)) return false;
      // Skip if currently validating
      if (validatingIssues.has(issue.number)) return false;
      return true;
    });

    // Validate up to 3 issues at a time to avoid overwhelming the system
    const batchSize = 3;
    const batch = issuesToValidate.slice(0, batchSize);

    for (const issue of batch) {
      autoValidatedIssuesRef.current.add(issue.number);
      handleValidateIssue(issue);
    }

    if (batch.length > 0) {
      logger.info(
        `Auto-validating ${batch.length} issues (${issuesToValidate.length - batch.length} remaining)`
      );
    }
  }, [
    githubAutoValidate,
    loading,
    openIssues,
    cachedValidations,
    validatingIssues,
    handleValidateIssue,
  ]);

  // Reset auto-validated tracking when auto-validate is toggled off
  useEffect(() => {
    if (!githubAutoValidate) {
      autoValidatedIssuesRef.current.clear();
    }
  }, [githubAutoValidate]);

  // Get default AI profile for task creation
  const defaultProfile = useMemo(() => {
    if (!defaultAIProfileId) return null;
    return aiProfiles.find((p) => p.id === defaultAIProfileId) ?? null;
  }, [defaultAIProfileId, aiProfiles]);

  // Get current branch from selected worktree
  const currentBranch = useMemo(() => {
    if (!currentProject?.path) return '';
    const currentWorktreeInfo = getCurrentWorktree(currentProject.path);
    const worktrees = worktreesByProject[currentProject.path] ?? [];
    const currentWorktreePath = currentWorktreeInfo?.path ?? null;

    const selectedWorktree =
      currentWorktreePath === null
        ? worktrees.find((w) => w.isMain)
        : worktrees.find((w) => !w.isMain && pathsEqual(w.path, currentWorktreePath));

    return selectedWorktree?.branch || worktrees.find((w) => w.isMain)?.branch || '';
  }, [currentProject?.path, getCurrentWorktree, worktreesByProject]);

  const handleOpenInGitHub = useCallback((url: string) => {
    const api = getElectronAPI();
    api.openExternalLink(url);
  }, []);

  const handleConvertToTask = useCallback(
    async (issue: GitHubIssue, validation: IssueValidationResult) => {
      if (!currentProject?.path) {
        toast.error('No project selected');
        return;
      }

      try {
        const api = getElectronAPI();
        if (api.features?.create) {
          // Build description from issue body + validation info
          const description = [
            `**From GitHub Issue #${issue.number}**`,
            '',
            issue.body || 'No description provided.',
            '',
            '---',
            '',
            '**AI Validation Analysis:**',
            validation.reasoning,
            validation.suggestedFix ? `\n**Suggested Approach:**\n${validation.suggestedFix}` : '',
            validation.relatedFiles?.length
              ? `\n**Related Files:**\n${validation.relatedFiles.map((f) => `- \`${f}\``).join('\n')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n');

          // Use profile default model
          const featureModel = defaultProfile?.model ?? 'opus';

          const feature = {
            id: `issue-${issue.number}-${crypto.randomUUID()}`,
            title: issue.title,
            description,
            category: 'From GitHub',
            status: 'backlog' as const,
            passes: false,
            priority: getFeaturePriority(validation.estimatedComplexity),
            model: featureModel,
            thinkingLevel: defaultProfile?.thinkingLevel ?? 'none',
            branchName: currentBranch,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const result = await api.features.create(currentProject.path, feature);
          if (result.success) {
            toast.success(`Created task: ${issue.title}`);
          } else {
            toast.error(result.error || 'Failed to create task');
          }
        }
      } catch (err) {
        logger.error('Convert to task error:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to create task');
      }
    },
    [currentProject?.path, defaultProfile, currentBranch]
  );

  // Handle bulk import of issues as tasks
  const handleImportIssues = useCallback(
    async (issues: GitHubIssue[]) => {
      if (!currentProject?.path) {
        toast.error('No project selected');
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const issue of issues) {
        const validation = cachedValidations.get(issue.number);
        if (!validation?.result) {
          errorCount++;
          continue;
        }

        try {
          await handleConvertToTask(issue, validation.result);
          successCount++;
        } catch {
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Imported ${successCount} issue${successCount !== 1 ? 's' : ''} as tasks`);
      }
      if (errorCount > 0) {
        toast.error(`Failed to import ${errorCount} issue${errorCount !== 1 ? 's' : ''}`);
      }
    },
    [currentProject?.path, cachedValidations, handleConvertToTask]
  );

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} title="Failed to Load Issues" onRetry={refresh} />;
  }

  const totalIssues = openIssues.length + closedIssues.length;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Issues List */}
      <div
        className={cn(
          'flex flex-col overflow-hidden border-r border-border',
          selectedIssue ? 'w-80' : 'flex-1'
        )}
      >
        {/* Header */}
        <IssuesListHeader
          openCount={openIssues.length}
          closedCount={closedIssues.length}
          refreshing={refreshing}
          onRefresh={refresh}
          autoValidate={githubAutoValidate}
          onAutoValidateChange={setGithubAutoValidate}
          onImportClick={() => setShowImportDialog(true)}
        />

        {/* Issues List */}
        <div className="flex-1 overflow-auto">
          {totalIssues === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="p-4 rounded-full bg-muted/50 mb-4">
                <CircleDot className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-base font-medium mb-2">No Issues</h2>
              <p className="text-sm text-muted-foreground">This repository has no issues yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Open Issues */}
              {openIssues.map((issue) => (
                <IssueRow
                  key={issue.number}
                  issue={issue}
                  isSelected={selectedIssue?.number === issue.number}
                  onClick={() => setSelectedIssue(issue)}
                  onOpenExternal={() => handleOpenInGitHub(issue.url)}
                  formatDate={formatDate}
                  cachedValidation={cachedValidations.get(issue.number)}
                  isValidating={validatingIssues.has(issue.number)}
                />
              ))}

              {/* Closed Issues Section */}
              {closedIssues.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-muted/30 text-xs font-medium text-muted-foreground">
                    Closed Issues ({closedIssues.length})
                  </div>
                  {closedIssues.map((issue) => (
                    <IssueRow
                      key={issue.number}
                      issue={issue}
                      isSelected={selectedIssue?.number === issue.number}
                      onClick={() => setSelectedIssue(issue)}
                      onOpenExternal={() => handleOpenInGitHub(issue.url)}
                      formatDate={formatDate}
                      cachedValidation={cachedValidations.get(issue.number)}
                      isValidating={validatingIssues.has(issue.number)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Issue Detail Panel */}
      {selectedIssue && (
        <IssueDetailPanel
          issue={selectedIssue}
          validatingIssues={validatingIssues}
          cachedValidations={cachedValidations}
          onValidateIssue={handleValidateIssue}
          onViewCachedValidation={handleViewCachedValidation}
          onOpenInGitHub={handleOpenInGitHub}
          onClose={() => setSelectedIssue(null)}
          onShowRevalidateConfirm={(options) => {
            setPendingRevalidateOptions(options);
            setShowRevalidateConfirm(true);
          }}
          formatDate={formatDate}
          modelOverride={validationModelOverride}
        />
      )}

      {/* Validation Dialog */}
      <ValidationDialog
        open={showValidationDialog}
        onOpenChange={setShowValidationDialog}
        issue={selectedIssue}
        validationResult={validationResult}
        onConvertToTask={handleConvertToTask}
      />

      {/* Revalidate Confirmation Dialog */}
      <ConfirmDialog
        open={showRevalidateConfirm}
        onOpenChange={(open) => {
          setShowRevalidateConfirm(open);
          if (!open) {
            setPendingRevalidateOptions(null);
          }
        }}
        title="Re-validate Issue"
        description={`Are you sure you want to re-validate issue #${selectedIssue?.number}? This will run a new AI analysis and replace the existing validation result.`}
        icon={RefreshCw}
        iconClassName="text-primary"
        confirmText="Re-validate"
        onConfirm={() => {
          if (selectedIssue && pendingRevalidateOptions) {
            logger.info('Revalidating with options:', {
              commentsCount: pendingRevalidateOptions.comments?.length ?? 0,
              linkedPRsCount: pendingRevalidateOptions.linkedPRs?.length ?? 0,
            });
            handleValidateIssue(selectedIssue, {
              ...pendingRevalidateOptions,
              forceRevalidate: true,
            });
          }
        }}
      />

      {/* Import Issues Dialog */}
      <ImportIssuesDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        issues={openIssues}
        cachedValidations={cachedValidations}
        validatingIssues={validatingIssues}
        onImport={handleImportIssues}
      />
    </div>
  );
}
