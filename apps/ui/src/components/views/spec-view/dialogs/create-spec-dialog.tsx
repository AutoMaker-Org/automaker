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
import type { CreateSpecDialogProps, FeatureCount } from '../types';

export function CreateSpecDialog({
  open,
  onOpenChange,
  projectOverview,
  onProjectOverviewChange,
  generateFeatures,
  onGenerateFeaturesChange,
  analyzeProject,
  onAnalyzeProjectChange,
  featureCount,
  onFeatureCountChange,
  onCreateSpec,
  onSkip,
  isCreatingSpec,
  showSkipButton = false,
  title = 'Create App Specification',
  description = "We didn't find an app_spec.txt file. Let us help you generate your app_spec.txt to help describe your project for our system. We'll analyze your project's tech stack and create a comprehensive specification.",
}: CreateSpecDialogProps) {
  const selectedOption = FEATURE_COUNT_OPTIONS.find((o) => o.value === featureCount);

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open && !isCreatingSpec && onSkip) {
          onSkip();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto">
          <div className="space-y-2">
            <label className="text-sm font-medium">Project Overview</label>
            <p className="text-xs text-muted-foreground">
              Describe what your project does and what features you want to build. Be as detailed as
              you want - this will help us create a better specification.
            </p>
            <textarea
              className="w-full h-48 p-3 rounded-md border border-border bg-background font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              value={projectOverview}
              onChange={(e) => onProjectOverviewChange(e.target.value)}
              placeholder="e.g., A project management tool that allows teams to track tasks, manage sprints, and visualize progress through kanban boards. It should support user authentication, real-time updates, and file attachments..."
              autoFocus
              disabled={isCreatingSpec}
            />
          </div>

          <div className="flex items-start space-x-3 pt-2">
            <Checkbox
              id="create-analyze-project"
              checked={analyzeProject}
              onCheckedChange={(checked) => onAnalyzeProjectChange(checked === true)}
              disabled={isCreatingSpec}
            />
            <div className="space-y-1">
              <label
                htmlFor="create-analyze-project"
                className={`text-sm font-medium ${isCreatingSpec ? '' : 'cursor-pointer'}`}
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
              id="create-generate-features"
              checked={generateFeatures}
              onCheckedChange={(checked) => onGenerateFeaturesChange(checked === true)}
              disabled={isCreatingSpec}
            />
            <div className="space-y-1">
              <label
                htmlFor="create-generate-features"
                className={`text-sm font-medium ${isCreatingSpec ? '' : 'cursor-pointer'}`}
              >
                Generate feature list
              </label>
              <p className="text-xs text-muted-foreground">
                Automatically create features in the features folder from the implementation roadmap
                after the spec is generated.
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
                    disabled={isCreatingSpec}
                    className={cn(
                      'flex-1 transition-all',
                      featureCount === option.value
                        ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                        : 'bg-muted/30 hover:bg-muted/50 border-border'
                    )}
                    data-testid={`feature-count-${option.value}`}
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
          {showSkipButton && onSkip ? (
            <Button variant="ghost" onClick={onSkip} disabled={isCreatingSpec}>
              Skip for now
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isCreatingSpec}>
              Cancel
            </Button>
          )}
          <HotkeyButton
            onClick={onCreateSpec}
            disabled={!projectOverview.trim() || isCreatingSpec}
            hotkey={{ key: 'Enter', cmdCtrl: true }}
            hotkeyActive={open && !isCreatingSpec}
          >
            {isCreatingSpec ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Spec
              </>
            )}
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
