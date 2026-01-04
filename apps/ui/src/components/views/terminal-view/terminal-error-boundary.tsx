import React, { Component, ErrorInfo } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const logger = createLogger('TerminalErrorBoundary');

interface Props {
  children: React.ReactNode;
  sessionId: string;
  onRestart?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * BUG-06 fix: Error boundary for terminal components
 * Catches xterm.js errors (WebGL context loss, canvas errors, etc.)
 * and displays a friendly recovery UI instead of crashing the app.
 */
export class TerminalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Terminal crashed:', {
      sessionId: this.props.sessionId,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRestart?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className={cn(
            'flex flex-col items-center justify-center h-full w-full',
            'bg-background/95 backdrop-blur-sm',
            'p-6 text-center gap-4'
          )}
        >
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Terminal Crashed</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {this.state.error?.message?.includes('WebGL')
                ? 'WebGL context was lost. This can happen with GPU driver issues.'
                : 'An unexpected error occurred in the terminal.'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={this.handleRestart} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Restart Terminal
          </Button>
          {this.state.error && (
            <details className="text-xs text-muted-foreground max-w-md">
              <summary className="cursor-pointer hover:text-foreground">Technical details</summary>
              <pre className="mt-2 p-2 bg-muted/50 rounded text-left overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
