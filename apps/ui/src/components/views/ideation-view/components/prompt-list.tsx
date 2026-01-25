/**
 * PromptList - List of prompts for a specific category
 */

import { useState, useMemo } from 'react';
import { ArrowLeft, Lightbulb, CheckCircle2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent } from '@/components/ui/card';
import { useGuidedPrompts } from '@/hooks/use-guided-prompts';
import { useIdeationStore } from '@/store/ideation-store';
import { useAppStore } from '@/store/app-store';
import { useGenerateIdeationSuggestions } from '@/hooks/mutations';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';
import type { IdeaCategory, IdeationPrompt } from '@automaker/types';

interface PromptListProps {
  category: IdeaCategory;
  onBack: () => void;
}

export function PromptList({ category, onBack }: PromptListProps) {
  const currentProject = useAppStore((s) => s.currentProject);
  const generationJobs = useIdeationStore((s) => s.generationJobs);
  const setMode = useIdeationStore((s) => s.setMode);
  const addGenerationJob = useIdeationStore((s) => s.addGenerationJob);
  const updateJobStatus = useIdeationStore((s) => s.updateJobStatus);
  const [loadingPromptId, setLoadingPromptId] = useState<string | null>(null);
  const [startedPrompts, setStartedPrompts] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  // React Query mutation
  const generateMutation = useGenerateIdeationSuggestions(currentProject?.path ?? '');
  const {
    getPromptsByCategory,
    isLoading: isLoadingPrompts,
    error: promptsError,
  } = useGuidedPrompts();

  const prompts = getPromptsByCategory(category);

  // Get jobs for current project only (memoized to prevent unnecessary re-renders)
  const projectJobs = useMemo(
    () =>
      currentProject?.path
        ? generationJobs.filter((job) => job.projectPath === currentProject.path)
        : [],
    [generationJobs, currentProject?.path]
  );

  // Check which prompts are already generating
  const generatingPromptIds = useMemo(
    () => new Set(projectJobs.filter((j) => j.status === 'generating').map((j) => j.prompt.id)),
    [projectJobs]
  );

  const handleSelectPrompt = async (prompt: IdeationPrompt) => {
    if (!currentProject?.path) {
      toast.error('No project selected');
      return;
    }

    if (loadingPromptId || generateMutation.isPending || generatingPromptIds.has(prompt.id)) return;

    setLoadingPromptId(prompt.id);

    // Add a job and navigate to dashboard
    const jobId = addGenerationJob(currentProject.path, prompt);
    setStartedPrompts((prev) => new Set(prev).add(prompt.id));

    // Show toast and navigate to dashboard
    toast.info(`Generating ideas for "${prompt.title}"...`);
    setMode('dashboard');

    generateMutation.mutate(
      { promptId: prompt.id, category },
      {
        onSuccess: (data) => {
          updateJobStatus(jobId, 'ready', data.suggestions);
          toast.success(`Generated ${data.suggestions.length} ideas for "${prompt.title}"`, {
            duration: 10000,
            action: {
              label: 'View Ideas',
              onClick: () => {
                setMode('dashboard');
                navigate({ to: '/ideation' });
              },
            },
          });
          setLoadingPromptId(null);
        },
        onError: (error) => {
          console.error('Failed to generate suggestions:', error);
          updateJobStatus(jobId, 'error', undefined, error.message);
          toast.error(error.message);
          setLoadingPromptId(null);
        },
      }
    );
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-auto">
      <div className="max-w-3xl w-full mx-auto space-y-4">
        {/* Back link */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="space-y-3">
          {isLoadingPrompts && (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
              <span className="ml-2 text-muted-foreground">Loading prompts...</span>
            </div>
          )}
          {promptsError && (
            <div className="text-center py-8 text-destructive">
              <p>Failed to load prompts: {promptsError}</p>
            </div>
          )}
          {!isLoadingPrompts &&
            !promptsError &&
            prompts.map((prompt) => {
              const isLoading = loadingPromptId === prompt.id;
              const isGenerating = generatingPromptIds.has(prompt.id);
              const isStarted = startedPrompts.has(prompt.id);
              const isDisabled = loadingPromptId !== null || isGenerating;

              return (
                <Card
                  key={prompt.id}
                  className={`group transition-all duration-300 ${
                    isDisabled
                      ? 'opacity-60 cursor-not-allowed bg-muted/50'
                      : 'cursor-pointer hover:border-primary hover:shadow-md hover:-translate-x-1'
                  } ${isLoading || isGenerating ? 'border-blue-500/50 ring-1 ring-blue-500/20 bg-blue-50/10' : ''} ${
                    isStarted && !isGenerating ? 'border-green-500/50 bg-green-50/10' : ''
                  }`}
                  onClick={() => !isDisabled && handleSelectPrompt(prompt)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-5">
                      <div
                        className={`p-3 rounded-xl shrink-0 transition-all duration-300 ${
                          isLoading || isGenerating
                            ? 'bg-blue-500/10 text-blue-500'
                            : isStarted
                              ? 'bg-green-500/10 text-green-500'
                              : 'bg-primary/10 text-primary group-hover:bg-primary/20 group-hover:scale-110'
                        }`}
                      >
                        {isLoading || isGenerating ? (
                          <Spinner size="md" />
                        ) : isStarted ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <Lightbulb className="w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                            {prompt.title}
                          </h3>
                          {isStarted && !isGenerating && (
                            <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                              Generated
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                          {prompt.description}
                        </p>
                        {(isLoading || isGenerating) && (
                          <p className="text-blue-500 text-sm font-medium animate-pulse pt-1">
                            Generating ideas...
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </div>
    </div>
  );
}
