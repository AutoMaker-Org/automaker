import { useTranslation } from 'react-i18next';
import { Workflow, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { PhaseModelSelector } from './phase-model-selector';
import type { PhaseModelKey } from '@automaker/types';
import { DEFAULT_PHASE_MODELS } from '@automaker/types';

interface PhaseConfig {
  key: PhaseModelKey;
  labelKey: string;
  descriptionKey: string;
}

const QUICK_TASKS: PhaseConfig[] = [
  {
    key: 'enhancementModel',
    labelKey: 'sections.modelDefaults.featureEnhancement',
    descriptionKey: 'sections.modelDefaults.featureEnhancementDescription',
  },
  {
    key: 'fileDescriptionModel',
    labelKey: 'sections.modelDefaults.fileDescriptions',
    descriptionKey: 'sections.modelDefaults.fileDescriptionsDescription',
  },
  {
    key: 'imageDescriptionModel',
    labelKey: 'sections.modelDefaults.imageDescriptions',
    descriptionKey: 'sections.modelDefaults.imageDescriptionsDescription',
  },
  {
    key: 'commitMessageModel',
    labelKey: 'sections.modelDefaults.commitMessages',
    descriptionKey: 'sections.modelDefaults.commitMessagesDescription',
  },
];

const VALIDATION_TASKS: PhaseConfig[] = [
  {
    key: 'validationModel',
    labelKey: 'sections.modelDefaults.githubIssueValidation',
    descriptionKey: 'sections.modelDefaults.githubIssueValidationDescription',
  },
];

const GENERATION_TASKS: PhaseConfig[] = [
  {
    key: 'specGenerationModel',
    labelKey: 'sections.modelDefaults.appSpecification',
    descriptionKey: 'sections.modelDefaults.appSpecificationDescription',
  },
  {
    key: 'featureGenerationModel',
    labelKey: 'sections.modelDefaults.featureGeneration',
    descriptionKey: 'sections.modelDefaults.featureGenerationDescription',
  },
  {
    key: 'backlogPlanningModel',
    labelKey: 'sections.modelDefaults.backlogPlanning',
    descriptionKey: 'sections.modelDefaults.backlogPlanningDescription',
  },
  {
    key: 'projectAnalysisModel',
    labelKey: 'sections.modelDefaults.projectAnalysis',
    descriptionKey: 'sections.modelDefaults.projectAnalysisDescription',
  },
  {
    key: 'suggestionsModel',
    labelKey: 'sections.modelDefaults.aiSuggestions',
    descriptionKey: 'sections.modelDefaults.aiSuggestionsDescription',
  },
];

const MEMORY_TASKS: PhaseConfig[] = [
  {
    key: 'memoryExtractionModel',
    labelKey: 'sections.modelDefaults.memoryExtraction',
    descriptionKey: 'sections.modelDefaults.memoryExtractionDescription',
  },
];

function PhaseGroup({
  titleKey,
  subtitleKey,
  phases,
}: {
  titleKey: string;
  subtitleKey: string;
  phases: PhaseConfig[];
}) {
  const { t } = useTranslation('settings');
  const { phaseModels, setPhaseModel } = useAppStore();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">{t(titleKey)}</h3>
        <p className="text-xs text-muted-foreground">{t(subtitleKey)}</p>
      </div>
      <div className="space-y-3">
        {phases.map((phase) => (
          <PhaseModelSelector
            key={phase.key}
            label={t(phase.labelKey)}
            description={t(phase.descriptionKey)}
            value={phaseModels[phase.key] ?? DEFAULT_PHASE_MODELS[phase.key]}
            onChange={(model) => setPhaseModel(phase.key, model)}
          />
        ))}
      </div>
    </div>
  );
}

export function ModelDefaultsSection() {
  const { t } = useTranslation('settings');
  const { resetPhaseModels } = useAppStore();

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
                {t('sections.modelDefaults.title')}
              </h2>
              <p className="text-sm text-muted-foreground/80">
                {t('sections.modelDefaults.description')}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={resetPhaseModels} className="gap-2">
            <RotateCcw className="w-3.5 h-3.5" />
            {t('sections.modelDefaults.resetToDefaults')}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-8">
        {/* Quick Tasks */}
        <PhaseGroup
          titleKey="sections.modelDefaults.quickTasks"
          subtitleKey="sections.modelDefaults.quickTasksSubtitle"
          phases={QUICK_TASKS}
        />

        {/* Validation Tasks */}
        <PhaseGroup
          titleKey="sections.modelDefaults.validationTasks"
          subtitleKey="sections.modelDefaults.validationTasksSubtitle"
          phases={VALIDATION_TASKS}
        />

        {/* Generation Tasks */}
        <PhaseGroup
          titleKey="sections.modelDefaults.generationTasks"
          subtitleKey="sections.modelDefaults.generationTasksSubtitle"
          phases={GENERATION_TASKS}
        />

        {/* Memory Tasks */}
        <PhaseGroup
          titleKey="sections.modelDefaults.memoryTasks"
          subtitleKey="sections.modelDefaults.memoryTasksSubtitle"
          phases={MEMORY_TASKS}
        />
      </div>
    </div>
  );
}
