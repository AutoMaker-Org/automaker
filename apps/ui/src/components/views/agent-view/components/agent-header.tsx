import { Bot, PanelLeftClose, PanelLeft, Wrench, Trash2, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AgentHeaderProps {
  projectName: string;
  currentSessionId: string | null;
  isConnected: boolean;
  isProcessing: boolean;
  currentTool: string | null;
  messagesCount: number;
  showSessionManager: boolean;
  onToggleSessionManager: () => void;
  onClearChat: () => void;
  worktreeBranch?: string;
}

export function AgentHeader({
  projectName,
  currentSessionId,
  isConnected,
  isProcessing,
  currentTool,
  messagesCount,
  showSessionManager,
  onToggleSessionManager,
  onClearChat,
  worktreeBranch,
}: AgentHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-4 border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground">AI Agent</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
            <span className="truncate">
              {projectName}
              {currentSessionId && !isConnected && ' - Connecting...'}
            </span>
            {worktreeBranch && (
              <span className="inline-flex items-center gap-1 text-xs bg-muted/50 px-2 py-0.5 rounded-full border border-border shrink-0">
                <GitBranch className="w-3 h-3 shrink-0" />
                <span className="max-w-[100px] sm:max-w-[180px] truncate">{worktreeBranch}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Status indicators & actions */}
      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        {currentTool && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border border-border">
            <Wrench className="w-3 h-3 text-primary" />
            <span className="font-medium">{currentTool}</span>
          </div>
        )}
        {currentSessionId && messagesCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearChat}
            disabled={isProcessing}
            aria-label="Clear chat"
            className="text-muted-foreground hover:text-foreground h-8 w-8 p-0 sm:w-auto sm:px-3"
          >
            <Trash2 className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSessionManager}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          aria-label={showSessionManager ? 'Hide sessions panel' : 'Show sessions panel'}
        >
          {showSessionManager ? (
            <PanelLeftClose className="w-4 h-4" />
          ) : (
            <PanelLeft className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
