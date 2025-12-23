import { useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCheck, Shuffle, Target, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { CLAUDE_MODELS } from '@/components/views/board-view/shared/model-constants';
import { syncSettingsToServer } from '@/hooks/use-settings-migration';
import type { DoubleCheckModelStrategy, DoubleCheckMode } from '@automaker/types';

const MODEL_STRATEGIES: {
  id: DoubleCheckModelStrategy;
  label: string;
  description: string;
  icon: typeof Shuffle;
}[] = [
  {
    id: 'different',
    label: 'Different Model',
    description: 'Use a different model than the one that implemented the feature',
    icon: Shuffle,
  },
  {
    id: 'specific',
    label: 'Specific Model',
    description: 'Always use a specific model for verification',
    icon: Target,
  },
  {
    id: 'any',
    label: 'Same Model',
    description: 'Use the same model that implemented the feature',
    icon: Cpu,
  },
];

export function DoubleCheckSection() {
  const { doubleCheckMode, setDoubleCheckMode } = useAppStore();

  // Wrapper that updates state and syncs to server
  const updateDoubleCheckMode = useCallback(
    (mode: Partial<DoubleCheckMode>) => {
      setDoubleCheckMode(mode);
      // Sync to server after state update (async, fire-and-forget)
      syncSettingsToServer();
    },
    [setDoubleCheckMode]
  );

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center border border-purple-500/20">
            <CheckCheck className="w-5 h-5 text-purple-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Double-Check Mode
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Add a verification step before features are approved.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Enable Double-Check Toggle */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="double-check-enabled"
            checked={doubleCheckMode.enabled}
            onCheckedChange={(checked) => updateDoubleCheckMode({ enabled: checked === true })}
            className="mt-1"
            data-testid="double-check-enabled-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="double-check-enabled"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <CheckCheck className="w-4 h-4 text-purple-500" />
              Enable Double-Check Verification
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, completed features will go through a verification step before moving to
              "Waiting Approval". A different model reviews the implementation for completeness and
              quality.
            </p>
          </div>
        </div>

        {doubleCheckMode.enabled && (
          <>
            {/* Separator */}
            <div className="border-t border-border/30" />

            {/* Model Strategy Selection */}
            <div className="space-y-4">
              <Label className="text-foreground font-medium">Verification Model Strategy</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {MODEL_STRATEGIES.map(({ id, label, description, icon: Icon }) => {
                  const isActive = doubleCheckMode.modelStrategy === id;
                  return (
                    <button
                      key={id}
                      onClick={() => updateDoubleCheckMode({ modelStrategy: id })}
                      className={cn(
                        'group flex flex-col items-start gap-2 px-4 py-4 rounded-xl text-left',
                        'transition-all duration-200 ease-out',
                        isActive
                          ? [
                              'bg-gradient-to-br from-purple-500/15 to-purple-600/10',
                              'border-2 border-purple-500/40',
                              'text-foreground',
                              'shadow-md shadow-purple-500/10',
                            ]
                          : [
                              'bg-accent/30 hover:bg-accent/50',
                              'border border-border/50 hover:border-border',
                              'text-muted-foreground hover:text-foreground',
                              'hover:shadow-sm',
                            ],
                        'hover:scale-[1.02] active:scale-[0.98]'
                      )}
                      data-testid={`double-check-strategy-${id}`}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <Icon
                          className={cn(
                            'w-4 h-4',
                            isActive ? 'text-purple-500' : 'text-muted-foreground'
                          )}
                        />
                        <span
                          className={cn(
                            'font-medium text-sm',
                            isActive ? 'text-foreground' : 'group-hover:text-foreground'
                          )}
                        >
                          {label}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground/80">{description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Specific Model Selection - only show when strategy is 'specific' */}
            {doubleCheckMode.modelStrategy === 'specific' && (
              <>
                <div className="border-t border-border/30" />
                <div className="space-y-4">
                  <Label className="text-foreground font-medium">Verification Model</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {CLAUDE_MODELS.map(({ id, label, description, badge }) => {
                      const isActive = doubleCheckMode.specificModel === id;
                      return (
                        <button
                          key={id}
                          onClick={() => updateDoubleCheckMode({ specificModel: id })}
                          className={cn(
                            'group flex flex-col items-start gap-2 px-4 py-4 rounded-xl text-left',
                            'transition-all duration-200 ease-out',
                            isActive
                              ? [
                                  'bg-gradient-to-br from-purple-500/15 to-purple-600/10',
                                  'border-2 border-purple-500/40',
                                  'text-foreground',
                                  'shadow-md shadow-purple-500/10',
                                ]
                              : [
                                  'bg-accent/30 hover:bg-accent/50',
                                  'border border-border/50 hover:border-border',
                                  'text-muted-foreground hover:text-foreground',
                                  'hover:shadow-sm',
                                ],
                            'hover:scale-[1.02] active:scale-[0.98]'
                          )}
                          data-testid={`double-check-model-${id}`}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <span
                              className={cn(
                                'font-medium text-sm',
                                isActive ? 'text-foreground' : 'group-hover:text-foreground'
                              )}
                            >
                              {label}
                            </span>
                            {badge && (
                              <span
                                className={cn(
                                  'ml-auto text-xs px-2 py-0.5 rounded-full',
                                  isActive
                                    ? 'bg-purple-500/20 text-purple-500'
                                    : 'bg-accent text-muted-foreground'
                                )}
                              >
                                {badge}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground/80">{description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Separator */}
            <div className="border-t border-border/30" />

            {/* Auto Mode Trigger Setting */}
            <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
              <Checkbox
                id="auto-trigger-double-check"
                checked={doubleCheckMode.autoTriggerInAutoMode}
                onCheckedChange={(checked) =>
                  updateDoubleCheckMode({ autoTriggerInAutoMode: checked === true })
                }
                className="mt-1"
                data-testid="auto-trigger-double-check-checkbox"
              />
              <div className="space-y-1.5">
                <Label
                  htmlFor="auto-trigger-double-check"
                  className="text-foreground cursor-pointer font-medium"
                >
                  Auto-trigger in Auto Mode
                </Label>
                <p className="text-xs text-muted-foreground/80 leading-relaxed">
                  When enabled, double-check verification will automatically run when Auto Mode
                  completes a feature. When disabled, you'll need to manually trigger verification.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
