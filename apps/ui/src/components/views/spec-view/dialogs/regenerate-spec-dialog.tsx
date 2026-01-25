import { Sparkles, Clock } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
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
  onRegenerate,
  isRegenerating,
  isGeneratingFeatures = false,
}: RegenerateSpecDialogProps) {
  const selectedOption = FEATURE_COUNT_OPTIONS.find((o) => o.value === featureCount);
  const isDisabled = isRegenerating || isGeneratingFeatures;

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

        <div className="space-y-4 py-4 overflow-y-auto">
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
                {FEATURE_COUNT_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={featureCount === option.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onFeatureCountChange(option.value as FeatureCount)}
                    disabled={isDisabled}
                    className={cn(
                      'flex-1 transition-all',
                      featureCount === option.value
                        ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                        : 'bg-muted/30 hover:bg-muted/50 border-border'
                    )}
                    data-testid={`regenerate-feature-count-${option.value}`}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              {selectedOption?.warning && (
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
              disabled={!projectDefinition.trim() || isDisabled}
              hotkey={{ key: 'Enter', cmdCtrl: true }}
              hotkeyActive={open && !isDisabled}
            >
              {isRegenerating ? (
                <>
                  <Spinner size="sm" className="mr-2" />
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
