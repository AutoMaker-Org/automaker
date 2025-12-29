import { ChevronDown, ChevronRight, Code, Pencil, Trash2, PlayCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { MCPServerConfig } from '@automaker/types';
import type { ServerTestState } from '../types';
import { getServerIcon, getTestStatusIcon, maskSensitiveUrl } from '../utils';
import { MCPToolsList } from '../mcp-tools-list';

interface MCPServerCardProps {
  server: MCPServerConfig;
  testState?: ServerTestState;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onTest: () => void;
  onToggleEnabled: () => void;
  onEditJson: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function MCPServerCard({
  server,
  testState,
  isExpanded,
  onToggleExpanded,
  onTest,
  onToggleEnabled,
  onEditJson,
  onEdit,
  onDelete,
}: MCPServerCardProps) {
  const Icon = getServerIcon(server.type);
  const hasTools = testState?.tools && testState.tools.length > 0;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggleExpanded}>
      <div
        className={cn(
          'rounded-xl border',
          server.enabled !== false
            ? 'border-border/50 bg-accent/20'
            : 'border-border/30 bg-muted/30 opacity-60'
        )}
        data-testid={`mcp-server-${server.id}`}
      >
        <div className="flex items-center justify-between p-4 gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-3 text-left min-w-0 flex-1',
                  hasTools && 'cursor-pointer hover:opacity-80'
                )}
                disabled={!hasTools}
              >
                {hasTools ? (
                  isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )
                ) : (
                  <div className="w-4 shrink-0" />
                )}
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    server.enabled !== false ? 'bg-brand-500/20' : 'bg-muted'
                  )}
                >
                  <Icon className="w-4 h-4 text-brand-500" />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{server.name}</span>
                    {testState && getTestStatusIcon(testState.status)}
                    {testState?.status === 'success' && testState.tools && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded whitespace-nowrap">
                        {testState.tools.length} tool{testState.tools.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {server.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {server.description}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground/60 mt-0.5 truncate">
                    {server.type === 'stdio'
                      ? `${server.command}${server.args?.length ? ' ' + server.args.join(' ') : ''}`
                      : maskSensitiveUrl(server.url || '')}
                  </div>
                  {testState?.status === 'error' && testState.error && (
                    <div className="text-xs text-destructive mt-1 line-clamp-2 break-words">
                      {testState.error}
                    </div>
                  )}
                </div>
              </button>
            </CollapsibleTrigger>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onTest}
              disabled={testState?.status === 'testing' || server.enabled === false}
              data-testid={`mcp-server-test-${server.id}`}
              className="h-8 px-2"
            >
              {testState?.status === 'testing' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PlayCircle className="w-4 h-4" />
              )}
              <span className="ml-1.5 text-xs">Test</span>
            </Button>
            <Switch
              checked={server.enabled !== false}
              onCheckedChange={onToggleEnabled}
              data-testid={`mcp-server-toggle-${server.id}`}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={onEditJson}
              title="Edit JSON"
              data-testid={`mcp-server-json-${server.id}`}
            >
              <Code className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              data-testid={`mcp-server-edit-${server.id}`}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
              data-testid={`mcp-server-delete-${server.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {hasTools && (
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-0 ml-7 overflow-hidden">
              <div className="text-xs font-medium text-muted-foreground mb-2">Available Tools</div>
              <MCPToolsList
                tools={testState.tools!}
                isLoading={testState.status === 'testing'}
                error={testState.error}
                className="max-w-full"
              />
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}
