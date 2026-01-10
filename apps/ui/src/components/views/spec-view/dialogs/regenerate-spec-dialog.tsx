import { Sparkles, Clock, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FEATURE_COUNT_OPTIONS } from '../constants';
import type { RegenerateSpecDialogProps, FeatureCount } from '../types';

export function RegenerateSpecDialog({
  open,
  onOpenChange,
  projectDefinition,
  onProjectDefinitionChange,
  generateFeatures,
  onGenerateFeaturesChange,
  analyzeProject,
  onAnalyzeProjectChange,
  featureCount,
  onFeatureCountChange,
  useWorktreeBranch,
  onUseWorktreeBranchChange,
  worktreeBranch,
  onWorktreeBranchChange,
  onRegenerate,
  isRegenerating,
  isGeneratingFeatures = false,
}: RegenerateSpecDialogProps) {
  const [customFeatureCount, setCustomFeatureCount] = useState<string>('');
  const [isCustom, setIsCustom] = useState(false);

  // Sync local state with prop when dialog opens or featureCount changes
  useEffect(() => {
    if (!open) return;

    const numericOptions = FEATURE_COUNT_OPTIONS.map((o) => o.value).filter(
      (v): v is number => typeof v === 'number'
    );

    if (typeof featureCount === 'number') {
      const isPreset = numericOptions.includes(featureCount);
      setIsCustom(!isPreset);
      setCustomFeatureCount(isPreset ? '' : String(featureCount));
    }
  }, [open, featureCount]);

  const selectedOption = FEATURE_COUNT_OPTIONS.find(
    (o) => o.value === featureCount || (isCustom && o.value === 'custom')
  );
  const isDisabled = isRegenerating || isGeneratingFeatures;

  // Validate custom feature count
  const customCountNum = Number(customFeatureCount);
  const isCustomCountValid =
    !generateFeatures ||
    !isCustom ||
    (Number.isInteger(customCountNum) && customCountNum >= 1 && customCountNum <= 200);

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open && !isRegenerating) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Regenerate App Specification</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            We will regenerate your app spec based on a short project definition and the current
            tech stack found in your project. The agent will analyze your codebase to understand
            your existing technologies and create a comprehensive specification.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Describe your project</label>
            <p className="text-xs text-muted-foreground">
              Provide a clear description of what your app should do. Be as detailed as you want -
              the more context you provide, the more comprehensive the spec will be.
            </p>
            <textarea
              className="w-full h-40 p-3 rounded-md border border-border bg-background font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              value={projectDefinition}
              onChange={(e) => onProjectDefinitionChange(e.target.value)}
              placeholder="e.g., A task management app where users can create projects, add tasks with due dates, assign tasks to team members, track progress with a kanban board, and receive notifications for upcoming deadlines..."
              disabled={isDisabled}
            />
          </div>

          <div className="flex items-start space-x-3 pt-2">
            <Checkbox
              id="regenerate-use-worktree-branch"
              checked={useWorktreeBranch}
              onCheckedChange={(checked) => onUseWorktreeBranchChange(checked === true)}
              disabled={isDisabled}
            />
            <div className="space-y-1 flex-1">
              <label
                htmlFor="regenerate-use-worktree-branch"
                className={`text-sm font-medium ${isDisabled ? '' : 'cursor-pointer'}`}
              >
                Use worktree branch
              </label>
              <p className="text-xs text-muted-foreground">
                If checked, create features in a separate worktree branch. If unchecked, detects and
                uses the current branch of the selected project.
              </p>

              {useWorktreeBranch && (
                <div className="pt-2">
                  <Input
                    type="text"
                    value={worktreeBranch}
                    onChange={(e) => onWorktreeBranchChange(e.target.value)}
                    onBlur={(e) => onWorktreeBranchChange(e.target.value.trim())}
                    placeholder="e.g., test-worktree, feature-new"
                    disabled={isDisabled}
                    className="font-mono text-sm"
                    data-testid="regenerate-worktree-branch-input"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start space-x-3 pt-2">
            <Checkbox
              id="regenerate-analyze-project"
              checked={analyzeProject}
              onCheckedChange={(checked) => onAnalyzeProjectChange(checked === true)}
              disabled={isDisabled}
            />
            <div className="space-y-1">
              <label
                htmlFor="regenerate-analyze-project"
                className={`text-sm font-medium ${isDisabled ? '' : 'cursor-pointer'}`}
              >
                Analyze current project for additional context
              </label>
              <p className="text-xs text-muted-foreground">
                If checked, the agent will research your existing codebase to understand the tech
                stack. If unchecked, defaults to TanStack Start, Drizzle ORM, PostgreSQL, shadcn/ui,
                Tailwind CSS, and React.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 pt-2">
            <Checkbox
              id="regenerate-generate-features"
              checked={generateFeatures}
              onCheckedChange={(checked) => onGenerateFeaturesChange(checked === true)}
              disabled={isDisabled}
            />
            <div className="space-y-1">
              <label
                htmlFor="regenerate-generate-features"
                className={`text-sm font-medium ${isDisabled ? '' : 'cursor-pointer'}`}
              >
                Generate feature list
              </label>
              <p className="text-xs text-muted-foreground">
                Automatically create features in the features folder from the implementation roadmap
                after the spec is regenerated.
              </p>
            </div>
          </div>

          {/* Feature Count Selection - only shown when generateFeatures is enabled */}
          {generateFeatures && (
            <div className="space-y-2 pt-2 pl-7">
              <label className="text-sm font-medium">Number of Features</label>
              <div className="flex gap-2">
                {FEATURE_COUNT_OPTIONS.map((option) => {
                  const isSelected =
                    option.value === 'custom' ? isCustom : featureCount === option.value;
                  return (
                    <Button
                      key={option.value}
                      type="button"
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (option.value === 'custom') {
                          setIsCustom(true);
                          if (customFeatureCount) {
                            onFeatureCountChange(parseInt(customFeatureCount, 10));
                          }
                        } else {
                          setIsCustom(false);
                          setCustomFeatureCount('');
                          onFeatureCountChange(option.value as number);
                        }
                      }}
                      disabled={isDisabled}
                      className={cn(
                        'flex-1 transition-all',
                        isSelected
                          ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                          : 'bg-muted/30 hover:bg-muted/50 border-border'
                      )}
                      data-testid={`regenerate-feature-count-${option.value}`}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
              {isCustom && (
                <>
                  <Input
                    type="number"
                    min="1"
                    max="200"
                    value={customFeatureCount}
                    onChange={(e) => {
                      setCustomFeatureCount(e.target.value);
                      const num = e.currentTarget.valueAsNumber;
                      if (Number.isInteger(num) && num >= 1 && num <= 200) {
                        onFeatureCountChange(num);
                      }
                    }}
                    placeholder="Enter number of features (1-200)"
                    disabled={isDisabled}
                    className="text-sm"
                    data-testid="regenerate-feature-count-custom-input"
                  />
                  {!isCustomCountValid && (
                    <p className="text-xs text-destructive mt-1">
                      Enter a whole number from 1–200.
                    </p>
                  )}
                </>
              )}
              {selectedOption?.warning && !isCustom && (
                <p className="text-xs text-amber-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {selectedOption.warning}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isDisabled}>
              Cancel
            </Button>
            <HotkeyButton
              onClick={onRegenerate}
              disabled={
                !projectDefinition.trim() ||
                isDisabled ||
                (useWorktreeBranch && !worktreeBranch.trim()) ||
                !isCustomCountValid
              }
              hotkey={{ key: 'Enter', cmdCtrl: true }}
              hotkeyActive={open && !isDisabled}
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Regenerate Spec
                </>
              )}
            </HotkeyButton>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
