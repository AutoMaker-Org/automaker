import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { GitBranch, Settings2 } from 'lucide-react';

interface PlanSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planUseSelectedWorktreeBranch: boolean;
  onPlanUseSelectedWorktreeBranchChange: (value: boolean) => void;
}

export function PlanSettingsDialog({
  open,
  onOpenChange,
  planUseSelectedWorktreeBranch,
  onPlanUseSelectedWorktreeBranchChange,
}: PlanSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="plan-settings-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Plan Settings
          </DialogTitle>
          <DialogDescription>
            Configure how the Plan feature creates and organizes new features.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Use Selected Worktree Branch Setting */}
          <div className="flex items-start space-x-3 p-3 rounded-lg bg-secondary/50">
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="plan-worktree-branch-toggle"
                  className="text-sm font-medium cursor-pointer flex items-center gap-2"
                >
                  <GitBranch className="w-4 h-4 text-brand-500" />
                  Use selected worktree branch
                </Label>
                <Switch
                  id="plan-worktree-branch-toggle"
                  checked={planUseSelectedWorktreeBranch}
                  onCheckedChange={onPlanUseSelectedWorktreeBranchChange}
                  data-testid="plan-worktree-branch-toggle"
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When enabled, features created via the Plan dialog will be assigned to the currently
                selected worktree branch. When disabled, features will be added to the main branch.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
