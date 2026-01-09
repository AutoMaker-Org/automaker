import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, List, FileText, GitBranch, ClipboardList } from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { LogViewer } from '@/components/ui/log-viewer';
import { GitDiffPanel } from '@/components/ui/git-diff-panel';
import { TaskProgressPanel } from '@/components/ui/task-progress-panel';
import { Markdown } from '@/components/ui/markdown';
import { useAppStore } from '@/store/app-store';
import { extractSummary } from '@/lib/log-parser';
import type { AutoModeEvent } from '@/types/electron';

interface AgentOutputModalProps {
  open: boolean;
  onClose: () => void;
  featureDescription: string;
  featureId: string;
  /** The status of the feature - used to determine if spinner should be shown */
  featureStatus?: string;
  /** Called when a number key (0-9) is pressed while the modal is open */
  onNumberKeyPress?: (key: string) => void;
  /** Project path - if not provided, falls back to window.__currentProject for backward compatibility */
  projectPath?: string;
}

type ViewMode = 'summary' | 'parsed' | 'raw' | 'changes';

export function AgentOutputModal({
  open,
  onClose,
  featureDescription,
  featureId,
  featureStatus,
  onNumberKeyPress,
  projectPath: projectPathProp,
}: AgentOutputModalProps) {
  const [output, setOutput] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);
  const [projectPath, setProjectPath] = useState<string>('');

  // Extract summary from output
  const summary = useMemo(() => extractSummary(output), [output]);

  // Determine the effective view mode - default to summary if available, otherwise parsed
  const effectiveViewMode = viewMode ?? (summary ? 'summary' : 'parsed');
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const projectPathRef = useRef<string>('');
  const useWorktrees = useAppStore((state) => state.useWorktrees);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  // Load existing output from file
  useEffect(() => {
    if (!open) return;

    const loadOutput = async () => {
      const api = getElectronAPI();
      if (!api) return;

      setIsLoading(true);

      try {
        // Use projectPath prop if provided, otherwise fall back to window.__currentProject for backward compatibility
        const resolvedProjectPath = projectPathProp || (window as any).__currentProject?.path;
        if (!resolvedProjectPath) {
          setIsLoading(false);
          return;
        }

        projectPathRef.current = resolvedProjectPath;
        setProjectPath(resolvedProjectPath);

        // Use features API to get agent output
        if (api.features) {
          const result = await api.features.getAgentOutput(resolvedProjectPath, featureId);

          if (result.success) {
            setOutput(result.content || '');
          } else {
            setOutput('');
          }
        } else {
          setOutput('');
        }
      } catch (error) {
        console.error('Failed to load output:', error);
        setOutput('');
      } finally {
        setIsLoading(false);
      }
    };

    loadOutput();
  }, [open, featureId, projectPathProp]);

  // Listen to auto mode events and update output
  useEffect(() => {
    if (!open) return;

    const api = getElectronAPI();
    if (!api?.autoMode) return;

    console.log('[AgentOutputModal] Subscribing to events for featureId:', featureId);

    const unsubscribe = api.autoMode.onEvent((event) => {
      console.log(
        '[AgentOutputModal] Received event:',
        event.type,
        'featureId:',
        'featureId' in event ? event.featureId : 'none',
        'modalFeatureId:',
        featureId
      );

      // Filter events for this specific feature only (skip events without featureId)
      if ('featureId' in event && event.featureId !== featureId) {
        console.log('[AgentOutputModal] Skipping event - featureId mismatch');
        return;
      }

      let newContent = '';

      switch (event.type) {
        case 'auto_mode_progress':
          newContent = event.content || '';
          break;
        case 'auto_mode_tool': {
          const toolName = event.tool || 'Unknown Tool';
          const toolInput = event.input ? JSON.stringify(event.input, null, 2) : '';
          newContent = `\n🔧 Tool: ${toolName}\n${toolInput ? `Input: ${toolInput}\n` : ''}`;
          break;
        }
        case 'auto_mode_phase': {
          const phaseEmoji =
            event.phase === 'planning' ? '📋' : event.phase === 'action' ? '⚡' : '✅';
          newContent = `\n${phaseEmoji} ${event.message}\n`;
          break;
        }
        case 'auto_mode_error':
          newContent = `\n❌ Error: ${event.error}\n`;
          break;
        case 'auto_mode_ultrathink_preparation': {
          // Format thinking level preparation information
          let prepContent = `\n🧠 Ultrathink Preparation\n`;

          if (event.warnings && event.warnings.length > 0) {
            prepContent += `\n⚠️ Warnings:\n`;
            event.warnings.forEach((warning: string) => {
              prepContent += `  • ${warning}\n`;
            });
          }

          if (event.recommendations && event.recommendations.length > 0) {
            prepContent += `\n💡 Recommendations:\n`;
            event.recommendations.forEach((rec: string) => {
              prepContent += `  • ${rec}\n`;
            });
          }

          if (event.estimatedCost !== undefined) {
            prepContent += `\n💰 Estimated Cost: ~$${event.estimatedCost.toFixed(
              2
            )} per execution\n`;
          }

          if (event.estimatedTime) {
            prepContent += `\n⏱️ Estimated Time: ${event.estimatedTime}\n`;
          }

          newContent = prepContent;
          break;
        }
        case 'planning_started': {
          // Show when planning mode begins
          if ('mode' in event && 'message' in event) {
            const modeLabel =
              event.mode === 'lite' ? 'Lite' : event.mode === 'spec' ? 'Spec' : 'Full';
            newContent = `\n📋 Planning Mode: ${modeLabel}\n${event.message}\n`;
          }
          break;
        }
        case 'plan_approval_required':
          // Show when plan requires approval
          if ('planningMode' in event) {
            newContent = `\n⏸️ Plan generated - waiting for your approval...\n`;
          }
          break;
        case 'plan_approved':
          // Show when plan is manually approved
          if ('hasEdits' in event) {
            newContent = event.hasEdits
              ? `\n✅ Plan approved (with edits) - continuing to implementation...\n`
              : `\n✅ Plan approved - continuing to implementation...\n`;
          }
          break;
        case 'plan_auto_approved':
          // Show when plan is auto-approved
          newContent = `\n✅ Plan auto-approved - continuing to implementation...\n`;
          break;
        case 'plan_revision_requested': {
          // Show when user requests plan revision
          if ('planVersion' in event) {
            const revisionEvent = event as Extract<
              AutoModeEvent,
              { type: 'plan_revision_requested' }
            >;
            newContent = `\n🔄 Revising plan based on your feedback (v${revisionEvent.planVersion})...\n`;
          }
          break;
        }
        case 'auto_mode_task_started': {
          // Show when a task starts
          if ('taskId' in event && 'taskDescription' in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_task_started' }>;
            newContent = `\n▶ Starting ${taskEvent.taskId}: ${taskEvent.taskDescription}\n`;
          }
          break;
        }
        case 'auto_mode_task_complete': {
          // Show task completion progress
          if ('taskId' in event && 'tasksCompleted' in event && 'tasksTotal' in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_task_complete' }>;
            newContent = `\n✓ ${taskEvent.taskId} completed (${taskEvent.tasksCompleted}/${taskEvent.tasksTotal})\n`;
          }
          break;
        }
        case 'auto_mode_phase_complete': {
          // Show phase completion for full mode
          if ('phaseNumber' in event) {
            const phaseEvent = event as Extract<
              AutoModeEvent,
              { type: 'auto_mode_phase_complete' }
            >;
            newContent = `\n🏁 Phase ${phaseEvent.phaseNumber} complete\n`;
          }
          break;
        }
        case 'auto_mode_feature_complete': {
          const emoji = event.passes ? '✅' : '⚠️';
          newContent = `\n${emoji} Task completed: ${event.message}\n`;

          // Close the modal when the feature is verified (passes = true)
          if (event.passes) {
            // Small delay to show the completion message before closing
            setTimeout(() => {
              onClose();
            }, 1500);
          }
          break;
        }
      }

      if (newContent) {
        // Only update local state - server is the single source of truth for file writes
        setOutput((prev) => prev + newContent);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [open, featureId]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    autoScrollRef.current = isAtBottom;
  };

  // Handle number key presses while modal is open
  useEffect(() => {
    if (!open || !onNumberKeyPress) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if a number key (0-9) was pressed without modifiers
      if (!event.ctrlKey && !event.altKey && !event.metaKey && /^[0-9]$/.test(event.key)) {
        event.preventDefault();
        onNumberKeyPress(event.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onNumberKeyPress]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="w-[60vw] max-w-[60vw] max-h-[80vh] flex flex-col"
        data-testid="agent-output-modal"
      >
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2">
              {featureStatus !== 'verified' && featureStatus !== 'waiting_approval' && (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              )}
              Agent Output
            </DialogTitle>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {summary && (
                <button
                  onClick={() => setViewMode('summary')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    effectiveViewMode === 'summary'
                      ? 'bg-primary/20 text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  data-testid="view-mode-summary"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Summary
                </button>
              )}
              <button
                onClick={() => setViewMode('parsed')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  effectiveViewMode === 'parsed'
                    ? 'bg-primary/20 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                data-testid="view-mode-parsed"
              >
                <List className="w-3.5 h-3.5" />
                Logs
              </button>
              <button
                onClick={() => setViewMode('changes')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  effectiveViewMode === 'changes'
                    ? 'bg-primary/20 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                data-testid="view-mode-changes"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Changes
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  effectiveViewMode === 'raw'
                    ? 'bg-primary/20 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                data-testid="view-mode-raw"
              >
                <FileText className="w-3.5 h-3.5" />
                Raw
              </button>
            </div>
          </div>
          <DialogDescription
            className="mt-1 max-h-24 overflow-y-auto break-words"
            data-testid="agent-output-description"
          >
            {featureDescription}
          </DialogDescription>
        </DialogHeader>

        {/* Task Progress Panel - shows when tasks are being executed */}
        <TaskProgressPanel
          featureId={featureId}
          projectPath={projectPath}
          className="flex-shrink-0 mx-1"
        />

        {effectiveViewMode === 'changes' ? (
          <div className="flex-1 min-h-[400px] max-h-[60vh] overflow-y-auto scrollbar-visible">
            {projectPath ? (
              <GitDiffPanel
                projectPath={projectPath}
                featureId={featureId}
                compact={false}
                useWorktrees={useWorktrees}
                className="border-0 rounded-lg"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading...
              </div>
            )}
          </div>
        ) : effectiveViewMode === 'summary' && summary ? (
          <div className="flex-1 overflow-y-auto bg-zinc-950 rounded-lg p-4 min-h-[400px] max-h-[60vh] scrollbar-visible">
            <Markdown>{summary}</Markdown>
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto bg-zinc-950 rounded-lg p-4 font-mono text-xs min-h-[400px] max-h-[60vh] scrollbar-visible"
            >
              {isLoading && !output ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  Loading output...
                </div>
              ) : !output ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No output yet. The agent will stream output here as it works.
                </div>
              ) : effectiveViewMode === 'parsed' ? (
                <LogViewer output={output} />
              ) : (
                <div className="whitespace-pre-wrap break-words text-zinc-300">{output}</div>
              )}
            </div>

            <div className="text-xs text-muted-foreground text-center flex-shrink-0">
              {autoScrollRef.current
                ? 'Auto-scrolling enabled'
                : 'Scroll to bottom to enable auto-scroll'}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
