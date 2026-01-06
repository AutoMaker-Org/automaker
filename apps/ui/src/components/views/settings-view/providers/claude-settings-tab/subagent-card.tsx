/**
 * Subagent Card - Display card for a single subagent definition
 *
 * Shows the subagent's name, description, model, tool count, scope, and type.
 * Read-only view - agents are managed by editing .md files directly.
 */

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Markdown } from '@/components/ui/markdown';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  Globe,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Bot,
  Cpu,
  Wrench,
  FileCode,
} from 'lucide-react';
import type { SubagentWithScope } from './hooks/use-subagents';

interface SubagentCardProps {
  agent: SubagentWithScope;
}

export function SubagentCard({ agent }: SubagentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { name, definition, scope, filePath } = agent;

  const toolCount = definition.tools?.length ?? 'all';
  const modelDisplay =
    definition.model === 'inherit' || !definition.model
      ? 'Inherit'
      : definition.model.charAt(0).toUpperCase() + definition.model.slice(1);

  // Scope icon and label
  const ScopeIcon = scope === 'global' ? Globe : FolderOpen;
  const scopeLabel = scope === 'global' ? 'User' : 'Project';

  // Model color based on type
  const getModelColor = () => {
    const model = definition.model?.toLowerCase();
    if (model === 'opus') return 'text-violet-500 bg-violet-500/10 border-violet-500/30';
    if (model === 'sonnet') return 'text-blue-500 bg-blue-500/10 border-blue-500/30';
    if (model === 'haiku') return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';
    return 'text-muted-foreground bg-muted/50 border-border/50';
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div
        className={cn(
          'rounded-xl border transition-all duration-200',
          'border-border/50 bg-accent/20',
          'hover:bg-accent/30 hover:border-border/70'
        )}
      >
        {/* Main Card Content */}
        <div className="flex items-start gap-3 p-4">
          {/* Agent Icon */}
          <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0 mt-0.5">
            <Bot className="w-4 h-4 text-violet-500" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header Row */}
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-sm">{name}</h4>
              <Badge
                variant="outline"
                size="sm"
                className={cn('flex items-center gap-1', getModelColor())}
              >
                <Cpu className="h-3 w-3" />
                {modelDisplay}
              </Badge>
              <Badge variant="muted" size="sm" className="flex items-center gap-1">
                <Wrench className="h-3 w-3" />
                {toolCount === 'all' ? 'All' : toolCount} tools
              </Badge>
              <Badge variant="muted" size="sm" className="flex items-center gap-1">
                <ScopeIcon className="h-3 w-3" />
                {scopeLabel}
              </Badge>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
              {definition.description}
            </p>

            {/* File Path */}
            {filePath && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground/60">
                <FileCode className="h-3 w-3" />
                <span className="font-mono truncate">{filePath}</span>
              </div>
            )}
          </div>

          {/* Expand Button */}
          <CollapsibleTrigger asChild>
            <button
              className={cn(
                'p-1.5 rounded-md transition-colors shrink-0',
                'hover:bg-muted/50 text-muted-foreground hover:text-foreground',
                'cursor-pointer'
              )}
              title={isExpanded ? 'Hide prompt' : 'View prompt'}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          </CollapsibleTrigger>
        </div>

        {/* Expandable Prompt Section */}
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0">
            <div className="ml-12 rounded-lg border border-border/30 bg-muted/30 p-4 overflow-auto max-h-64">
              <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                System Prompt
              </div>
              <Markdown className="text-xs prose-sm">{definition.prompt}</Markdown>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
