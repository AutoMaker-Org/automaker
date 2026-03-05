import { Workflow, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface AutomationsSectionProps {
  automationSettings: { allowDangerousScriptCommands: boolean };
  onAutomationSettingsChange: (settings: { allowDangerousScriptCommands: boolean }) => void;
}

export function AutomationsSection({
  automationSettings,
  onAutomationSettingsChange,
}: AutomationsSectionProps) {
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
            <Workflow className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Automations</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure automation behavior and security settings.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {/* Allow Dangerous Script Commands Toggle */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/30 border border-border/30">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500/15 to-red-600/10 border border-red-500/20 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-red-500" />
            </div>
            <div className="min-w-0 flex-1">
              <Label
                htmlFor="allow-dangerous-commands-toggle"
                className="font-medium text-foreground cursor-pointer"
              >
                Always Allow Dangerous Script Commands
              </Label>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Skip safety checks for potentially dangerous shell commands in run-script-exec
                automation steps
              </p>
            </div>
          </div>
          <Switch
            id="allow-dangerous-commands-toggle"
            checked={automationSettings.allowDangerousScriptCommands}
            onCheckedChange={(checked) =>
              onAutomationSettingsChange({
                ...automationSettings,
                allowDangerousScriptCommands: checked,
              })
            }
            data-testid="allow-dangerous-commands-toggle"
          />
        </div>

        {/* Warning text */}
        <p className="text-xs text-muted-foreground/60 px-4">
          When enabled, automation steps using &quot;run-script-exec&quot; will bypass dangerous
          command pattern checks (e.g. rm -rf, sudo, etc.). Use with caution &mdash; only enable
          this if you trust all automation definitions in your project.
        </p>
      </div>
    </div>
  );
}
