import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorktreesSectionProps {
  useWorktrees: boolean;
  onUseWorktreesChange: (value: boolean) => void;
}

export function WorktreesSection({ useWorktrees, onUseWorktreesChange }: WorktreesSectionProps) {
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
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <GitBranch className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Worktrees</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure git worktree isolation for feature development.
        </p>
      </div>
      <div className="p-6 space-y-5">
        {/* Enable Worktrees Toggle */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="use-worktrees"
            checked={useWorktrees}
            onCheckedChange={(checked) => onUseWorktreesChange(checked === true)}
            className="mt-1"
            data-testid="use-worktrees-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="use-worktrees"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <GitBranch className="w-4 h-4 text-brand-500" />
              Enable Git Worktree Isolation
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Creates isolated git branches for each feature. When disabled, agents work directly in
              the main project directory.
            </p>
          </div>
        </div>

        {/* Info about project-specific settings */}
        <div className="rounded-xl border border-border/30 bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">
            Project-specific worktree preferences (init script, delete branch behavior) can be
            configured in each project's settings via the sidebar.
          </p>
        </div>
      </div>
    </div>
  );
}
