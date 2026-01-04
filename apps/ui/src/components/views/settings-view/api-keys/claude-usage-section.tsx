import { cn } from '@/lib/utils';
import { AnthropicIcon } from '@/components/ui/provider-icon';

export function ClaudeUsageSection() {
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
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/10 flex items-center justify-center border border-green-500/20">
            <AnthropicIcon className="w-5 h-5 text-green-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Claude Usage Tracking
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Track your Claude Code usage limits. Uses the Claude CLI for data.
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* Info about CLI requirement */}
        <div className="rounded-lg bg-secondary/30 p-3 text-xs text-muted-foreground space-y-2 border border-border/50">
          <p>Usage tracking requires Claude Code CLI to be installed and authenticated:</p>
          <ol className="list-decimal list-inside space-y-1 ml-1">
            <li>Install Claude Code CLI if not already installed</li>
            <li>
              Run <code className="font-mono bg-muted px-1 rounded">claude login</code> to
              authenticate
            </li>
            <li>Usage data will be fetched automatically every ~minute</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
