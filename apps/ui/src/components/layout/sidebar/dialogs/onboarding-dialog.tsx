import { Rocket, CheckCircle2, Zap, FileText, Sparkles, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface OnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newProjectName: string;
  onSkip: () => void;
  onGenerateSpec: () => void;
}

export function OnboardingDialog({
  open,
  onOpenChange,
  newProjectName,
  onSkip,
  onGenerateSpec,
}: OnboardingDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onSkip();
        }
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="max-w-2xl bg-popover/95 backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-brand-500/10 border border-brand-500/20 shrink-0">
              <Rocket className="w-6 h-6 text-brand-500" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-2xl truncate">Welcome to {newProjectName}!</DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1">
                Your new project is ready. Let&apos;s get you started.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-6">
          {/* Main explanation */}
          <div className="space-y-3">
            <p className="text-sm text-foreground leading-relaxed">
              Would you like to auto-generate your <strong>app_spec.txt</strong>? This file helps
              describe your project and is used to pre-populate your backlog with features to work
              on.
            </p>
          </div>

          {/* Benefits list */}
          <div className="space-y-3 rounded-xl bg-muted/30 border border-border/50 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Pre-populate your backlog</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Automatically generate features based on your project specification
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Better AI assistance</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Help AI agents understand your project structure and tech stack
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Project documentation</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Keep a clear record of your project&apos;s capabilities and features
                </p>
              </div>
            </div>
          </div>

          {/* Info box */}
          <div className="rounded-xl bg-brand-500/5 border border-brand-500/10 p-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Tip:</strong> You can always generate or edit your
              app_spec.txt later from the Spec Editor in the sidebar.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={onSkip}
            className="text-muted-foreground hover:text-foreground"
          >
            Skip for now
          </Button>
          <Button
            onClick={onGenerateSpec}
            className="bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-600 text-white border-0"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Generate App Spec
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
