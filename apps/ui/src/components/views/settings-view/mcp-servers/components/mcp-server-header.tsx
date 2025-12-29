import { Plug, RefreshCw, Download, Code, FileJson, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MCPServerHeaderProps {
  isRefreshing: boolean;
  hasServers: boolean;
  onRefresh: () => void;
  onExport: () => void;
  onEditAllJson: () => void;
  onImport: () => void;
  onAdd: () => void;
}

export function MCPServerHeader({
  isRefreshing,
  hasServers,
  onRefresh,
  onExport,
  onEditAllJson,
  onImport,
  onAdd,
}: MCPServerHeaderProps) {
  return (
    <div className="p-6 border-b border-border/50 bg-linear-to-r from-transparent via-accent/5 to-transparent">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-linear-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
              <Plug className="w-5 h-5 text-brand-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">MCP Servers</h2>
          </div>
          <p className="text-sm text-muted-foreground/80 ml-12">
            Configure Model Context Protocol servers to extend agent capabilities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={isRefreshing}
            data-testid="refresh-mcp-servers-button"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </Button>
          {hasServers && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={onExport}
                data-testid="export-mcp-servers-button"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onEditAllJson}
                data-testid="edit-all-json-button"
              >
                <Code className="w-4 h-4 mr-2" />
                Edit JSON
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={onImport}
            data-testid="import-mcp-servers-button"
          >
            <FileJson className="w-4 h-4 mr-2" />
            Import JSON
          </Button>
          <Button size="sm" onClick={onAdd} data-testid="add-mcp-server-button">
            <Plus className="w-4 h-4 mr-2" />
            Add Server
          </Button>
        </div>
      </div>
    </div>
  );
}
