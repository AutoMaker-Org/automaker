// @ts-nocheck
import { Feature } from '@/store/app-store';
import { AgentTaskInfo } from '@/lib/agent-context-parser';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { Sparkles } from 'lucide-react';

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

interface SummaryDialogProps {
  feature: Feature;
  agentInfo: AgentTaskInfo | null;
  summary?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SummaryDialog({
  feature,
  agentInfo,
  summary,
  isOpen,
  onOpenChange,
}: SummaryDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col select-text"
        data-testid={`summary-dialog-${feature.id}`}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--status-success)]" />
            Implementation Summary
          </DialogTitle>
          <DialogDescription
            className="text-sm"
            title={feature.description || feature.summary || ''}
          >
            {(() => {
              const displayText = feature.description || feature.summary || 'No description';
              return displayText.length > 100 ? `${displayText.slice(0, 100)}...` : displayText;
            })()}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-4 bg-card rounded-lg border border-border/50">
          <Markdown>
            {feature.summary || summary || agentInfo?.summary || 'No summary available'}
          </Markdown>
        </div>
        {feature.tokenUsage && feature.tokenUsage.entries.length > 0 && (
          <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-border/30">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Token Usage</h4>
            <div className="space-y-1.5">
              {feature.tokenUsage.entries.map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">{entry.label}</span>
                  <div className="flex items-center gap-3 text-muted-foreground/70">
                    <span>{formatTokenCount(entry.inputTokens + entry.outputTokens)} tokens</span>
                    <span>{formatDuration(entry.durationMs)}</span>
                  </div>
                </div>
              ))}
              {feature.tokenUsage.entries.length > 1 && (
                <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-border/30 font-medium">
                  <span className="text-muted-foreground">Total</span>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>
                      {formatTokenCount(
                        feature.tokenUsage.inputTokens + feature.tokenUsage.outputTokens
                      )}{' '}
                      tokens
                    </span>
                    <span>{formatDuration(feature.tokenUsage.durationMs)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="close-summary-button"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
