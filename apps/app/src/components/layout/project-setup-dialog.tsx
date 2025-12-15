"use client";

import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface ProjectSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectOverview: string;
  onProjectOverviewChange: (value: string) => void;
  generateFeatures: boolean;
  onGenerateFeaturesChange: (value: boolean) => void;
  onCreateSpec: () => void;
  onSkip: () => void;
  isCreatingSpec: boolean;
}

export function ProjectSetupDialog({
  open,
  onOpenChange,
  projectOverview,
  onProjectOverviewChange,
  generateFeatures,
  onGenerateFeaturesChange,
  onCreateSpec,
  onSkip,
  isCreatingSpec,
}: ProjectSetupDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open && !isCreatingSpec) {
          onSkip();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Set Up Your Project</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            We didn&apos;t find an app_spec.txt file. Let us help you generate
            your app_spec.txt to help describe your project for our system.
            We&apos;ll analyze your project&apos;s tech stack and create a
            comprehensive specification.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Project Overview</label>
            <p className="text-xs text-muted-foreground">
              Describe what your project does and what features you want to
              build. Be as detailed as you want - this will help us create a
              better specification.
            </p>
            <textarea
              className="w-full h-48 p-3 rounded-md border border-border bg-background font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              value={projectOverview}
              onChange={(e) => onProjectOverviewChange(e.target.value)}
              placeholder="e.g., A project management tool that allows teams to track tasks, manage sprints, and visualize progress through kanban boards. It should support user authentication, real-time updates, and file attachments..."
              autoFocus
            />
          </div>

          <div className="flex items-start space-x-3 pt-2">
            <Checkbox
              id="sidebar-generate-features"
              checked={generateFeatures}
              onCheckedChange={(checked) =>
                onGenerateFeaturesChange(checked === true)
              }
            />
            <div className="space-y-1">
              <label
                htmlFor="sidebar-generate-features"
                className="text-sm font-medium cursor-pointer"
              >
                Generate feature list
              </label>
              <p className="text-xs text-muted-foreground">
                Automatically create features in the features folder from the
                implementation roadmap after the spec is generated.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
          <Button
            onClick={onCreateSpec}
            disabled={!projectOverview.trim()}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Generate Spec
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

