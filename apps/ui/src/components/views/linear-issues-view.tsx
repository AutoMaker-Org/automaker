import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Link2Off, Settings } from 'lucide-react';
import { getElectronAPI, LinearIssue, IssueValidationResult } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useNavigate } from '@tanstack/react-router';
import type { PhaseModelEntry, ModelAlias, CursorModelId } from '@automaker/types';
import {
  useLinearConnection,
  useLinearTeams,
  useLinearIssues,
  useLinearImport,
  useLinearValidation,
} from './linear-issues-view/hooks';
import {
  LinearIssueRow,
  LinearFilters,
  IssuesListHeader,
  LinearIssueDetail,
} from './linear-issues-view/components';
import { ImportDialog, LinearValidationDialog } from './linear-issues-view/dialogs';

/**
 * Normalize PhaseModelEntry or string to PhaseModelEntry
 */
function normalizeEntry(entry: PhaseModelEntry | string): PhaseModelEntry {
  if (typeof entry === 'string') {
    return { model: entry as ModelAlias | CursorModelId };
  }
  return entry;
}

export function LinearIssuesView() {
  const [selectedIssue, setSelectedIssue] = useState<LinearIssue | null>(null);
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set());
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Validation state
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationResult, setValidationResult] = useState<IssueValidationResult | null>(null);
  const [modelOverrideEntry, setModelOverrideEntry] = useState<PhaseModelEntry | null>(null);
  const [autoValidate, setAutoValidate] = useState(false);

  // Track which issues have been auto-validated this session
  const autoValidatedRef = useRef<Set<string>>(new Set());

  const { currentProject, phaseModels } = useAppStore();
  const navigate = useNavigate();

  // Calculate effective model entry
  const effectiveModelEntry = useMemo(() => {
    if (modelOverrideEntry) {
      return modelOverrideEntry;
    }
    return normalizeEntry(phaseModels.validationModel);
  }, [modelOverrideEntry, phaseModels.validationModel]);

  const isModelOverridden = modelOverrideEntry !== null;

  // Connection status
  const { isConnected, loading: connectionLoading, error: connectionError } = useLinearConnection();

  // Teams and projects
  const {
    teams,
    selectedTeam,
    setSelectedTeam,
    projects,
    selectedProject,
    setSelectedProject,
    loading: teamsLoading,
  } = useLinearTeams(isConnected);

  // Issues
  const {
    issues,
    loading: issuesLoading,
    refreshing,
    error: issuesError,
    filters,
    refresh,
    updateFilters,
    resetFilters,
  } = useLinearIssues({
    teamId: selectedTeam?.id || null,
    projectId: selectedProject?.id,
    enabled: isConnected && !!selectedTeam,
  });

  // Validation hook
  const { validatingIssues, cachedValidations, handleValidateIssue, handleViewCachedValidation } =
    useLinearValidation({
      selectedIssue,
      showValidationDialog,
      onValidationResultChange: setValidationResult,
      onShowValidationDialogChange: setShowValidationDialog,
    });

  // Auto-validate new issues when they are loaded
  useEffect(() => {
    if (!autoValidate || !issues.length || issuesLoading) return;

    // Find issues that haven't been validated yet and aren't currently validating
    const issuesToValidate = issues.filter((issue) => {
      const hasCache = cachedValidations.has(issue.identifier);
      const isValidating = validatingIssues.has(issue.identifier);
      const wasAutoValidated = autoValidatedRef.current.has(issue.identifier);
      return !hasCache && !isValidating && !wasAutoValidated;
    });

    // Limit concurrent validations to avoid overwhelming the API
    const MAX_CONCURRENT_AUTO_VALIDATIONS = 3;
    const toValidate = issuesToValidate.slice(0, MAX_CONCURRENT_AUTO_VALIDATIONS);

    for (const issue of toValidate) {
      autoValidatedRef.current.add(issue.identifier);
      handleValidateIssue(issue, { modelEntry: effectiveModelEntry });
    }
  }, [
    autoValidate,
    issues,
    issuesLoading,
    cachedValidations,
    validatingIssues,
    handleValidateIssue,
    effectiveModelEntry,
  ]);

  // Filter issues by search query
  const filteredIssues = useMemo(() => {
    if (!searchQuery.trim()) return issues;
    const query = searchQuery.toLowerCase();
    return issues.filter(
      (issue) =>
        issue.title.toLowerCase().includes(query) ||
        issue.identifier.toLowerCase().includes(query) ||
        issue.description?.toLowerCase().includes(query)
    );
  }, [issues, searchQuery]);

  // Separate open and closed issues
  const { openIssues, closedIssues } = useMemo(() => {
    const open: typeof filteredIssues = [];
    const closed: typeof filteredIssues = [];
    for (const issue of filteredIssues) {
      if (issue.state?.type === 'completed' || issue.state?.type === 'canceled') {
        closed.push(issue);
      } else {
        open.push(issue);
      }
    }
    return { openIssues: open, closedIssues: closed };
  }, [filteredIssues]);

  // Import
  const { importing, importIssues } = useLinearImport({
    projectPath: currentProject?.path || null,
    onSuccess: () => {
      setShowImportDialog(false);
      setSelectedIssueIds(new Set());
    },
  });

  // Get selected issues for import
  const selectedIssues = useMemo(() => {
    return filteredIssues.filter((issue) => selectedIssueIds.has(issue.id));
  }, [filteredIssues, selectedIssueIds]);

  // Handlers
  const handleOpenInLinear = useCallback((url: string) => {
    const api = getElectronAPI();
    api.openExternalLink(url);
  }, []);

  const handleIssueCheckChange = useCallback((issueId: string, checked: boolean) => {
    setSelectedIssueIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(issueId);
      } else {
        next.delete(issueId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIssueIds.size === filteredIssues.length) {
      setSelectedIssueIds(new Set());
    } else {
      setSelectedIssueIds(new Set(filteredIssues.map((i) => i.id)));
    }
  }, [filteredIssues, selectedIssueIds.size]);

  const handleGoToSettings = useCallback(() => {
    navigate({ to: '/settings' });
  }, [navigate]);

  // Validation handlers for the selected issue
  const handleValidateSelectedIssue = useCallback(
    (options?: { forceRevalidate?: boolean }) => {
      if (selectedIssue) {
        handleValidateIssue(selectedIssue, {
          ...options,
          modelEntry: effectiveModelEntry,
        });
      }
    },
    [selectedIssue, handleValidateIssue, effectiveModelEntry]
  );

  const handleViewSelectedIssueValidation = useCallback(() => {
    if (selectedIssue) {
      handleViewCachedValidation(selectedIssue);
    }
  }, [selectedIssue, handleViewCachedValidation]);

  // Loading state
  if (connectionLoading) {
    return <LoadingState />;
  }

  // Not connected state
  if (!isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="p-4 rounded-full bg-muted/50 mb-4">
          <Link2Off className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-medium mb-2">Linear Not Connected</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
          {connectionError ||
            'Configure your Linear API key in Settings to import issues from Linear.'}
        </p>
        <Button onClick={handleGoToSettings}>
          <Settings className="h-4 w-4 mr-2" />
          Go to Settings
        </Button>
      </div>
    );
  }

  // Error state
  if (issuesError) {
    return <ErrorState error={issuesError} title="Failed to Load Issues" onRetry={refresh} />;
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Issues List */}
      <div
        className={cn(
          'flex flex-col overflow-hidden border-r border-border',
          selectedIssue ? 'w-96' : 'flex-1'
        )}
      >
        {/* Header */}
        <IssuesListHeader
          totalCount={filteredIssues.length}
          selectedCount={selectedIssueIds.size}
          refreshing={refreshing}
          onRefresh={refresh}
          autoValidate={autoValidate}
          onAutoValidateChange={setAutoValidate}
        />

        {/* Filters */}
        <LinearFilters
          teams={teams}
          selectedTeam={selectedTeam}
          onTeamChange={setSelectedTeam}
          projects={projects}
          selectedProject={selectedProject}
          onProjectChange={setSelectedProject}
          filters={filters}
          onFiltersChange={updateFilters}
          onResetFilters={resetFilters}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Issues List */}
        <div className="flex-1 overflow-auto">
          {teamsLoading || issuesLoading ? (
            <div className="flex items-center justify-center h-32">
              <LoadingState />
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-2">
              {!selectedTeam ? (
                <p className="text-sm text-muted-foreground">Select a team to view issues.</p>
              ) : searchQuery.trim() ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    No issues matching "{searchQuery}" in {selectedTeam.name}.
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')}>
                    Clear search
                  </Button>
                </>
              ) : filters.stateType?.length ||
                filters.myIssuesOnly ||
                filters.includeCompleted === false ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    No issues match the current filters in {selectedTeam.name}.
                  </p>
                  <Button variant="ghost" size="sm" onClick={resetFilters}>
                    Reset filters
                  </Button>
                </>
              ) : issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Team {selectedTeam.name} has no issues, or your API key doesn't have access to
                  view them.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No issues found.</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Open Issues */}
              {openIssues.map((issue) => (
                <LinearIssueRow
                  key={issue.id}
                  issue={issue}
                  isSelected={selectedIssue?.id === issue.id}
                  isChecked={selectedIssueIds.has(issue.id)}
                  onClick={() => setSelectedIssue(issue)}
                  onCheckChange={(checked) => handleIssueCheckChange(issue.id, checked)}
                  onOpenExternal={() => handleOpenInLinear(issue.url)}
                  isValidating={validatingIssues.has(issue.identifier)}
                  cachedValidation={cachedValidations.get(issue.identifier)}
                />
              ))}

              {/* Closed Issues Section */}
              {closedIssues.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-muted/30 text-xs font-medium text-muted-foreground">
                    Closed Issues ({closedIssues.length})
                  </div>
                  {closedIssues.map((issue) => (
                    <LinearIssueRow
                      key={issue.id}
                      issue={issue}
                      isSelected={selectedIssue?.id === issue.id}
                      isChecked={selectedIssueIds.has(issue.id)}
                      onClick={() => setSelectedIssue(issue)}
                      onCheckChange={(checked) => handleIssueCheckChange(issue.id, checked)}
                      onOpenExternal={() => handleOpenInLinear(issue.url)}
                      isValidating={validatingIssues.has(issue.identifier)}
                      cachedValidation={cachedValidations.get(issue.identifier)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Import bar */}
        {selectedIssueIds.size > 0 && (
          <div className="border-t border-border p-3 flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {selectedIssueIds.size === filteredIssues.length ? 'Deselect All' : 'Select All'}
              </Button>
              <span className="text-sm text-muted-foreground">
                {selectedIssueIds.size} selected
              </span>
            </div>
            <Button onClick={() => setShowImportDialog(true)}>
              Import {selectedIssueIds.size} Issue{selectedIssueIds.size !== 1 ? 's' : ''} to Board
            </Button>
          </div>
        )}
      </div>

      {/* Issue Detail Panel */}
      {selectedIssue && (
        <LinearIssueDetail
          issue={selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onOpenInLinear={() => handleOpenInLinear(selectedIssue.url)}
          isValidating={validatingIssues.has(selectedIssue.identifier)}
          cachedValidation={cachedValidations.get(selectedIssue.identifier)}
          onValidateIssue={handleValidateSelectedIssue}
          onViewCachedValidation={handleViewSelectedIssueValidation}
          modelOverride={{
            effectiveModelEntry,
            setOverride: setModelOverrideEntry,
            isOverridden: isModelOverridden,
          }}
        />
      )}

      {/* Import Dialog */}
      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        issues={selectedIssues}
        importing={importing}
        onImport={importIssues}
      />

      {/* Validation Dialog */}
      <LinearValidationDialog
        open={showValidationDialog}
        onOpenChange={setShowValidationDialog}
        issue={selectedIssue}
        validationResult={validationResult}
      />
    </div>
  );
}
