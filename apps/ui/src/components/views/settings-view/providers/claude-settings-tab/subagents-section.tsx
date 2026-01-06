/**
 * Subagents Section - UI for viewing filesystem-based agents
 *
 * Displays agents discovered from:
 * - User-level: ~/.claude/agents/
 * - Project-level: .claude/agents/
 *
 * Read-only view - agents are managed by editing .md files directly.
 */

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Bot, RefreshCw, Loader2, Users, ExternalLink } from 'lucide-react';
import { useSubagents } from './hooks/use-subagents';
import { SubagentCard } from './subagent-card';

export function SubagentsSection() {
  const { subagentsWithScope, isLoading, hasProject, refreshFilesystemAgents } = useSubagents();

  const handleRefresh = async () => {
    await refreshFilesystemAgents();
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-linear-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border/30">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-violet-500" />
          </div>
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              Custom Subagents
              {subagentsWithScope.length > 0 && (
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-500">
                  {subagentsWithScope.length} agent{subagentsWithScope.length !== 1 ? 's' : ''}
                </span>
              )}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Specialized agents Claude delegates to automatically
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          title="Refresh agents from disk"
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="text-xs">Refresh</span>
        </Button>
      </div>

      {/* Content */}
      <div className="p-6">
        {subagentsWithScope.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No agents found</p>
            <p className="text-xs mt-2 max-w-sm mx-auto">
              Create <code className="text-xs bg-muted px-1 rounded">.md</code> files in{' '}
              <code className="text-xs bg-muted px-1 rounded">~/.claude/agents/</code>
              {hasProject && (
                <>
                  {' or '}
                  <code className="text-xs bg-muted px-1 rounded">.claude/agents/</code>
                </>
              )}
            </p>
            <a
              href="https://code.claude.com/docs/en/agents"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-4 text-xs text-brand-500 hover:text-brand-400 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Agents documentation
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {subagentsWithScope.map((agent) => (
              <SubagentCard
                key={`${agent.type}-${agent.source || agent.scope}-${agent.name}`}
                agent={agent}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
