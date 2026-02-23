import { Component, type ReactNode, type ErrorInfo } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const logger = createLogger('BoardErrorBoundary');

interface Props {
  children: ReactNode;
  /** Called when the user clicks "Recover" - should reset worktree to main */
  onRecover?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for the board's content area (WorktreePanel + KanbanBoard/ListView).
 *
 * Catches render errors caused by stale worktree state during worktree switches
 * (e.g. re-render cascades that trigger React error #185 on mobile Safari PWA).
 * Instead of crashing the entire page, this shows a recovery UI that resets
 * the worktree selection to main and retries rendering.
 */
export class BoardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Board content crashed:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRecover = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRecover?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Board crashed</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              A rendering error occurred, possibly during a worktree switch. Click recover to reset
              to the main branch and retry.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={this.handleRecover} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Recover
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
