/**
 * IdeationDashboard - Main dashboard showing all generated suggestions
 * First page users see - shows all ideas ready for accept/reject
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, Plus, X, Sparkles, Lightbulb } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useIdeationStore, type GenerationJob } from '@/store/ideation-store';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { AnalysisSuggestion } from '@automaker/types';

interface IdeationDashboardProps {
  onGenerateIdeas: () => void;
  onAcceptAllReady?: (isReady: boolean, count: number, handler: () => Promise<void>) => void;
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
    <Card className="transition-all hover:border-primary/50">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-1">
              <h4 className="font-medium shrink-0">{suggestion.title}</h4>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs whitespace-nowrap">
                  {suggestion.priority}
                </Badge>
                <Badge variant="secondary" className="text-xs whitespace-nowrap">
                  {job.prompt.title}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{suggestion.description}</p>
            {suggestion.rationale && (
              <p className="text-xs text-muted-foreground mt-2 italic">{suggestion.rationale}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
              disabled={isAdding}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={onAccept} disabled={isAdding} className="gap-1">
              {isAdding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Accept
                </>
              )}
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
    <Card className={cn('transition-all', isError ? 'border-red-500/50' : 'border-blue-500/50')}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isError ? (
              <AlertCircle className="w-5 h-5 text-red-500" />
            ) : (
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            )}
            <div>
              <p className="font-medium">{job.prompt.title}</p>
              <p className="text-sm text-muted-foreground">
                {isError ? job.error || 'Failed to generate' : 'Generating ideas...'}
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
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const isSelected = selectedTags.has(tag);
        const count = tagCounts[tag] || 0;
        return (
          <button
            key={tag}
            onClick={() => onToggleTag(tag)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-full border transition-all flex items-center gap-1.5',
              isSelected
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
            )}
          >
            {tag}
            <span
              className={cn(
                'text-xs',
                isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground/70'
              )}
            >
              ({count})
            </span>
          </button>
        );
      })}
      {selectedTags.size > 0 && (
        <button
          onClick={() => selectedTags.forEach((tag) => onToggleTag(tag))}
          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

export function IdeationDashboard({ onGenerateIdeas, onAcceptAllReady }: IdeationDashboardProps) {
  const currentProject = useAppStore((s) => s.currentProject);
  const generationJobs = useIdeationStore((s) => s.generationJobs);
  const removeSuggestionFromJob = useIdeationStore((s) => s.removeSuggestionFromJob);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [isAcceptingAll, setIsAcceptingAll] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

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
      toast.success(`Added ${successCount} idea${successCount > 1 ? 's' : ''} to board`);
    } else if (successCount > 0 && failCount > 0) {
      toast.warning(
        `Added ${successCount} idea${successCount > 1 ? 's' : ''}, ${failCount} failed`
      );
    } else {
      toast.error('Failed to add ideas to board');
    }
  }, [currentProject?.path, filteredSuggestions, removeSuggestionFromJob]);

  // Notify parent about accept all readiness
  useEffect(() => {
    if (onAcceptAllReady) {
      const isReady = filteredSuggestions.length > 0 && !isAcceptingAll && !addingId;
      onAcceptAllReady(isReady, filteredSuggestions.length, handleAcceptAll);
    }
  }, [filteredSuggestions.length, isAcceptingAll, addingId, handleAcceptAll, onAcceptAllReady]);

  const isEmpty = allSuggestions.length === 0 && activeJobs.length === 0;

  return (
    <div className="flex-1 flex flex-col p-6 overflow-auto">
      <div className="max-w-3xl w-full mx-auto space-y-4">
        {/* Status text */}
        {(generatingCount > 0 || allSuggestions.length > 0) && (
          <p className="text-sm text-muted-foreground">
            {generatingCount > 0
              ? `Generating ${generatingCount} idea${generatingCount > 1 ? 's' : ''}...`
              : selectedTags.size > 0
                ? `Showing ${filteredSuggestions.length} of ${allSuggestions.length} ideas`
                : `${allSuggestions.length} idea${allSuggestions.length > 1 ? 's' : ''} ready for review`}
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
    </div>
  );
}
