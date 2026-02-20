import { useState } from 'react';
import { Workflow, RotateCcw, Replace, Sparkles, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { PhaseModelSelector } from './phase-model-selector';
import { BulkReplaceDialog } from './bulk-replace-dialog';
import type { PhaseModelKey, PhaseModelEntry, ThinkingLevel } from '@automaker/types';
import {
  DEFAULT_PHASE_MODELS,
  DEFAULT_GLOBAL_SETTINGS,
  REASONING_EFFORT_LEVELS,
} from '@automaker/types';

interface PhaseConfig {
  key: PhaseModelKey;
  label: string;
  description: string;
}

const QUICK_TASKS: PhaseConfig[] = [
  {
    key: 'enhancementModel',
    label: 'Feature Enhancement',
    description: 'Improves feature names and descriptions',
  },
  {
    key: 'fileDescriptionModel',
    label: 'File Descriptions',
    description: 'Generates descriptions for context files',
  },
  {
    key: 'imageDescriptionModel',
    label: 'Image Descriptions',
    description: 'Analyzes and describes context images',
  },
  {
    key: 'commitMessageModel',
    label: 'Commit Messages',
    description: 'Generates git commit messages from diffs',
  },
];

const VALIDATION_TASKS: PhaseConfig[] = [
  {
    key: 'validationModel',
    label: 'GitHub Issue Validation',
    description: 'Validates and improves GitHub issues',
  },
];

const GENERATION_TASKS: PhaseConfig[] = [
  {
    key: 'specGenerationModel',
    label: 'App Specification',
    description: 'Generates full application specifications',
  },
  {
    key: 'featureGenerationModel',
    label: 'Feature Generation',
    description: 'Creates features from specifications',
  },
  {
    key: 'backlogPlanningModel',
    label: 'Backlog Planning',
    description: 'Reorganizes and prioritizes backlog',
  },
  {
    key: 'projectAnalysisModel',
    label: 'Project Analysis',
    description: 'Analyzes project structure for suggestions',
  },
  {
    key: 'ideationModel',
    label: 'Ideation',
    description: 'Model for ideation view (generating AI suggestions)',
  },
];

const MEMORY_TASKS: PhaseConfig[] = [
  {
    key: 'memoryExtractionModel',
    label: 'Memory Extraction',
    description: 'Extracts learnings from completed agent sessions',
  },
];

function PhaseGroup({
  title,
  subtitle,
  phases,
}: {
  title: string;
  subtitle: string;
  phases: PhaseConfig[];
}) {
  const { phaseModels, setPhaseModel } = useAppStore();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="space-y-3">
        {phases.map((phase) => (
          <PhaseModelSelector
            key={phase.key}
            label={phase.label}
            description={phase.description}
            value={phaseModels[phase.key] ?? DEFAULT_PHASE_MODELS[phase.key]}
            onChange={(model) => setPhaseModel(phase.key, model)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Default model for new feature cards section.
 * This is separate from phase models but logically belongs with model configuration.
 */
function FeatureDefaultModelSection() {
  const { defaultFeatureModel, setDefaultFeatureModel } = useAppStore();
  const defaultValue: PhaseModelEntry =
    defaultFeatureModel ?? DEFAULT_GLOBAL_SETTINGS.defaultFeatureModel;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">Feature Defaults</h3>
        <p className="text-xs text-muted-foreground">
          Default model for new feature cards when created
        </p>
      </div>
      <div className="space-y-3">
        <div
          className={cn(
            'flex items-center justify-between p-4 rounded-xl',
            'bg-accent/20 border border-border/30',
            'hover:bg-accent/30 transition-colors'
          )}
        >
          <div className="flex items-center gap-3 flex-1 pr-4">
            <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-brand-500" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-foreground">Default Feature Model</h4>
              <p className="text-xs text-muted-foreground">
                Model and thinking level used when creating new feature cards
              </p>
            </div>
          </div>
          <PhaseModelSelector
            compact
            value={defaultValue}
            onChange={setDefaultFeatureModel}
            align="end"
          />
        </div>
      </div>
    </div>
  );
}

// Thinking level options with descriptions for the settings UI
const THINKING_LEVEL_OPTIONS: { id: ThinkingLevel; label: string; description: string }[] = [
  { id: 'none', label: 'None', description: 'No extended thinking' },
  { id: 'low', label: 'Low', description: 'Light reasoning (1k tokens)' },
  { id: 'medium', label: 'Medium', description: 'Moderate reasoning (10k tokens)' },
  { id: 'high', label: 'High', description: 'Deep reasoning (16k tokens)' },
  { id: 'ultrathink', label: 'Ultra', description: 'Maximum reasoning (32k tokens)' },
  { id: 'adaptive', label: 'Adaptive', description: 'Model decides reasoning depth' },
];

/**
 * Default thinking level / reasoning effort section.
 * These defaults are applied when selecting a model via the primary button
 * in the two-stage model selector (i.e. clicking the model name directly).
 */
function DefaultThinkingLevelSection() {
  const {
    defaultThinkingLevel,
    setDefaultThinkingLevel,
    defaultReasoningEffort,
    setDefaultReasoningEffort,
  } = useAppStore();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">Quick-Select Defaults</h3>
        <p className="text-xs text-muted-foreground">
          Thinking/reasoning level applied when quick-selecting a model from the dropdown. You can
          always fine-tune per model via the expand arrow.
        </p>
      </div>
      <div className="space-y-3">
        {/* Default Thinking Level (Claude models) */}
        <div
          className={cn(
            'flex items-center justify-between p-4 rounded-xl',
            'bg-accent/20 border border-border/30',
            'hover:bg-accent/30 transition-colors'
          )}
        >
          <div className="flex items-center gap-3 flex-1 pr-4">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Brain className="w-4 h-4 text-purple-500" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-foreground">Default Thinking Level</h4>
              <p className="text-xs text-muted-foreground">
                Applied to Claude models when quick-selected
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {THINKING_LEVEL_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => setDefaultThinkingLevel(option.id)}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                  'border',
                  defaultThinkingLevel === option.id
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background border-border/50 text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
                title={option.description}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Default Reasoning Effort (Codex models) */}
        <div
          className={cn(
            'flex items-center justify-between p-4 rounded-xl',
            'bg-accent/20 border border-border/30',
            'hover:bg-accent/30 transition-colors'
          )}
        >
          <div className="flex items-center gap-3 flex-1 pr-4">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Brain className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-foreground">Default Reasoning Effort</h4>
              <p className="text-xs text-muted-foreground">
                Applied to Codex/OpenAI models when quick-selected
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {REASONING_EFFORT_LEVELS.map((option) => (
              <button
                key={option.id}
                onClick={() => setDefaultReasoningEffort(option.id)}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                  'border',
                  defaultReasoningEffort === option.id
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background border-border/50 text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
                title={option.description}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModelDefaultsSection() {
  const { resetPhaseModels, claudeCompatibleProviders } = useAppStore();
  const [showBulkReplace, setShowBulkReplace] = useState(false);

  // Check if there are any enabled ClaudeCompatibleProviders
  const hasEnabledProviders =
    claudeCompatibleProviders && claudeCompatibleProviders.some((p) => p.enabled !== false);

  return (
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
              <Workflow className="w-5 h-5 text-brand-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                Model Defaults
              </h2>
              <p className="text-sm text-muted-foreground/80">
                Configure which AI model to use for each application task
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasEnabledProviders && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkReplace(true)}
                className="gap-2"
              >
                <Replace className="w-3.5 h-3.5" />
                Bulk Replace
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={resetPhaseModels} className="gap-2">
              <RotateCcw className="w-3.5 h-3.5" />
              Reset to Defaults
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk Replace Dialog */}
      <BulkReplaceDialog open={showBulkReplace} onOpenChange={setShowBulkReplace} />

      {/* Content */}
      <div className="p-6 space-y-8">
        {/* Feature Defaults */}
        <FeatureDefaultModelSection />

        {/* Default Thinking Level / Reasoning Effort */}
        <DefaultThinkingLevelSection />

        {/* Quick Tasks */}
        <PhaseGroup
          title="Quick Tasks"
          subtitle="Fast models recommended for speed and cost savings"
          phases={QUICK_TASKS}
        />

        {/* Validation Tasks */}
        <PhaseGroup
          title="Validation Tasks"
          subtitle="Smart models recommended for accuracy"
          phases={VALIDATION_TASKS}
        />

        {/* Generation Tasks */}
        <PhaseGroup
          title="Generation Tasks"
          subtitle="Powerful models recommended for quality output"
          phases={GENERATION_TASKS}
        />

        {/* Memory Tasks */}
        <PhaseGroup
          title="Memory Tasks"
          subtitle="Fast models recommended for learning extraction"
          phases={MEMORY_TASKS}
        />
      </div>
    </div>
  );
}
