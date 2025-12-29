import { AlertTriangle } from 'lucide-react';
import { MAX_RECOMMENDED_TOOLS } from '../constants';

interface MCPToolsWarningProps {
  totalTools: number;
}

export function MCPToolsWarning({ totalTools }: MCPToolsWarningProps) {
  return (
    <div className="mx-6 mt-4 p-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-yellow-600 dark:text-yellow-400">
            High tool count detected ({totalTools} tools)
          </p>
          <p className="text-muted-foreground mt-1">
            Having more than {MAX_RECOMMENDED_TOOLS} MCP tools may degrade AI model performance.
            Consider disabling unused servers or removing unnecessary tools.
          </p>
        </div>
      </div>
    </div>
  );
}
