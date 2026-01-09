/**
 * PromptList - List of prompts for a specific category
 */

import { useState, useMemo } from 'react';
import { ArrowLeft, Lightbulb, Loader2, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useGuidedPrompts } from '@/hooks/use-guided-prompts';
import { useIdeationStore } from '@/store/ideation-store';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
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

    if (loadingPromptId || generatingPromptIds.has(prompt.id)) return;

    setLoadingPromptId(prompt.id);

    // Add a job and navigate to dashboard
    const jobId = addGenerationJob(currentProject.path, prompt);
    setStartedPrompts((prev) => new Set(prev).add(prompt.id));

    // Show toast and navigate to dashboard
    toast.info(`Generating ideas for "${prompt.title}"...`);
    setMode('dashboard');

    try {
      const api = getElectronAPI();
      const result = await api.ideation?.generateSuggestions(
        currentProject.path,
        prompt.id,
        category
      );

      if (result?.success && result.suggestions) {
        updateJobStatus(jobId, 'ready', result.suggestions);
        toast.success(`Generated ${result.suggestions.length} ideas for "${prompt.title}"`, {
          duration: 10000,
          action: {
            label: 'View Ideas',
            onClick: () => {
              setMode('dashboard');
              navigate({ to: '/ideation' });
            },
          },
        });
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
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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
                  className={`transition-all ${
                    isDisabled
                      ? 'opacity-60 cursor-not-allowed'
                      : 'cursor-pointer hover:border-primary hover:shadow-md'
                  } ${isLoading || isGenerating ? 'border-blue-500 ring-1 ring-blue-500' : ''} ${
                    isStarted && !isGenerating ? 'border-green-500/50' : ''
                  }`}
                  onClick={() => !isDisabled && handleSelectPrompt(prompt)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div
                        className={`p-2 rounded-lg mt-0.5 ${
                          isLoading || isGenerating
                            ? 'bg-blue-500/10'
                            : isStarted
                              ? 'bg-green-500/10'
                              : 'bg-primary/10'
                        }`}
                      >
                        {isLoading || isGenerating ? (
                          <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                        ) : isStarted ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <Lightbulb className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold">{prompt.title}</h3>
                        <p className="text-muted-foreground text-sm mt-1">{prompt.description}</p>
                        {(isLoading || isGenerating) && (
                          <p className="text-blue-500 text-sm mt-2">Generating in dashboard...</p>
                        )}
                        {isStarted && !isGenerating && (
                          <p className="text-green-500 text-sm mt-2">
                            Already generated - check dashboard
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
