import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getElectronAPI } from '@/lib/electron';

interface BeadsErrorDiagnosticsProps {
  error: string;
  projectPath?: string;
  onRetry: () => void;
}

interface BeadsDiagnostics {
  cliInstalled: boolean;
  cliVersion: string | null;
  dbInitialized: boolean;
  serverResponding: boolean;
  canInitialize: boolean;
  cliPath?: string;
  dbPath?: string;
}

export function BeadsErrorDiagnostics({ error, projectPath, onRetry }: BeadsErrorDiagnosticsProps) {
  const [diagnostics, setDiagnostics] = React.useState<BeadsDiagnostics | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    async function runDiagnostics() {
      setIsLoading(true);
      const diag: BeadsDiagnostics = {
        cliInstalled: false,
        cliVersion: null,
        dbInitialized: false,
        serverResponding: false,
        canInitialize: false,
      };

      try {
        const api = getElectronAPI();
        if (!api.beads) {
          diag.serverResponding = false;
          setDiagnostics(diag);
          setIsLoading(false);
          return;
        }

        // Check if server is responding
        if (projectPath) {
          try {
            const validation = await api.beads.validate(projectPath);
            diag.serverResponding = validation.success !== false;
            diag.cliInstalled = validation.installed !== false;
            diag.cliVersion = validation.version || null;
            diag.dbInitialized = validation.initialized === true;
          } catch {
            diag.serverResponding = false;
          }
        }
      } catch (err) {
        console.error('Failed to run diagnostics:', err);
      } finally {
        setDiagnostics(diag);
        setIsLoading(false);
      }
    }

    runDiagnostics();
  }, [projectPath]);

  const getErrorType = (): string => {
    if (!diagnostics) return 'unknown';

    if (!diagnostics.serverResponding) {
      return 'server-down';
    }

    if (!diagnostics.cliInstalled) {
      return 'cli-missing';
    }

    if (projectPath && !diagnostics.dbInitialized) {
      return 'db-not-initialized';
    }

    return 'generic';
  };

  const errorType = getErrorType();

  const getErrorTitle = () => {
    switch (errorType) {
      case 'server-down':
        return 'Beads API Unavailable';
      case 'cli-missing':
        return 'Beads CLI Not Found';
      case 'db-not-initialized':
        return 'Beads Not Initialized';
      default:
        return 'Error Loading Issues';
    }
  };

  const getErrorMessage = () => {
    switch (errorType) {
      case 'server-down':
        return 'Failed to connect to the DevFlow server. The Beads API is not responding.';
      case 'cli-missing':
        return 'The bd CLI tool is not installed on your system.';
      case 'db-not-initialized':
        return 'Beads has not been initialized in this project yet.';
      default:
        return error;
    }
  };

  const getDiagnosticItems = () => {
    const items = [];

    if (errorType === 'server-down') {
      items.push(
        <li key="server-url">
          Server URL:{' '}
          <code className="px-1 py-0.5 rounded bg-background">http://localhost:3008</code>
        </li>,
        <li key="server-port">Server must be running on port 3008</li>,
        <li key="server-start">
          Start the server with:{' '}
          <code className="px-1 py-0.5 rounded bg-background">npm run dev:server</code>
        </li>
      );
    }

    if (errorType === 'cli-missing') {
      items.push(
        <li key="install-command">
          Install with:{' '}
          <code className="px-1 py-0.5 rounded bg-background">npm install -g @beadscli/beads</code>
        </li>,
        <li key="verify-install">
          After installation, verify with:{' '}
          <code className="px-1 py-0.5 rounded bg-background">bd --version</code>
        </li>
      );
    }

    if (errorType === 'db-not-initialized') {
      items.push(
        <li key="init-command">
          Initialize Beads with: <code className="px-1 py-0.5 rounded bg-background">bd init</code>
        </li>,
        <li key="project-path">
          Project path:{' '}
          <code className="px-1 py-0.5 rounded bg-background text-xs break-all">
            {projectPath || 'No project selected'}
          </code>
        </li>
      );
    }

    if (diagnostics?.cliVersion) {
      items.unshift(
        <li key="cli-version">
          bd CLI version:{' '}
          <code className="px-1 py-0.5 rounded bg-background">{diagnostics.cliVersion}</code>
        </li>
      );
    }

    return items;
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
      <div className="p-4 rounded-full bg-destructive/10 mb-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
      </div>

      <h2 className="text-lg font-medium mb-2">{getErrorTitle()}</h2>
      <p className="text-muted-foreground max-w-md mb-4">{getErrorMessage()}</p>

      {/* Diagnostic information */}
      {!isLoading && diagnostics && (
        <div className="text-xs text-muted-foreground max-w-md mb-4 text-left bg-muted/50 p-3 rounded-md">
          <p className="font-medium mb-1">Diagnostics:</p>
          <ul className="list-disc list-inside space-y-1">{getDiagnosticItems()}</ul>
        </div>
      )}

      <Button variant="outline" onClick={onRetry} disabled={isLoading}>
        <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
        Retry Connection
      </Button>
    </div>
  );
}
