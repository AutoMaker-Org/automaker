/**
 * Subagents Section - UI for managing Subagents configuration
 *
 * Allows users to enable/disable Subagents and select which directories
 * to load Subagents from (user ~/.claude/agents/ or project .claude/agents/).
 *
 * Displays agents discovered from:
 * - User-level: ~/.claude/agents/
 * - Project-level: .claude/agents/
 */

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  Bot,
  RefreshCw,
  Loader2,
  Users,
  ExternalLink,
  Globe,
  FolderOpen,
  Sparkles,
} from 'lucide-react';
import { useSubagents } from './hooks/use-subagents';
import { useSubagentsSettings } from './hooks/use-subagents-settings';
import { SubagentCard } from './subagent-card';

export function SubagentsSection() {
  const {
    subagentsWithScope,
    isLoading: isLoadingAgents,
    hasProject,
    refreshFilesystemAgents,
  } = useSubagents();
  const {
    enabled,
    sources,
    updateEnabled,
    updateSources,
    isLoading: isLoadingSettings,
  } = useSubagentsSettings();

  const isLoading = isLoadingAgents || isLoadingSettings;

  const handleRefresh = async () => {
    await refreshFilesystemAgents();
  };

  const toggleSource = (source: 'user' | 'project') => {
    if (sources.includes(source)) {
      updateSources(sources.filter((s: 'user' | 'project') => s !== source));
    } else {
      updateSources([...sources, source]);
    }
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
              {enabled && subagentsWithScope.length > 0 && (
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
        <Switch
          id="enable-subagents"
          checked={enabled}
          onCheckedChange={updateEnabled}
          disabled={isLoading}
        />
      </div>

      {/* Content */}
      <div className="p-6 space-y-4">
        {/* Sources Selection */}
        {enabled && (
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Load Subagents from
            </Label>
            <div className="grid gap-2">
              {/* User Subagents Option */}
              <label
                htmlFor="subagent-source-user"
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200',
                  sources.includes('user')
                    ? 'border-violet-500/50 bg-violet-500/10'
                    : 'border-border/50 bg-accent/20 hover:bg-accent/30'
                )}
              >
                <Checkbox
                  id="subagent-source-user"
                  checked={sources.includes('user')}
                  onCheckedChange={() => toggleSource('user')}
                  disabled={isLoading}
                  className="data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                />
                <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">User Subagents</span>
                  <span className="block text-xs text-muted-foreground mt-0.5 truncate">
                    ~/.claude/agents/ — Available across all projects
                  </span>
                </div>
              </label>

              {/* Project Subagents Option */}
              <label
                htmlFor="subagent-source-project"
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200',
                  sources.includes('project')
                    ? 'border-violet-500/50 bg-violet-500/10'
                    : 'border-border/50 bg-accent/20 hover:bg-accent/30'
                )}
              >
                <Checkbox
                  id="subagent-source-project"
                  checked={sources.includes('project')}
                  onCheckedChange={() => toggleSource('project')}
                  disabled={isLoading}
                  className="data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                />
                <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <FolderOpen className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">Project Subagents</span>
                  <span className="block text-xs text-muted-foreground mt-0.5 truncate">
                    .claude/agents/ — Version-controlled with project
                  </span>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Agents List */}
        {enabled && (
          <>
            {/* Refresh Button */}
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Discovered Agents
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
                title="Refresh agents from disk"
                className="gap-1.5 h-7 px-2 text-xs"
              >
                {isLoadingAgents ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
            </div>

            {subagentsWithScope.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground border border-dashed border-border/50 rounded-xl">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No agents found</p>
                <p className="text-xs mt-1 max-w-sm mx-auto">
                  Create <code className="text-xs bg-muted px-1 rounded">.md</code> files in{' '}
                  {sources.includes('user') && (
                    <code className="text-xs bg-muted px-1 rounded">~/.claude/agents/</code>
                  )}
                  {sources.includes('user') && sources.includes('project') && ' or '}
                  {sources.includes('project') && (
                    <code className="text-xs bg-muted px-1 rounded">.claude/agents/</code>
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {subagentsWithScope.map((agent) => (
                  <SubagentCard
                    key={`${agent.type}-${agent.source || agent.scope}-${agent.name}`}
                    agent={agent}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Help Text */}
        {enabled && (
          <div className="rounded-xl border border-border/30 bg-muted/30 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-md bg-brand-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-500" />
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground/80">Auto-Discovery</p>
                <p>
                  Subagents are automatically discovered when agents start. Define agents as{' '}
                  <code className="text-xs bg-muted px-1 rounded">AGENT.md</code> files or{' '}
                  <code className="text-xs bg-muted px-1 rounded">agent-name.md</code> files.
                </p>
              </div>
            </div>
            <a
              href="https://code.claude.com/docs/en/agents"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-brand-500 hover:text-brand-400 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Agents documentation
            </a>
          </div>
        )}

        {/* Disabled State Empty Message */}
        {!enabled && (
          <div className="text-center py-6 text-muted-foreground">
            <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Subagents are disabled</p>
            <p className="text-xs mt-1">Enable to load custom agent definitions</p>
          </div>
        )}
      </div>
    </div>
  );
}
