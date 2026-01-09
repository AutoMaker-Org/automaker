/**
 * Ideation Store - State management for brainstorming and idea management
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Idea,
  IdeaCategory,
  IdeaStatus,
  IdeationPrompt,
  AnalysisSuggestion,
  ProjectAnalysisResult,
} from '@automaker/types';

// ============================================================================
// Generation Job Types
// ============================================================================

export type GenerationJobStatus = 'generating' | 'ready' | 'error';

export interface GenerationJob {
  id: string;
  projectPath: string;
  prompt: IdeationPrompt;
  status: GenerationJobStatus;
  suggestions: AnalysisSuggestion[];
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

// ============================================================================
// State Interface
// ============================================================================

export type IdeationMode = 'dashboard' | 'prompts';

interface IdeationState {
  // Ideas (saved for later)
  ideas: Idea[];
  selectedIdeaId: string | null;

  // Generation jobs (multiple concurrent generations)
  generationJobs: GenerationJob[];
  selectedJobId: string | null;

  // Legacy - keep for backwards compat during transition
  suggestions: AnalysisSuggestion[];
  selectedPrompt: IdeationPrompt | null;
  isGenerating: boolean;
  generatingError: string | null;

  // Analysis
  analysisResult: ProjectAnalysisResult | null;
  isAnalyzing: boolean;
  analysisProgress: number;
  analysisMessage: string;

  // UI state
  currentMode: IdeationMode;
  selectedCategory: IdeaCategory | null;
  filterStatus: IdeaStatus | 'all';
}

// ============================================================================
// Actions Interface
// ============================================================================

interface IdeationActions {
  // Ideas
  setIdeas: (ideas: Idea[]) => void;
  addIdea: (idea: Idea) => void;
  updateIdea: (id: string, updates: Partial<Idea>) => void;
  removeIdea: (id: string) => void;
  setSelectedIdea: (id: string | null) => void;
  getSelectedIdea: () => Idea | null;

  // Generation Jobs
  addGenerationJob: (projectPath: string, prompt: IdeationPrompt) => string;
  updateJobStatus: (
    jobId: string,
    status: GenerationJobStatus,
    suggestions?: AnalysisSuggestion[],
    error?: string
  ) => void;
  removeJob: (jobId: string) => void;
  clearCompletedJobs: () => void;
  setSelectedJob: (jobId: string | null) => void;
  getJob: (jobId: string) => GenerationJob | null;
  removeSuggestionFromJob: (jobId: string, suggestionId: string) => void;
  appendSuggestionsToJob: (jobId: string, suggestions: AnalysisSuggestion[]) => void;
  setJobGenerating: (jobId: string, generating: boolean) => void;

  // Legacy Suggestions (kept for backwards compat)
  setSuggestions: (suggestions: AnalysisSuggestion[]) => void;
  clearSuggestions: () => void;
  removeSuggestion: (id: string) => void;
  setSelectedPrompt: (prompt: IdeationPrompt | null) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setGeneratingError: (error: string | null) => void;

  // Analysis
  setAnalysisResult: (result: ProjectAnalysisResult | null) => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setAnalysisProgress: (progress: number, message?: string) => void;

  // UI
  setMode: (mode: IdeationMode) => void;
  setCategory: (category: IdeaCategory | null) => void;
  setFilterStatus: (status: IdeaStatus | 'all') => void;

  // Reset
  reset: () => void;
  resetSuggestions: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: IdeationState = {
  ideas: [],
  selectedIdeaId: null,
  generationJobs: [],
  selectedJobId: null,
  suggestions: [],
  selectedPrompt: null,
  isGenerating: false,
  generatingError: null,
  analysisResult: null,
  isAnalyzing: false,
  analysisProgress: 0,
  analysisMessage: '',
  currentMode: 'dashboard',
  selectedCategory: null,
  filterStatus: 'all',
};

// ============================================================================
// Store
// ============================================================================

export const useIdeationStore = create<IdeationState & IdeationActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Ideas
      setIdeas: (ideas) => set({ ideas }),

      addIdea: (idea) =>
        set((state) => ({
          ideas: [idea, ...state.ideas],
        })),

      updateIdea: (id, updates) =>
        set((state) => ({
          ideas: state.ideas.map((idea) => (idea.id === id ? { ...idea, ...updates } : idea)),
        })),

      removeIdea: (id) =>
        set((state) => ({
          ideas: state.ideas.filter((idea) => idea.id !== id),
          selectedIdeaId: state.selectedIdeaId === id ? null : state.selectedIdeaId,
        })),

      setSelectedIdea: (id) => set({ selectedIdeaId: id }),

      getSelectedIdea: () => {
        const state = get();
        return state.ideas.find((idea) => idea.id === state.selectedIdeaId) || null;
      },

      // Generation Jobs
      addGenerationJob: (projectPath, prompt) => {
        const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const job: GenerationJob = {
          id: jobId,
          projectPath,
          prompt,
          status: 'generating',
          suggestions: [],
          error: null,
          startedAt: new Date().toISOString(),
          completedAt: null,
        };
        set((state) => ({
          generationJobs: [job, ...state.generationJobs],
        }));
        return jobId;
      },

      updateJobStatus: (jobId, status, suggestions, error) =>
        set((state) => ({
          generationJobs: state.generationJobs.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  status,
                  suggestions: suggestions || job.suggestions,
                  error: error || null,
                  completedAt: status !== 'generating' ? new Date().toISOString() : null,
                }
              : job
          ),
        })),

      removeJob: (jobId) =>
        set((state) => ({
          generationJobs: state.generationJobs.filter((job) => job.id !== jobId),
          selectedJobId: state.selectedJobId === jobId ? null : state.selectedJobId,
        })),

      clearCompletedJobs: () =>
        set((state) => ({
          generationJobs: state.generationJobs.filter((job) => job.status === 'generating'),
        })),

      setSelectedJob: (jobId) => set({ selectedJobId: jobId }),

      getJob: (jobId) => {
        const state = get();
        return state.generationJobs.find((job) => job.id === jobId) || null;
      },

      removeSuggestionFromJob: (jobId, suggestionId) =>
        set((state) => ({
          generationJobs: state.generationJobs.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  suggestions: job.suggestions.filter((s) => s.id !== suggestionId),
                }
              : job
          ),
        })),

      appendSuggestionsToJob: (jobId, suggestions) =>
        set((state) => ({
          generationJobs: state.generationJobs.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  suggestions: [...job.suggestions, ...suggestions],
                  status: 'ready' as const,
                }
              : job
          ),
        })),

      setJobGenerating: (jobId, generating) =>
        set((state) => ({
          generationJobs: state.generationJobs.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  status: generating ? ('generating' as const) : ('ready' as const),
                }
              : job
          ),
        })),

      // Suggestions (legacy)
      setSuggestions: (suggestions) => set({ suggestions }),

      clearSuggestions: () => set({ suggestions: [], generatingError: null }),

      removeSuggestion: (id) =>
        set((state) => ({
          suggestions: state.suggestions.filter((s) => s.id !== id),
        })),

      setSelectedPrompt: (prompt) => set({ selectedPrompt: prompt }),

      setIsGenerating: (isGenerating) => set({ isGenerating }),

      setGeneratingError: (error) => set({ generatingError: error }),

      // Analysis
      setAnalysisResult: (result) => set({ analysisResult: result }),

      setIsAnalyzing: (isAnalyzing) =>
        set({
          isAnalyzing,
          analysisProgress: isAnalyzing ? 0 : get().analysisProgress,
          analysisMessage: isAnalyzing ? 'Starting analysis...' : '',
        }),

      setAnalysisProgress: (progress, message) =>
        set({
          analysisProgress: progress,
          analysisMessage: message || get().analysisMessage,
        }),

      // UI
      setMode: (mode) => set({ currentMode: mode }),

      setCategory: (category) => set({ selectedCategory: category }),

      setFilterStatus: (status) => set({ filterStatus: status }),

      // Reset
      reset: () => set(initialState),

      resetSuggestions: () =>
        set({
          suggestions: [],
          selectedPrompt: null,
          isGenerating: false,
          generatingError: null,
        }),
    }),
    {
      name: 'automaker-ideation-store',
      version: 4,
      partialize: (state) => ({
        // Only persist these fields
        ideas: state.ideas,
        generationJobs: state.generationJobs,
        analysisResult: state.analysisResult,
        filterStatus: state.filterStatus,
      }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;
        if (version < 4) {
          // Remove legacy jobs that don't have projectPath (from before project-scoping was added)
          const jobs = (state.generationJobs as GenerationJob[]) || [];
          return {
            ...state,
            generationJobs: jobs.filter((job) => job.projectPath !== undefined),
          };
        }
        return state;
      },
    }
  )
);
