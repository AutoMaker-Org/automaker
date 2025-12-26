import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClaudeMdSettingsProps {
  autoLoadClaudeMd: boolean;
  onAutoLoadClaudeMdChange: (enabled: boolean) => void;
}

/**
 * ClaudeMdSettings Component
 *
 * UI control for the autoLoadClaudeMd setting which enables automatic loading
 * of project instructions from .claude/CLAUDE.md files via the Claude Agent SDK.
 *
 * Usage:
 * ```tsx
 * <ClaudeMdSettings
 *   autoLoadClaudeMd={autoLoadClaudeMd}
 *   onAutoLoadClaudeMdChange={setAutoLoadClaudeMd}
 * />
 * ```
 */
export function ClaudeMdSettings({
  autoLoadClaudeMd,
  onAutoLoadClaudeMdChange,
}: ClaudeMdSettingsProps) {
  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
      data-testid="claude-md-settings"
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <FileCode className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            CLAUDE.md Integration
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure automatic loading of project-specific instructions.
        </p>
      </div>
      <div className="p-6">
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="auto-load-claude-md"
            checked={autoLoadClaudeMd}
            onCheckedChange={(checked) => onAutoLoadClaudeMdChange(checked === true)}
            className="mt-1"
            data-testid="auto-load-claude-md-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="auto-load-claude-md"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <FileCode className="w-4 h-4 text-brand-500" />
              Auto-load CLAUDE.md Files
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Automatically load project instructions from{' '}
              <code className="text-[10px] px-1 py-0.5 rounded bg-accent/50">
                .claude/CLAUDE.md
              </code>{' '}
              files. When enabled, Claude will read and follow conventions specified in your
              project&apos;s CLAUDE.md file. Project settings override global settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
