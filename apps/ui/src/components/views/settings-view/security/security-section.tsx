import { Shield, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface SecuritySectionProps {
  skipSandboxWarning: boolean;
  onSkipSandboxWarningChange: (skip: boolean) => void;
}

export function SecuritySection({
  skipSandboxWarning,
  onSkipSandboxWarningChange,
}: SecuritySectionProps) {
  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/80 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm'
      )}
    >
      <div className="p-6 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Security</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure security warnings and protections.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {/* Sandbox Warning Toggle */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/30 border border-border/30">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-600/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <Label
                htmlFor="sandbox-warning-toggle"
                className="font-medium text-foreground cursor-pointer"
              >
                Show Sandbox Warning on Startup
              </Label>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Display a security warning when not running in a sandboxed environment
              </p>
            </div>
          </div>
          <Switch
            id="sandbox-warning-toggle"
            checked={!skipSandboxWarning}
            onCheckedChange={(checked) => onSkipSandboxWarningChange(!checked)}
            data-testid="sandbox-warning-toggle"
          />
        </div>

        {/* Info text */}
        <p className="text-xs text-muted-foreground/60 px-4">
          When enabled, you&apos;ll see a warning on app startup if you&apos;re not running in a
          containerized environment (like Docker). This helps remind you to use proper isolation
          when running AI agents.
        </p>
      </div>
    </div>
  );
}
