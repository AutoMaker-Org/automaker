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

interface WorktreeSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addFeatureUseSelectedWorktreeBranch: boolean;
  onAddFeatureUseSelectedWorktreeBranchChange: (value: boolean) => void;
}

export function WorktreeSettingsDialog({
  open,
  onOpenChange,
  addFeatureUseSelectedWorktreeBranch,
  onAddFeatureUseSelectedWorktreeBranchChange,
}: WorktreeSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="worktree-settings-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Worktree Settings
          </DialogTitle>
          <DialogDescription>
            Configure how worktrees affect feature creation and organization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Use Selected Worktree Branch Setting */}
          <div className="flex items-start space-x-3 p-3 rounded-lg bg-secondary/50">
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="worktree-branch-toggle"
                  className="text-sm font-medium cursor-pointer flex items-center gap-2"
                >
                  <GitBranch className="w-4 h-4 text-brand-500" />
                  Use selected worktree branch
                </Label>
                <Switch
                  id="worktree-branch-toggle"
                  checked={addFeatureUseSelectedWorktreeBranch}
                  onCheckedChange={onAddFeatureUseSelectedWorktreeBranchChange}
                  data-testid="worktree-branch-toggle"
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When enabled, the Add Feature dialog will default to custom branch mode with the
                currently selected worktree branch pre-filled.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
