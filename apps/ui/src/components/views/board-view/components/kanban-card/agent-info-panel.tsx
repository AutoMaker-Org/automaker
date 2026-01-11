// @ts-nocheck
import { useEffect, useState } from 'react';
import { Feature, ThinkingLevel } from '@/store/app-store';
import type { ReasoningEffort } from '@automaker/types';
import { getProviderFromModel } from '@/lib/utils';
import {
  AgentTaskInfo,
  parseAgentContext,
  formatModelName,
  DEFAULT_MODEL,
} from '@/lib/agent-context-parser';
import { cn } from '@/lib/utils';
import {
  Brain,
  ListTodo,
  Sparkles,
  Expand,
  CheckCircle2,
  Circle,
  Loader2,
  Wrench,
} from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { SummaryDialog } from './summary-dialog';
import { getProviderIconForModel } from '@/components/ui/provider-icon';

/**
 * Formats thinking level for compact display
 */
function formatThinkingLevel(level: ThinkingLevel | undefined): string {
  if (!level || level === 'none') return '';
  const labels: Record<ThinkingLevel, string> = {
    none: '',
    low: 'Low',
    medium: 'Med',
    high: 'High',
    ultrathink: 'Ultra',
  };
  return labels[level];
}

/**
 * Formats reasoning effort for compact display
 */
function formatReasoningEffort(effort: ReasoningEffort | undefined): string {
  if (!effort || effort === 'none') return '';
  const labels: Record<ReasoningEffort, string> = {
    none: '',
    minimal: 'Min',
    low: 'Low',
    medium: 'Med',
    high: 'High',
    xhigh: 'XHigh',
  };
  return labels[effort];
}

interface AgentInfoPanelProps {
  feature: Feature;
  contextContent?: string;
  summary?: string;
  isCurrentAutoTask?: boolean;
}

export function AgentInfoPanel({
  feature,
  contextContent,
  summary,
  isCurrentAutoTask,
}: AgentInfoPanelProps) {
  const [agentInfo, setAgentInfo] = useState<AgentTaskInfo | null>(null);
  const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);
  const [isTodosExpanded, setIsTodosExpanded] = useState(false);

  useEffect(() => {
    const loadContext = async () => {
      if (contextContent) {
        const info = parseAgentContext(contextContent);
        setAgentInfo(info);
        return;
      }

      if (feature.status === 'backlog') {
        setAgentInfo(null);
        return;
      }

      try {
        const api = getElectronAPI();
        const currentProject = (window as any).__currentProject;
        if (!currentProject?.path) return;

        if (api.features) {
          const result = await api.features.getAgentOutput(currentProject.path, feature.id);

          if (result.success && result.content) {
            const info = parseAgentContext(result.content);
            setAgentInfo(info);
          }
        } else {
          const contextPath = `${currentProject.path}/.automaker/features/${feature.id}/agent-output.md`;
          const result = await api.readFile(contextPath);

          if (result.success && result.content) {
            const info = parseAgentContext(result.content);
            setAgentInfo(info);
          }
        }
      } catch {
        console.debug('[KanbanCard] No context file for feature:', feature.id);
      }
    };

    loadContext();

    if (isCurrentAutoTask) {
      const interval = setInterval(loadContext, 3000);
      return () => {
        clearInterval(interval);
      };
    }
  }, [feature.id, feature.status, contextContent, isCurrentAutoTask]);
  // Model/Preset Info for Backlog Cards
  if (feature.status === 'backlog') {
    const provider = getProviderFromModel(feature.model);
    const isCodex = provider === 'codex';
    const isClaude = provider === 'claude';

    return (
      <div className="mb-3 space-y-2 overflow-hidden">
        <div className="flex items-center gap-2 text-[11px] flex-wrap">
          <div className="flex items-center gap-1 text-[var(--status-info)]">
            {(() => {
              const ProviderIcon = getProviderIconForModel(feature.model);
              return <ProviderIcon className="w-3 h-3" />;
            })()}
            <span className="font-medium">{formatModelName(feature.model ?? DEFAULT_MODEL)}</span>
          </div>
          {isClaude && feature.thinkingLevel && feature.thinkingLevel !== 'none' ? (
            <div className="flex items-center gap-1 text-purple-400">
              <Brain className="w-3 h-3" />
              <span className="font-medium">
                {formatThinkingLevel(feature.thinkingLevel as ThinkingLevel)}
              </span>
            </div>
          ) : null}
          {isCodex && feature.reasoningEffort && feature.reasoningEffort !== 'none' ? (
            <div className="flex items-center gap-1 text-purple-400">
              <Brain className="w-3 h-3" />
              <span className="font-medium">
                {formatReasoningEffort(feature.reasoningEffort as ReasoningEffort)}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // Agent Info Panel for non-backlog cards
  if (feature.status !== 'backlog' && agentInfo) {
    return (
      <>
        <div className="mb-3 space-y-2 overflow-hidden">
          {/* Model & Phase */}
          <div className="flex items-center gap-2 text-[11px] flex-wrap">
            <div className="flex items-center gap-1 text-[var(--status-info)]">
              {(() => {
                const ProviderIcon = getProviderIconForModel(feature.model);
                return <ProviderIcon className="w-3 h-3" />;
              })()}
              <span className="font-medium">{formatModelName(feature.model ?? DEFAULT_MODEL)}</span>
            </div>
            {agentInfo.currentPhase && (
              <div
                className={cn(
                  'px-1.5 py-0.5 rounded-md text-[10px] font-medium',
                  agentInfo.currentPhase === 'planning' &&
                    'bg-[var(--status-info-bg)] text-[var(--status-info)]',
                  agentInfo.currentPhase === 'action' &&
                    'bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
                  agentInfo.currentPhase === 'verification' &&
                    'bg-[var(--status-success-bg)] text-[var(--status-success)]'
                )}
              >
                {agentInfo.currentPhase}
              </div>
            )}
          </div>

          {/* Task List Progress */}
          {agentInfo.todos.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                <ListTodo className="w-3 h-3" />
                <span>
                  {agentInfo.todos.filter((t) => t.status === 'completed').length}/
                  {agentInfo.todos.length} tasks
                </span>
              </div>
              <div
                className={cn(
                  'space-y-0.5 overflow-y-auto',
                  isTodosExpanded ? 'max-h-40' : 'max-h-16'
                )}
              >
                {(isTodosExpanded ? agentInfo.todos : agentInfo.todos.slice(0, 3)).map(
                  (todo, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-[10px]">
                      {todo.status === 'completed' ? (
                        <CheckCircle2 className="w-2.5 h-2.5 text-[var(--status-success)] shrink-0" />
                      ) : todo.status === 'in_progress' ? (
                        <Loader2 className="w-2.5 h-2.5 text-[var(--status-warning)] animate-spin shrink-0" />
                      ) : (
                        <Circle className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
                      )}
                      <span
                        className={cn(
                          'break-words hyphens-auto line-clamp-2 leading-relaxed',
                          todo.status === 'completed' && 'text-muted-foreground/60 line-through',
                          todo.status === 'in_progress' && 'text-[var(--status-warning)]',
                          todo.status === 'pending' && 'text-muted-foreground/80'
                        )}
                      >
                        {todo.content}
                      </span>
                    </div>
                  )
                )}
                {agentInfo.todos.length > 3 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsTodosExpanded(!isTodosExpanded);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="text-[10px] text-muted-foreground/60 pl-4 hover:text-muted-foreground transition-colors cursor-pointer"
                  >
                    {isTodosExpanded ? 'Show less' : `+${agentInfo.todos.length - 3} more`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Summary for waiting_approval and verified */}
          {(feature.status === 'waiting_approval' || feature.status === 'verified') && (
            <>
              {(feature.summary || summary || agentInfo.summary) && (
                <div className="space-y-1.5 pt-2 border-t border-border/30 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-[10px] text-[var(--status-success)] min-w-0">
                      <Sparkles className="w-3 h-3 shrink-0" />
                      <span className="truncate font-medium">Summary</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsSummaryDialogOpen(true);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="p-0.5 rounded-md hover:bg-muted/80 transition-colors text-muted-foreground/60 hover:text-muted-foreground shrink-0"
                      title="View full summary"
                      data-testid={`expand-summary-${feature.id}`}
                    >
                      <Expand className="w-3 h-3" />
                    </button>
                  </div>
                  <p
                    className="text-[10px] text-muted-foreground/70 line-clamp-3 break-words hyphens-auto leading-relaxed overflow-hidden select-text cursor-text"
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {feature.summary || summary || agentInfo.summary}
                  </p>
                </div>
              )}
              {!feature.summary &&
                !summary &&
                !agentInfo.summary &&
                agentInfo.toolCallCount > 0 && (
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 pt-2 border-t border-border/30">
                    <span className="flex items-center gap-1">
                      <Wrench className="w-2.5 h-2.5" />
                      {agentInfo.toolCallCount} tool calls
                    </span>
                    {agentInfo.todos.length > 0 && (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5 text-[var(--status-success)]" />
                        {agentInfo.todos.filter((t) => t.status === 'completed').length} tasks done
                      </span>
                    )}
                  </div>
                )}
            </>
          )}
        </div>
        {/* SummaryDialog must be rendered alongside the expand button */}
        <SummaryDialog
          feature={feature}
          agentInfo={agentInfo}
          summary={summary}
          isOpen={isSummaryDialogOpen}
          onOpenChange={setIsSummaryDialogOpen}
        />
      </>
    );
  }

  // Always render SummaryDialog (even if no agentInfo yet)
  // This ensures the dialog can be opened from the expand button
  return (
    <SummaryDialog
      feature={feature}
      agentInfo={agentInfo}
      summary={summary}
      isOpen={isSummaryDialogOpen}
      onOpenChange={setIsSummaryDialogOpen}
    />
  );
}
