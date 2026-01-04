import { Bot, PanelLeftClose, PanelLeft, Wrench, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AgentHeaderProps {
  projectName: string;
  currentSessionId: string | null;
  isConnected: boolean;
  isProcessing: boolean;
  currentTool: string | null;
  agentError: string | null;
  messagesCount: number;
  showSessionManager: boolean;
  onToggleSessionManager: () => void;
  onClearChat: () => void;
}

export function AgentHeader({
  projectName,
  currentSessionId,
  isConnected,
  isProcessing,
  currentTool,
  agentError,
  messagesCount,
  showSessionManager,
  onToggleSessionManager,
  onClearChat,
}: AgentHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSessionManager}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        >
          {showSessionManager ? (
            <PanelLeftClose className="w-4 h-4" />
          ) : (
            <PanelLeft className="w-4 h-4" />
          )}
        </Button>
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">AI Agent</h1>
          <p className="text-sm text-muted-foreground">
            {projectName}
            {currentSessionId && !isConnected && ' - Connecting...'}
          </p>
        </div>
      </div>

      {/* Status indicators & actions */}
      <div className="flex items-center gap-3">
        {currentTool && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border border-border">
            <Wrench className="w-3 h-3 text-primary" />
            <span className="font-medium">{currentTool}</span>
          </div>
        )}
        {agentError && <span className="text-xs text-destructive font-medium">{agentError}</span>}
        {currentSessionId && messagesCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearChat}
            disabled={isProcessing}
            className="text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
