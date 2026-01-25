/**
 * IdeationDashboard - Main dashboard showing all generated suggestions
 * First page users see - shows all ideas ready for accept/reject
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { AlertCircle, Plus, X, Sparkles, Lightbulb, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useIdeationStore, type GenerationJob } from '@/store/ideation-store';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { AnalysisSuggestion } from '@automaker/types';

// Helper for consistent pluralization of "idea/ideas"
const pluralizeIdea = (count: number) => `idea${count !== 1 ? 's' : ''}`;

// Helper to map priority to Badge variant
const getPriorityVariant = (
  priority: string
):
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning'
  | 'error'
  | 'info' => {
  switch (priority.toLowerCase()) {
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
      return 'info';
    default:
      return 'secondary';
  }
};

interface IdeationDashboardProps {
  onGenerateIdeas: () => void;
  onAcceptAllReady?: (isReady: boolean, count: number, handler: () => Promise<void>) => void;
  onDiscardAllReady?: (isReady: boolean, count: number, handler: () => void) => void;
}

function SuggestionCard({
  suggestion,
  job,
  onAccept,
  onRemove,
  isAdding,
}: {
  suggestion: AnalysisSuggestion;
  job: GenerationJob;
  onAccept: () => void;
  onRemove: () => void;
  isAdding: boolean;
}) {
  return (
    <Card className="group transition-all hover:border-primary/50 hover:shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-4">
                <h4 className="font-semibold text-base leading-tight">{suggestion.title}</h4>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={getPriorityVariant(suggestion.priority)}
                  className="text-xs font-medium capitalize"
                >
                  {suggestion.priority}
                </Badge>
                <Badge
                  variant="secondary"
                  className="text-xs text-muted-foreground bg-secondary/40"
                >
                  {job.prompt.title}
                </Badge>
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {suggestion.description}
            </p>

            {suggestion.rationale && (
              <div className="relative pl-3 border-l-2 border-primary/20 mt-3 py-1">
                <p className="text-xs text-muted-foreground/80 italic">{suggestion.rationale}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 shrink-0 pt-1">
            <Button
              size="sm"
              onClick={onAccept}
              disabled={isAdding}
              className={cn(
                'w-full gap-1.5 shadow-none transition-all',
                isAdding ? 'opacity-80' : 'hover:ring-2 hover:ring-primary/20'
              )}
            >
              {isAdding ? (
                <Spinner size="sm" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Accept
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
              disabled={isAdding}
              className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8"
            >
              Dismiss
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GeneratingCard({ job }: { job: GenerationJob }) {
  const { removeJob } = useIdeationStore();
  const isError = job.status === 'error';

  return (
    <Card
      className={cn(
        'transition-all',
        isError ? 'border-destructive/50' : 'border-blue-500/30 bg-blue-50/5 dark:bg-blue-900/5'
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                isError ? 'bg-destructive/10 text-destructive' : 'bg-blue-500/10 text-blue-500'
              )}
            >
              {isError ? <AlertCircle className="w-5 h-5" /> : <Spinner size="md" />}
            </div>
            <div>
              <p className="font-medium">{job.prompt.title}</p>
              <p className="text-sm text-muted-foreground">
                {isError
                  ? job.error || 'Failed to generate'
                  : 'Analyzing codebase and generating ideas...'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeJob(job.id)}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TagFilter({
  tags,
  tagCounts,
  selectedTags,
  onToggleTag,
}: {
  tags: string[];
  tagCounts: Record<string, number>;
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
}) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 py-2">
      {tags.map((tag) => {
        const isSelected = selectedTags.has(tag);
        const count = tagCounts[tag] || 0;
        return (
          <button
            key={tag}
            onClick={() => onToggleTag(tag)}
            className={cn(
              'px-3.5 py-1.5 text-sm rounded-full border shadow-sm transition-all flex items-center gap-2',
              isSelected
                ? 'bg-primary text-primary-foreground border-primary ring-2 ring-primary/20'
                : 'bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground hover:bg-accent/50'
            )}
          >
            <span className="font-medium">{tag}</span>
            <span
              className={cn(
                'text-xs py-0.5 px-1.5 rounded-full',
                isSelected
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
      {selectedTags.size > 0 && <div className="h-8 w-px bg-border mx-1" />}
      {selectedTags.size > 0 && (
        <button
          onClick={() => selectedTags.forEach((tag) => onToggleTag(tag))}
          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

export function IdeationDashboard({
  onGenerateIdeas,
  onAcceptAllReady,
  onDiscardAllReady,
}: IdeationDashboardProps) {
  const currentProject = useAppStore((s) => s.currentProject);
  const generationJobs = useIdeationStore((s) => s.generationJobs);
  const removeSuggestionFromJob = useIdeationStore((s) => s.removeSuggestionFromJob);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [isAcceptingAll, setIsAcceptingAll] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Get jobs for current project only (memoized to prevent unnecessary re-renders)
  const projectJobs = useMemo(
    () =>
      currentProject?.path
        ? generationJobs.filter((job) => job.projectPath === currentProject.path)
        : [],
    [generationJobs, currentProject?.path]
  );

  // Separate jobs by status and compute counts in a single pass
  const { activeJobs, readyJobs, generatingCount } = useMemo(() => {
    const active: GenerationJob[] = [];
    const ready: GenerationJob[] = [];
    let generating = 0;

    for (const job of projectJobs) {
      if (job.status === 'generating') {
        active.push(job);
        generating++;
      } else if (job.status === 'error') {
        active.push(job);
      } else if (job.status === 'ready' && job.suggestions.length > 0) {
        ready.push(job);
      }
    }

    return { activeJobs: active, readyJobs: ready, generatingCount: generating };
  }, [projectJobs]);

  // Flatten all suggestions with their parent job
  const allSuggestions = useMemo(
    () => readyJobs.flatMap((job) => job.suggestions.map((suggestion) => ({ suggestion, job }))),
    [readyJobs]
  );

  // Extract unique tags and counts from all suggestions
  const { availableTags, tagCounts } = useMemo(() => {
    const counts: Record<string, number> = {};
    allSuggestions.forEach(({ job }) => {
      const tag = job.prompt.title;
      counts[tag] = (counts[tag] || 0) + 1;
    });
    return {
      availableTags: Object.keys(counts).sort(),
      tagCounts: counts,
    };
  }, [allSuggestions]);

  // Filter suggestions based on selected tags
  const filteredSuggestions = useMemo(() => {
    if (selectedTags.size === 0) return allSuggestions;
    return allSuggestions.filter(({ job }) => selectedTags.has(job.prompt.title));
  }, [allSuggestions, selectedTags]);

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  const handleAccept = async (suggestion: AnalysisSuggestion, jobId: string) => {
    if (!currentProject?.path) {
      toast.error('No project selected');
      return;
    }

    setAddingId(suggestion.id);

    try {
      const api = getElectronAPI();
      const result = await api.ideation?.addSuggestionToBoard(currentProject.path, suggestion);

      if (result?.success) {
        toast.success(`Added "${suggestion.title}" to board`);
        removeSuggestionFromJob(jobId, suggestion.id);
      } else {
        toast.error(result?.error || 'Failed to add to board');
      }
    } catch (error) {
      console.error('Failed to add to board:', error);
      toast.error((error as Error).message);
    } finally {
      setAddingId(null);
    }
  };

  const handleRemove = (suggestionId: string, jobId: string) => {
    removeSuggestionFromJob(jobId, suggestionId);
    toast.info('Idea removed');
  };

  // Accept all filtered suggestions
  const handleAcceptAll = useCallback(async () => {
    if (!currentProject?.path || filteredSuggestions.length === 0) {
      return;
    }

    setIsAcceptingAll(true);
    const api = getElectronAPI();
    let successCount = 0;
    let failCount = 0;

    // Process all filtered suggestions
    for (const { suggestion, job } of filteredSuggestions) {
      try {
        const result = await api.ideation?.addSuggestionToBoard(currentProject.path, suggestion);
        if (result?.success) {
          removeSuggestionFromJob(job.id, suggestion.id);
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error('Failed to add suggestion to board:', error);
        failCount++;
      }
    }

    setIsAcceptingAll(false);

    if (successCount > 0 && failCount === 0) {
      toast.success(`Added ${successCount} ${pluralizeIdea(successCount)} to board`);
    } else if (successCount > 0 && failCount > 0) {
      toast.warning(`Added ${successCount} ${pluralizeIdea(successCount)}, ${failCount} failed`);
    } else {
      toast.error('Failed to add ideas to board');
    }
  }, [currentProject?.path, filteredSuggestions, removeSuggestionFromJob]);

  // Show discard confirmation dialog
  const handleDiscardAll = useCallback(() => {
    setShowDiscardConfirm(true);
  }, []);

  // Actually discard all filtered suggestions
  const confirmDiscardAll = useCallback(() => {
    const count = filteredSuggestions.length;
    for (const { suggestion, job } of filteredSuggestions) {
      removeSuggestionFromJob(job.id, suggestion.id);
    }
    toast.info(`Discarded ${count} ${pluralizeIdea(count)}`);
  }, [filteredSuggestions, removeSuggestionFromJob]);

  // Common readiness state for bulk operations
  const bulkActionsReady = filteredSuggestions.length > 0 && !isAcceptingAll && !addingId;

  // Notify parent about accept all readiness
  useEffect(() => {
    onAcceptAllReady?.(bulkActionsReady, filteredSuggestions.length, handleAcceptAll);
  }, [bulkActionsReady, filteredSuggestions.length, handleAcceptAll, onAcceptAllReady]);

  // Notify parent about discard all readiness
  useEffect(() => {
    onDiscardAllReady?.(bulkActionsReady, filteredSuggestions.length, handleDiscardAll);
  }, [bulkActionsReady, filteredSuggestions.length, handleDiscardAll, onDiscardAllReady]);

  const isEmpty = allSuggestions.length === 0 && activeJobs.length === 0;

  return (
    <div className="flex-1 flex flex-col p-6 overflow-auto">
      <div className="max-w-3xl w-full mx-auto space-y-4">
        {/* Status text */}
        {(generatingCount > 0 || allSuggestions.length > 0) && (
          <p className="text-sm text-muted-foreground">
            {generatingCount > 0
              ? `Generating ${generatingCount} ${pluralizeIdea(generatingCount)}...`
              : selectedTags.size > 0
                ? `Showing ${filteredSuggestions.length} of ${allSuggestions.length} ${pluralizeIdea(allSuggestions.length)}`
                : `${allSuggestions.length} ${pluralizeIdea(allSuggestions.length)} ready for review`}
          </p>
        )}

        {/* Tag Filters */}
        {availableTags.length > 0 && (
          <TagFilter
            tags={availableTags}
            tagCounts={tagCounts}
            selectedTags={selectedTags}
            onToggleTag={handleToggleTag}
          />
        )}

        {/* Generating/Error Jobs */}
        {activeJobs.length > 0 && (
          <div className="space-y-3">
            {activeJobs.map((job) => (
              <GeneratingCard key={job.id} job={job} />
            ))}
          </div>
        )}

        {/* Suggestions List */}
        {filteredSuggestions.length > 0 && (
          <div className="space-y-3">
            {filteredSuggestions.map(({ suggestion, job }) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                job={job}
                onAccept={() => handleAccept(suggestion, job.id)}
                onRemove={() => handleRemove(suggestion.id, job.id)}
                isAdding={addingId === suggestion.id}
              />
            ))}
          </div>
        )}

        {/* No results after filtering */}
        {filteredSuggestions.length === 0 && allSuggestions.length > 0 && (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                <p>No ideas match the selected filters</p>
                <button
                  onClick={() => setSelectedTags(new Set())}
                  className="text-primary hover:underline mt-2"
                >
                  Clear filters
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Generate More Ideas Button - shown when there are items */}
        {!isEmpty && (
          <div className="pt-2">
            <Button onClick={onGenerateIdeas} variant="outline" className="w-full gap-2">
              <Lightbulb className="w-4 h-4" />
              Generate More Ideas
            </Button>
          </div>
        )}

        {/* Empty State */}
        {isEmpty && (
          <Card>
            <CardContent className="py-16">
              <div className="text-center">
                <Sparkles className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">No ideas yet</h3>
                <p className="text-muted-foreground mb-6">
                  Generate ideas by selecting a category and prompt type
                </p>
                <Button onClick={onGenerateIdeas} size="lg" className="gap-2">
                  <Lightbulb className="w-5 h-5" />
                  Generate Ideas
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Discard All Confirmation Dialog */}
      <ConfirmDialog
        open={showDiscardConfirm}
        onOpenChange={setShowDiscardConfirm}
        onConfirm={confirmDiscardAll}
        title="Discard All Ideas"
        description={`Are you sure you want to discard ${filteredSuggestions.length} ${pluralizeIdea(filteredSuggestions.length)}? This cannot be undone.`}
        icon={Trash2}
        iconClassName="text-destructive"
        confirmText="Discard"
        confirmVariant="destructive"
      />
    </div>
  );
}
