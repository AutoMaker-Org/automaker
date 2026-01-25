import { useState, useMemo } from 'react';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowRight, Cloud, Server, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Project } from '@/lib/electron';
import type {
  PhaseModelKey,
  PhaseModelEntry,
  ClaudeCompatibleProvider,
  ClaudeModelAlias,
} from '@automaker/types';
import { DEFAULT_PHASE_MODELS } from '@automaker/types';

interface ProjectBulkReplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}

// Phase display names for preview
const PHASE_LABELS: Record<PhaseModelKey, string> = {
  enhancementModel: 'Feature Enhancement',
  fileDescriptionModel: 'File Descriptions',
  imageDescriptionModel: 'Image Descriptions',
  commitMessageModel: 'Commit Messages',
  validationModel: 'GitHub Issue Validation',
  specGenerationModel: 'App Specification',
  featureGenerationModel: 'Feature Generation',
  backlogPlanningModel: 'Backlog Planning',
  projectAnalysisModel: 'Project Analysis',
  suggestionsModel: 'AI Suggestions',
  memoryExtractionModel: 'Memory Extraction',
};

const ALL_PHASES = Object.keys(PHASE_LABELS) as PhaseModelKey[];

// Claude model display names
const CLAUDE_MODEL_DISPLAY: Record<ClaudeModelAlias, string> = {
  haiku: 'Claude Haiku',
  sonnet: 'Claude Sonnet',
  opus: 'Claude Opus',
};

export function ProjectBulkReplaceDialog({
  open,
  onOpenChange,
  project,
}: ProjectBulkReplaceDialogProps) {
  const { phaseModels, setProjectPhaseModelOverride, claudeCompatibleProviders } = useAppStore();
  const [selectedProvider, setSelectedProvider] = useState<string>('anthropic');

  // Get project-level overrides
  const projectOverrides = project.phaseModelOverrides || {};

  // Get enabled providers
  const enabledProviders = useMemo(() => {
    return (claudeCompatibleProviders || []).filter((p) => p.enabled !== false);
  }, [claudeCompatibleProviders]);

  // Build provider options for the dropdown
  const providerOptions = useMemo(() => {
    const options: Array<{ id: string; name: string; isNative: boolean }> = [
      { id: 'anthropic', name: 'Anthropic Direct', isNative: true },
    ];

    enabledProviders.forEach((provider) => {
      options.push({
        id: provider.id,
        name: provider.name,
        isNative: false,
      });
    });

    return options;
  }, [enabledProviders]);

  // Get the selected provider config (if custom)
  const selectedProviderConfig = useMemo(() => {
    if (selectedProvider === 'anthropic') return null;
    return enabledProviders.find((p) => p.id === selectedProvider);
  }, [selectedProvider, enabledProviders]);

  // Get the Claude model alias from a PhaseModelEntry
  const getClaudeModelAlias = (entry: PhaseModelEntry): ClaudeModelAlias => {
    // Check if model string directly matches a Claude alias
    if (entry.model === 'haiku' || entry.model === 'claude-haiku') return 'haiku';
    if (entry.model === 'sonnet' || entry.model === 'claude-sonnet') return 'sonnet';
    if (entry.model === 'opus' || entry.model === 'claude-opus') return 'opus';

    // If it's a provider model, look up the mapping
    if (entry.providerId) {
      const provider = enabledProviders.find((p) => p.id === entry.providerId);
      if (provider) {
        const model = provider.models?.find((m) => m.id === entry.model);
        if (model?.mapsToClaudeModel) {
          return model.mapsToClaudeModel;
        }
      }
    }

    // Default to sonnet
    return 'sonnet';
  };

  // Find the model from provider that maps to a specific Claude model
  const findModelForClaudeAlias = (
    provider: ClaudeCompatibleProvider | null,
    claudeAlias: ClaudeModelAlias,
    phase: PhaseModelKey
  ): PhaseModelEntry => {
    if (!provider) {
      // Anthropic Direct - reset to default phase model (includes correct thinking levels)
      return DEFAULT_PHASE_MODELS[phase];
    }

    // Find model that maps to this Claude alias
    const models = provider.models || [];
    const match = models.find((m) => m.mapsToClaudeModel === claudeAlias);

    if (match) {
      return { providerId: provider.id, model: match.id };
    }

    // Fallback: use first model if no match
    if (models.length > 0) {
      return { providerId: provider.id, model: models[0].id };
    }

    // Ultimate fallback to native Claude model
    return { model: claudeAlias };
  };

  // Generate preview of changes
  const preview = useMemo(() => {
    return ALL_PHASES.map((phase) => {
      // Current effective value (project override or global)
      const globalEntry = phaseModels[phase] ?? DEFAULT_PHASE_MODELS[phase];
      const currentEntry = projectOverrides[phase] || globalEntry;
      const claudeAlias = getClaudeModelAlias(currentEntry);
      const newEntry = findModelForClaudeAlias(selectedProviderConfig, claudeAlias, phase);

      // Get display names
      const getCurrentDisplay = (): string => {
        if (currentEntry.providerId) {
          const provider = enabledProviders.find((p) => p.id === currentEntry.providerId);
          if (provider) {
            const model = provider.models?.find((m) => m.id === currentEntry.model);
            return model?.displayName || currentEntry.model;
          }
        }
        return CLAUDE_MODEL_DISPLAY[claudeAlias] || currentEntry.model;
      };

      const getNewDisplay = (): string => {
        if (newEntry.providerId && selectedProviderConfig) {
          const model = selectedProviderConfig.models?.find((m) => m.id === newEntry.model);
          return model?.displayName || newEntry.model;
        }
        return CLAUDE_MODEL_DISPLAY[newEntry.model as ClaudeModelAlias] || newEntry.model;
      };

      const isChanged =
        currentEntry.model !== newEntry.model ||
        currentEntry.providerId !== newEntry.providerId ||
        currentEntry.thinkingLevel !== newEntry.thinkingLevel;

      return {
        phase,
        label: PHASE_LABELS[phase],
        claudeAlias,
        currentDisplay: getCurrentDisplay(),
        newDisplay: getNewDisplay(),
        newEntry,
        isChanged,
      };
    });
  }, [phaseModels, projectOverrides, selectedProviderConfig, enabledProviders]);

  // Count how many will change
  const changeCount = preview.filter((p) => p.isChanged).length;

  // Apply the bulk replace as project overrides
  const handleApply = () => {
    preview.forEach(({ phase, newEntry, isChanged }) => {
      if (isChanged) {
        setProjectPhaseModelOverride(project.id, phase, newEntry);
      }
    });
    onOpenChange(false);
  };

  // Check if provider has all 3 Claude model mappings
  const providerModelCoverage = useMemo(() => {
    if (selectedProvider === 'anthropic') {
      return { hasHaiku: true, hasSonnet: true, hasOpus: true, complete: true };
    }
    if (!selectedProviderConfig) {
      return { hasHaiku: false, hasSonnet: false, hasOpus: false, complete: false };
    }
    const models = selectedProviderConfig.models || [];
    const hasHaiku = models.some((m) => m.mapsToClaudeModel === 'haiku');
    const hasSonnet = models.some((m) => m.mapsToClaudeModel === 'sonnet');
    const hasOpus = models.some((m) => m.mapsToClaudeModel === 'opus');
    return { hasHaiku, hasSonnet, hasOpus, complete: hasHaiku && hasSonnet && hasOpus };
  }, [selectedProvider, selectedProviderConfig]);

  const providerHasModels =
    selectedProvider === 'anthropic' ||
    (selectedProviderConfig && selectedProviderConfig.models?.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Replace Models (Project Override)</DialogTitle>
          <DialogDescription>
            Set project-level overrides for all phases to use models from a specific provider. This
            only affects this project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Provider selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Target Provider</label>
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {providerOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    <div className="flex items-center gap-2">
                      {option.isNative ? (
                        <Cloud className="w-4 h-4 text-brand-500" />
                      ) : (
                        <Server className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span>{option.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Warning if provider has no models */}
          {!providerHasModels && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm">
              <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                <AlertCircle className="w-4 h-4" />
                <span>This provider has no models configured.</span>
              </div>
            </div>
          )}

          {/* Warning if provider doesn't have all 3 mappings */}
          {providerHasModels && !providerModelCoverage.complete && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm">
              <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                <AlertCircle className="w-4 h-4" />
                <span>
                  This provider is missing mappings for:{' '}
                  {[
                    !providerModelCoverage.hasHaiku && 'Haiku',
                    !providerModelCoverage.hasSonnet && 'Sonnet',
                    !providerModelCoverage.hasOpus && 'Opus',
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </div>
            </div>
          )}

          {/* Preview of changes */}
          {providerHasModels && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Preview Changes</label>
                <span className="text-xs text-muted-foreground">
                  {changeCount} of {ALL_PHASES.length} will be overridden
                </span>
              </div>
              <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium text-muted-foreground">Phase</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">Current</th>
                      <th className="p-2"></th>
                      <th className="text-left p-2 font-medium text-muted-foreground">
                        New Override
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map(({ phase, label, currentDisplay, newDisplay, isChanged }) => (
                      <tr
                        key={phase}
                        className={cn(
                          'border-t border-border/50',
                          isChanged ? 'bg-brand-500/5' : 'opacity-50'
                        )}
                      >
                        <td className="p-2 font-medium">{label}</td>
                        <td className="p-2 text-muted-foreground">{currentDisplay}</td>
                        <td className="p-2 text-center">
                          {isChanged ? (
                            <ArrowRight className="w-4 h-4 text-brand-500 inline" />
                          ) : (
                            <Check className="w-4 h-4 text-green-500 inline" />
                          )}
                        </td>
                        <td className="p-2">
                          <span className={cn(isChanged && 'text-brand-500 font-medium')}>
                            {newDisplay}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!providerHasModels || changeCount === 0}>
            Apply Overrides ({changeCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
