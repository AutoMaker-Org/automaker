/**
 * IdeationPanel - Bottom dock panel for brainstorming and idea generation
 * Embeds the full ideation flow: dashboard, category selection, and prompt selection
 */

import { useState, useMemo, useCallback } from 'react';
import {
  Sparkles,
  Lightbulb,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Plus,
  X,
  ChevronRight,
  Zap,
  Palette,
  Code,
  TrendingUp,
  Cpu,
  Shield,
  Gauge,
  Accessibility,
  BarChart3,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useIdeationStore, type GenerationJob } from '@/store/ideation-store';
import { useGuidedPrompts } from '@/hooks/use-guided-prompts';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import type { IdeaCategory, IdeationPrompt, AnalysisSuggestion } from '@automaker/types';

type PanelMode = 'dashboard' | 'categories' | 'prompts';

const iconMap: Record<string, typeof Zap> = {
  Zap,
  Palette,
  Code,
  TrendingUp,
  Cpu,
  Shield,
  Gauge,
  Accessibility,
  BarChart3,
};

// Suggestion card for dashboard view
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
      <CardContent className="p-2.5">
        <div className="flex flex-col gap-2">
          {/* Title and remove button */}
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-medium text-sm leading-tight">{suggestion.title}</h4>
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
              disabled={isAdding}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
          {/* Badges */}
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-[10px] h-5">
              {suggestion.priority}
            </Badge>
            <Badge variant="secondary" className="text-[10px] h-5">
              {job.prompt.title}
            </Badge>
          </div>
          {/* Description */}
          <p className="text-xs text-muted-foreground line-clamp-2">{suggestion.description}</p>
          {/* Accept button */}
          <Button
            size="sm"
            onClick={onAccept}
            disabled={isAdding}
            className="h-7 gap-1 text-xs w-full"
          >
            {isAdding ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <>
                <Plus className="w-3 h-3" />
                Accept
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Generating card for active jobs
function GeneratingCard({ job }: { job: GenerationJob }) {
  const { removeJob } = useIdeationStore();
  const isError = job.status === 'error';

  return (
    <Card className={cn('transition-all', isError ? 'border-red-500/50' : 'border-blue-500/50')}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isError ? (
              <AlertCircle className="w-4 h-4 text-red-500" />
            ) : (
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
            )}
            <div>
              <p className="font-medium text-sm">{job.prompt.title}</p>
              <p className="text-xs text-muted-foreground">
                {isError ? job.error || 'Failed to generate' : 'Generating ideas...'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeJob(job.id)}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Dashboard view - shows generated ideas
function DashboardView({ onGenerateIdeas }: { onGenerateIdeas: () => void }) {
  const currentProject = useAppStore((s) => s.currentProject);
  const generationJobs = useIdeationStore((s) => s.generationJobs);
  const removeSuggestionFromJob = useIdeationStore((s) => s.removeSuggestionFromJob);
  const [addingId, setAddingId] = useState<string | null>(null);

  const projectJobs = useMemo(
    () =>
      currentProject?.path
        ? generationJobs.filter((job) => job.projectPath === currentProject.path)
        : [],
    [generationJobs, currentProject?.path]
  );

  const { activeJobs, readyJobs } = useMemo(() => {
    const active: GenerationJob[] = [];
    const ready: GenerationJob[] = [];

    for (const job of projectJobs) {
      if (job.status === 'generating' || job.status === 'error') {
        active.push(job);
      } else if (job.status === 'ready' && job.suggestions.length > 0) {
        ready.push(job);
      }
    }

    return { activeJobs: active, readyJobs: ready };
  }, [projectJobs]);

  const allSuggestions = useMemo(
    () => readyJobs.flatMap((job) => job.suggestions.map((suggestion) => ({ suggestion, job }))),
    [readyJobs]
  );

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

  const isEmpty = allSuggestions.length === 0 && activeJobs.length === 0;

  return (
    <div className="flex-1 overflow-auto p-3 space-y-2">
      {/* Active jobs */}
      {activeJobs.map((job) => (
        <GeneratingCard key={job.id} job={job} />
      ))}

      {/* Suggestions */}
      {allSuggestions.map(({ suggestion, job }) => (
        <SuggestionCard
          key={suggestion.id}
          suggestion={suggestion}
          job={job}
          onAccept={() => handleAccept(suggestion, job.id)}
          onRemove={() => handleRemove(suggestion.id, job.id)}
          isAdding={addingId === suggestion.id}
        />
      ))}

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Sparkles className="w-8 h-8 text-muted-foreground/50 mb-3" />
          <h3 className="text-sm font-medium mb-1">No ideas yet</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Generate ideas by selecting a category and prompt
          </p>
          <Button onClick={onGenerateIdeas} size="sm" className="gap-2">
            <Lightbulb className="w-4 h-4" />
            Generate Ideas
          </Button>
        </div>
      )}

      {/* Generate more button */}
      {!isEmpty && (
        <Button onClick={onGenerateIdeas} variant="outline" size="sm" className="w-full gap-2 mt-2">
          <Lightbulb className="w-4 h-4" />
          Generate More Ideas
        </Button>
      )}
    </div>
  );
}

// Category grid view
function CategoryGridView({
  onSelect,
  onBack,
}: {
  onSelect: (category: IdeaCategory) => void;
  onBack: () => void;
}) {
  const { categories, isLoading, error } = useGuidedPrompts();

  return (
    <div className="flex-1 overflow-auto p-3">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to dashboard</span>
      </button>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading categories...</span>
        </div>
      )}

      {error && (
        <div className="text-center py-8 text-destructive text-sm">
          <p>Failed to load categories: {error}</p>
        </div>
      )}

      {!isLoading && !error && (
        <div className="grid grid-cols-3 gap-2">
          {categories.map((category) => {
            const Icon = iconMap[category.icon] || Zap;
            return (
              <Card
                key={category.id}
                className="cursor-pointer transition-all hover:border-primary hover:shadow-sm"
                onClick={() => onSelect(category.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-primary/10">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-sm truncate">{category.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {category.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Prompt list view
function PromptListView({
  category,
  onBack,
  onDone,
}: {
  category: IdeaCategory;
  onBack: () => void;
  onDone: () => void;
}) {
  const currentProject = useAppStore((s) => s.currentProject);
  const generationJobs = useIdeationStore((s) => s.generationJobs);
  const addGenerationJob = useIdeationStore((s) => s.addGenerationJob);
  const updateJobStatus = useIdeationStore((s) => s.updateJobStatus);
  const [loadingPromptId, setLoadingPromptId] = useState<string | null>(null);
  const [startedPrompts, setStartedPrompts] = useState<Set<string>>(new Set());

  const { getPromptsByCategory, getCategoryById, isLoading, error } = useGuidedPrompts();
  const prompts = getPromptsByCategory(category);
  const categoryInfo = getCategoryById(category);

  const projectJobs = useMemo(
    () =>
      currentProject?.path
        ? generationJobs.filter((job) => job.projectPath === currentProject.path)
        : [],
    [generationJobs, currentProject?.path]
  );

  const generatingPromptIds = useMemo(
    () => new Set(projectJobs.filter((j) => j.status === 'generating').map((j) => j.prompt.id)),
    [projectJobs]
  );

  const handleSelectPrompt = async (prompt: IdeationPrompt) => {
    if (!currentProject?.path) {
      toast.error('No project selected');
      return;
    }

    if (loadingPromptId || generatingPromptIds.has(prompt.id)) return;

    setLoadingPromptId(prompt.id);
    const jobId = addGenerationJob(currentProject.path, prompt);
    setStartedPrompts((prev) => new Set(prev).add(prompt.id));

    toast.info(`Generating ideas for "${prompt.title}"...`);
    onDone(); // Navigate back to dashboard

    try {
      const api = getElectronAPI();
      const result = await api.ideation?.generateSuggestions(
        currentProject.path,
        prompt.id,
        category
      );

      if (result?.success && result.suggestions) {
        updateJobStatus(jobId, 'ready', result.suggestions);
        toast.success(`Generated ${result.suggestions.length} ideas for "${prompt.title}"`);
      } else {
        updateJobStatus(
          jobId,
          'error',
          undefined,
          result?.error || 'Failed to generate suggestions'
        );
        toast.error(result?.error || 'Failed to generate suggestions');
      }
    } catch (error) {
      console.error('Failed to generate suggestions:', error);
      updateJobStatus(jobId, 'error', undefined, (error as Error).message);
      toast.error((error as Error).message);
    } finally {
      setLoadingPromptId(null);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-3">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to categories</span>
      </button>

      {categoryInfo && (
        <p className="text-xs text-muted-foreground mb-3">
          Select a prompt from{' '}
          <span className="font-medium text-foreground">{categoryInfo.name}</span>
        </p>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading prompts...</span>
        </div>
      )}

      {error && (
        <div className="text-center py-8 text-destructive text-sm">
          <p>Failed to load prompts: {error}</p>
        </div>
      )}

      {!isLoading && !error && (
        <div className="space-y-2">
          {prompts.map((prompt) => {
            const isLoading = loadingPromptId === prompt.id;
            const isGenerating = generatingPromptIds.has(prompt.id);
            const isStarted = startedPrompts.has(prompt.id);
            const isDisabled = loadingPromptId !== null || isGenerating;

            return (
              <Card
                key={prompt.id}
                className={cn(
                  'transition-all',
                  isDisabled
                    ? 'opacity-60 cursor-not-allowed'
                    : 'cursor-pointer hover:border-primary hover:shadow-sm',
                  (isLoading || isGenerating) && 'border-blue-500 ring-1 ring-blue-500',
                  isStarted && !isGenerating && 'border-green-500/50'
                )}
                onClick={() => !isDisabled && handleSelectPrompt(prompt)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <div
                      className={cn(
                        'p-1.5 rounded-md mt-0.5',
                        isLoading || isGenerating
                          ? 'bg-blue-500/10'
                          : isStarted
                            ? 'bg-green-500/10'
                            : 'bg-primary/10'
                      )}
                    >
                      {isLoading || isGenerating ? (
                        <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                      ) : isStarted ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Lightbulb className="w-3.5 h-3.5 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm">{prompt.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {prompt.description}
                      </p>
                      {(isLoading || isGenerating) && (
                        <p className="text-blue-500 text-xs mt-1">Generating...</p>
                      )}
                      {isStarted && !isGenerating && (
                        <p className="text-green-500 text-xs mt-1">Generated - check dashboard</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function IdeationPanel() {
  const { currentProject } = useAppStore();
  const [mode, setMode] = useState<PanelMode>('dashboard');
  const [selectedCategory, setSelectedCategory] = useState<IdeaCategory | null>(null);

  const handleGenerateIdeas = useCallback(() => {
    setMode('categories');
    setSelectedCategory(null);
  }, []);

  const handleSelectCategory = useCallback((category: IdeaCategory) => {
    setSelectedCategory(category);
    setMode('prompts');
  }, []);

  const handleBackFromCategories = useCallback(() => {
    setMode('dashboard');
  }, []);

  const handleBackFromPrompts = useCallback(() => {
    setMode('categories');
    setSelectedCategory(null);
  }, []);

  const handlePromptDone = useCallback(() => {
    setMode('dashboard');
    setSelectedCategory(null);
  }, []);

  if (!currentProject) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Ideation</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Open a project to start brainstorming</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium">Ideation</span>
          {mode === 'dashboard' && (
            <span className="text-xs text-muted-foreground">- Review and accept ideas</span>
          )}
          {mode === 'categories' && (
            <span className="text-xs text-muted-foreground">- Select a category</span>
          )}
          {mode === 'prompts' && selectedCategory && (
            <span className="text-xs text-muted-foreground">- Select a prompt</span>
          )}
        </div>
        {mode === 'dashboard' && (
          <Button
            onClick={handleGenerateIdeas}
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            Generate
          </Button>
        )}
      </div>

      {/* Content */}
      {mode === 'dashboard' && <DashboardView onGenerateIdeas={handleGenerateIdeas} />}
      {mode === 'categories' && (
        <CategoryGridView onSelect={handleSelectCategory} onBack={handleBackFromCategories} />
      )}
      {mode === 'prompts' && selectedCategory && (
        <PromptListView
          category={selectedCategory}
          onBack={handleBackFromPrompts}
          onDone={handlePromptDone}
        />
      )}
    </div>
  );
}
