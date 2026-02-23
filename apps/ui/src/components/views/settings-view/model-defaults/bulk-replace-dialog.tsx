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
import type {
  PhaseModelKey,
  PhaseModelEntry,
  ClaudeCompatibleProvider,
  ClaudeModelAlias,
} from '@automaker/types';
import { DEFAULT_PHASE_MODELS, DEFAULT_GLOBAL_SETTINGS } from '@automaker/types';

interface BulkReplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  ideationModel: 'Ideation',
  memoryExtractionModel: 'Memory Extraction',
};

const ALL_PHASES = Object.keys(PHASE_LABELS) as PhaseModelKey[];

// Special key for default feature model (not a phase but included in bulk replace)
const DEFAULT_FEATURE_MODEL_KEY = '__defaultFeatureModel__' as const;
type ExtendedPhaseKey = PhaseModelKey | typeof DEFAULT_FEATURE_MODEL_KEY;

// Claude model display names
const CLAUDE_MODEL_DISPLAY: Record<ClaudeModelAlias, string> = {
  haiku: 'Claude Haiku',
  sonnet: 'Claude Sonnet',
  opus: 'Claude Opus',
};

export function BulkReplaceDialog({ open, onOpenChange }: BulkReplaceDialogProps) {
  const {
    phaseModels,
    setPhaseModel,
    claudeCompatibleProviders,
    defaultFeatureModel,
    setDefaultFeatureModel,
  } = useAppStore();
  const [selectedProvider, setSelectedProvider] = useState<string>('anthropic');

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
    key: ExtendedPhaseKey
  ): PhaseModelEntry => {
    if (!provider) {
      // Anthropic Direct - reset to default phase model (includes correct thinking levels)
      // For default feature model, use the default from global settings
      if (key === DEFAULT_FEATURE_MODEL_KEY) {
        return DEFAULT_GLOBAL_SETTINGS.defaultFeatureModel;
      }
      return DEFAULT_PHASE_MODELS[key];
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

  // Helper to generate preview item for any entry
  const generatePreviewItem = (
    key: ExtendedPhaseKey,
    label: string,
    currentEntry: PhaseModelEntry
  ) => {
    const claudeAlias = getClaudeModelAlias(currentEntry);
    const newEntry = findModelForClaudeAlias(selectedProviderConfig ?? null, claudeAlias, key);

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
      key,
      label,
      claudeAlias,
      currentDisplay: getCurrentDisplay(),
      newDisplay: getNewDisplay(),
      newEntry,
      isChanged,
    };
  };

  // Generate preview of changes
  const preview = useMemo(() => {
    // Default feature model entry (first in the list)
    const defaultFeatureModelEntry =
      defaultFeatureModel ?? DEFAULT_GLOBAL_SETTINGS.defaultFeatureModel;
    const defaultFeaturePreview = generatePreviewItem(
      DEFAULT_FEATURE_MODEL_KEY,
      'Default Feature Model',
      defaultFeatureModelEntry
    );

    // Phase model entries
    const phasePreview = ALL_PHASES.map((phase) => {
      const currentEntry = phaseModels[phase] ?? DEFAULT_PHASE_MODELS[phase];
      return generatePreviewItem(phase, PHASE_LABELS[phase], currentEntry);
    });

    return [defaultFeaturePreview, ...phasePreview];
  }, [phaseModels, selectedProviderConfig, enabledProviders, defaultFeatureModel]);

  // Count how many will change
  const changeCount = preview.filter((p) => p.isChanged).length;

  // Apply the bulk replace
  const handleApply = () => {
    preview.forEach(({ key, newEntry, isChanged }) => {
      if (isChanged) {
        if (key === DEFAULT_FEATURE_MODEL_KEY) {
          setDefaultFeatureModel(newEntry);
        } else {
          setPhaseModel(key as PhaseModelKey, newEntry);
        }
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
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Replace Models</DialogTitle>
          <DialogDescription>
            Switch all phase models to equivalents from a specific provider. Models are matched by
            their Claude model mapping (Haiku, Sonnet, Opus).
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
                  {changeCount} of {preview.length} will change
                </span>
              </div>
              <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium text-muted-foreground">Phase</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">Current</th>
                      <th className="p-2"></th>
                      <th className="text-left p-2 font-medium text-muted-foreground">New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map(({ key, label, currentDisplay, newDisplay, isChanged }) => (
                      <tr
                        key={key}
                        className={cn(
                          'border-t border-border/50',
                          isChanged ? 'bg-brand-500/5' : 'opacity-50',
                          key === DEFAULT_FEATURE_MODEL_KEY && 'bg-accent/30'
                        )}
                      >
                        <td className="p-2 font-medium">
                          {label}
                          {key === DEFAULT_FEATURE_MODEL_KEY && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-500">
                              Feature Default
                            </span>
                          )}
                        </td>
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
            Apply Changes ({changeCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
