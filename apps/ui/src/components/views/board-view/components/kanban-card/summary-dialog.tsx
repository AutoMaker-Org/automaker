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
