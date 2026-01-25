import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Code2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore, type ServerLogLevel } from '@/store/app-store';
import { toast } from 'sonner';

const LOG_LEVEL_OPTIONS: { value: ServerLogLevel; label: string; description: string }[] = [
  { value: 'error', label: 'Error', description: 'Only show error messages' },
  { value: 'warn', label: 'Warning', description: 'Show warnings and errors' },
  { value: 'info', label: 'Info', description: 'Show general information (default)' },
  { value: 'debug', label: 'Debug', description: 'Show all messages including debug' },
];

export function DeveloperSection() {
  const { serverLogLevel, setServerLogLevel, enableRequestLogging, setEnableRequestLogging } =
    useAppStore();

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
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center border border-purple-500/20">
            <Code2 className="w-5 h-5 text-purple-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Developer</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Advanced settings for debugging and development.
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* Server Log Level */}
        <div className="space-y-3">
          <Label className="text-foreground font-medium">Server Log Level</Label>
          <p className="text-xs text-muted-foreground">
            Control the verbosity of API server logs. Set to "Error" to only see error messages in
            the server console.
          </p>
          <select
            value={serverLogLevel}
            onChange={(e) => {
              setServerLogLevel(e.target.value as ServerLogLevel);
              toast.success(`Log level changed to ${e.target.value}`, {
                description: 'Server logging verbosity updated',
              });
            }}
            className={cn(
              'w-full px-3 py-2 rounded-lg',
              'bg-accent/30 border border-border/50',
              'text-foreground text-sm',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/30'
            )}
          >
            {LOG_LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} - {option.description}
              </option>
            ))}
          </select>
        </div>

        {/* HTTP Request Logging */}
        <div className="flex items-center justify-between pt-4 border-t border-border/30">
          <div className="space-y-1">
            <Label className="text-foreground font-medium">HTTP Request Logging</Label>
            <p className="text-xs text-muted-foreground">
              Log all HTTP requests (method, URL, status) to the server console.
            </p>
          </div>
          <Switch
            checked={enableRequestLogging}
            onCheckedChange={(checked) => {
              setEnableRequestLogging(checked);
              toast.success(checked ? 'Request logging enabled' : 'Request logging disabled', {
                description: 'HTTP request logging updated',
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}
