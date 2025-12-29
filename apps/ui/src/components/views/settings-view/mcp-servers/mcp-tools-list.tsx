import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export interface MCPToolDisplay {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  enabled: boolean;
}

interface MCPToolsListProps {
  tools: MCPToolDisplay[];
  isLoading?: boolean;
  error?: string;
  className?: string;
}

export function MCPToolsList({ tools, isLoading, error, className }: MCPToolsListProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const toggleTool = (toolName: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className={cn('text-sm text-muted-foreground animate-pulse', className)}>
        Loading tools...
      </div>
    );
  }

  if (error) {
    return <div className={cn('text-sm text-destructive wrap-break-word', className)}>{error}</div>;
  }

  if (!tools || tools.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground italic', className)}>
        No tools available
      </div>
    );
  }

  return (
    <div className={cn('space-y-1 overflow-hidden', className)}>
      {tools.map((tool) => {
        const isExpanded = expandedTools.has(tool.name);
        const hasSchema = tool.inputSchema && Object.keys(tool.inputSchema).length > 0;

        return (
          <Collapsible key={tool.name} open={isExpanded} onOpenChange={() => toggleTool(tool.name)}>
            <div
              className={cn(
                'rounded-lg border border-border/30 bg-background/50 overflow-hidden',
                'hover:border-border/50 transition-colors'
              )}
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-auto py-2 px-3 font-normal"
                >
                  <div className="flex items-start gap-2 w-full min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      {hasSchema ? (
                        isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        )
                      ) : (
                        <div className="w-3.5" />
                      )}
                      <Wrench className="w-3.5 h-3.5 text-brand-500" />
                    </div>
                    <div className="flex flex-col items-start text-left min-w-0 overflow-hidden flex-1">
                      <span className="font-medium text-xs truncate max-w-full">{tool.name}</span>
                      {tool.description && (
                        <span className="text-xs text-muted-foreground line-clamp-2 wrap-break-word w-full">
                          {tool.description}
                        </span>
                      )}
                    </div>
                  </div>
                </Button>
              </CollapsibleTrigger>
              {hasSchema && (
                <CollapsibleContent>
                  <div className="px-3 pb-2 pt-0 overflow-hidden">
                    <div className="bg-muted/50 rounded p-2 text-xs font-mono overflow-x-auto max-h-48">
                      <pre className="whitespace-pre-wrap break-all text-[10px] leading-relaxed">
                        {JSON.stringify(tool.inputSchema, null, 2)}
                      </pre>
                    </div>
                  </div>
                </CollapsibleContent>
              )}
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}
