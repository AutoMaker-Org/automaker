import { Sparkles, Bot, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NoProjectState() {
  return (
    <div
      className="flex-1 flex items-center justify-center bg-background"
      data-testid="agent-view-no-project"
    >
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-3 text-foreground">No Project Selected</h2>
        <p className="text-muted-foreground leading-relaxed">
          Open or create a project to start working with the AI agent.
        </p>
      </div>
    </div>
  );
}

interface NoSessionStateProps {
  showSessionManager: boolean;
  onShowSessionManager: () => void;
}

export function NoSessionState({ showSessionManager, onShowSessionManager }: NoSessionStateProps) {
  return (
    <div
      className="flex-1 flex items-center justify-center bg-background"
      data-testid="no-session-placeholder"
    >
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-6">
          <Bot className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold mb-3 text-foreground">No Session Selected</h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Create or select a session to start chatting with the AI agent
        </p>
        <Button onClick={onShowSessionManager} variant="outline" className="gap-2">
          <PanelLeft className="w-4 h-4" />
          {showSessionManager ? 'View' : 'Show'} Sessions
        </Button>
      </div>
    </div>
  );
}
