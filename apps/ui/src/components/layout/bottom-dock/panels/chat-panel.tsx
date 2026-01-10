import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare,
  Plus,
  Loader2,
  Archive,
  ArchiveRestore,
  Trash2,
  X,
  Send,
  Square,
  Bot,
  User,
  AlertCircle,
  ArchiveX,
} from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { useElectronAgent } from '@/hooks/use-electron-agent';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { cn } from '@/lib/utils';
import { AgentModelSelector } from '@/components/views/agent-view/shared/agent-model-selector';
import { DeleteSessionDialog } from '@/components/dialogs/delete-session-dialog';
import type { SessionListItem } from '@/types/electron';
import type { Message } from '@/types/electron';
import type { PhaseModelEntry } from '@automaker/types';

// Random session name generator
const adjectives = [
  'Swift',
  'Bright',
  'Clever',
  'Dynamic',
  'Eager',
  'Focused',
  'Gentle',
  'Happy',
  'Inventive',
  'Jolly',
  'Keen',
  'Lively',
  'Mighty',
  'Noble',
  'Optimal',
  'Peaceful',
];

const nouns = [
  'Agent',
  'Builder',
  'Coder',
  'Developer',
  'Explorer',
  'Forge',
  'Garden',
  'Helper',
  'Journey',
  'Mission',
  'Navigator',
  'Project',
  'Quest',
  'Runner',
  'Spark',
  'Task',
];

function generateRandomSessionName(): string {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 100);
  return `${adjective} ${noun} ${number}`;
}

// Compact message bubble for dock panel
function CompactMessageBubble({ message }: { message: Message }) {
  const isError = message.isError && message.role === 'assistant';

  return (
    <div className={cn('flex gap-2', message.role === 'user' ? 'flex-row-reverse' : '')}>
      {/* Avatar */}
      <div
        className={cn(
          'w-6 h-6 rounded-lg flex items-center justify-center shrink-0',
          isError ? 'bg-red-500/10' : message.role === 'assistant' ? 'bg-primary/10' : 'bg-muted'
        )}
      >
        {isError ? (
          <AlertCircle className="w-3 h-3 text-red-500" />
        ) : message.role === 'assistant' ? (
          <Bot className="w-3 h-3 text-primary" />
        ) : (
          <User className="w-3 h-3 text-muted-foreground" />
        )}
      </div>

      {/* Message */}
      <div
        className={cn(
          'flex-1 max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs',
          isError
            ? 'bg-red-500/10 border border-red-500/30'
            : message.role === 'user'
              ? 'bg-primary text-primary-foreground'
              : 'bg-card border border-border'
        )}
      >
        {message.role === 'assistant' ? (
          <Markdown
            className={cn(
              'text-xs prose-p:leading-relaxed prose-p:my-1 prose-headings:text-sm prose-headings:my-1',
              isError ? 'text-red-600 dark:text-red-400' : 'text-foreground'
            )}
          >
            {message.content}
          </Markdown>
        ) : (
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        )}
      </div>
    </div>
  );
}

// Compact thinking indicator
function CompactThinkingIndicator() {
  return (
    <div className="flex gap-2">
      <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Bot className="w-3 h-3 text-primary" />
      </div>
      <div className="bg-card border border-border rounded-lg px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"
              style={{ animationDelay: '300ms' }}
            />
          </div>
          <span className="text-xs text-muted-foreground">Thinking...</span>
        </div>
      </div>
    </div>
  );
}

// Embedded chat component for a session
function EmbeddedChat({ sessionId, projectPath }: { sessionId: string; projectPath: string }) {
  const [input, setInput] = useState('');
  const [modelSelection, setModelSelection] = useState<PhaseModelEntry>({ model: 'sonnet' });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, isProcessing, isConnected, sendMessage, stopExecution } = useElectronAgent({
    sessionId,
    workingDirectory: projectPath,
    model: modelSelection.model,
    thinkingLevel: modelSelection.thinkingLevel,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [sessionId]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isProcessing) return;
    const messageContent = input;
    setInput('');
    await sendMessage(messageContent);
  }, [input, isProcessing, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Show welcome message if no messages
  const displayMessages =
    messages.length === 0
      ? [
          {
            id: 'welcome',
            role: 'assistant' as const,
            content: "Hello! I'm the Automaker Agent. How can I help you today?",
            timestamp: new Date().toISOString(),
          },
        ]
      : messages;

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {displayMessages.map((message) => (
          <CompactMessageBubble key={message.id} message={message} />
        ))}
        {isProcessing && <CompactThinkingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border/50 p-2">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? 'Type a message...' : 'Connecting...'}
            disabled={!isConnected}
            className={cn(
              'flex-1 h-8 rounded-md border border-border bg-background px-3 text-xs',
              'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary'
            )}
          />
          <AgentModelSelector
            value={modelSelection}
            onChange={setModelSelection}
            disabled={isProcessing}
            triggerClassName="h-8"
          />
          {isProcessing ? (
            <Button
              size="sm"
              variant="destructive"
              className="h-8 w-8 p-0"
              onClick={stopExecution}
              title="Stop"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleSend}
              disabled={!input.trim() || !isConnected}
              title="Send"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { currentProject } = useAppStore();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivingAll, setArchivingAll] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<SessionListItem | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (api?.sessions) {
        const result = await api.sessions.list(true);
        if (result.success && result.sessions) {
          setSessions(result.sessions);
          // Set active session to first active session if none selected
          const activeSessions = result.sessions.filter((s) => !s.isArchived);
          if (!activeSessionId && activeSessions.length > 0) {
            setActiveSessionId(activeSessions[0].id);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [activeSessionId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleCreateSession = useCallback(async () => {
    if (!currentProject) return;

    setCreating(true);
    try {
      const api = getElectronAPI();
      if (api?.sessions) {
        const sessionName = generateRandomSessionName();
        const result = await api.sessions.create(
          sessionName,
          currentProject.path,
          currentProject.path
        );
        if (result.success && result.session?.id) {
          await loadSessions();
          setActiveSessionId(result.session.id);
          setShowArchived(false);
        }
      }
    } catch (error) {
      console.error('Error creating session:', error);
    } finally {
      setCreating(false);
    }
  }, [currentProject, loadSessions]);

  const handleArchiveSession = useCallback(
    async (sessionId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      try {
        const api = getElectronAPI();
        if (api?.sessions) {
          await api.sessions.archive(sessionId);
          await loadSessions();
          // If archived session was active, switch to first active session
          if (sessionId === activeSessionId) {
            const updatedSessions = sessions.filter((s) => s.id !== sessionId && !s.isArchived);
            setActiveSessionId(updatedSessions.length > 0 ? updatedSessions[0].id : null);
          }
        }
      } catch (error) {
        console.error('Error archiving session:', error);
      }
    },
    [loadSessions, activeSessionId, sessions]
  );

  const handleArchiveAll = useCallback(async () => {
    const activeSessions = sessions.filter((s) => !s.isArchived);
    if (activeSessions.length === 0) return;

    setArchivingAll(true);
    try {
      const api = getElectronAPI();
      if (api?.sessions) {
        for (const session of activeSessions) {
          await api.sessions.archive(session.id);
        }
        await loadSessions();
        setActiveSessionId(null);
      }
    } catch (error) {
      console.error('Error archiving all sessions:', error);
    } finally {
      setArchivingAll(false);
    }
  }, [sessions, loadSessions]);

  const handleUnarchiveSession = useCallback(
    async (sessionId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      try {
        const api = getElectronAPI();
        if (api?.sessions) {
          await api.sessions.unarchive(sessionId);
          await loadSessions();
          setActiveSessionId(sessionId);
          setShowArchived(false);
        }
      } catch (error) {
        console.error('Error unarchiving session:', error);
      }
    },
    [loadSessions]
  );

  const handleDeleteSession = useCallback((session: SessionListItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSessionToDelete(session);
    setDeleteDialogOpen(true);
  }, []);

  const confirmDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        const api = getElectronAPI();
        if (api?.sessions) {
          await api.sessions.delete(sessionId);
          await loadSessions();
          // If deleted session was active, switch to first available session
          if (sessionId === activeSessionId) {
            const remainingSessions = sessions.filter((s) => s.id !== sessionId);
            const activeSessions = remainingSessions.filter((s) => !s.isArchived);
            setActiveSessionId(activeSessions.length > 0 ? activeSessions[0].id : null);
          }
        }
      } catch (error) {
        console.error('Error deleting session:', error);
      } finally {
        setDeleteDialogOpen(false);
        setSessionToDelete(null);
      }
    },
    [loadSessions, activeSessionId, sessions]
  );

  const activeSessions = sessions.filter((s) => !s.isArchived);
  const archivedSessions = sessions.filter((s) => s.isArchived);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-xs text-muted-foreground">Select a project to start chatting</p>
        </div>
      </div>
    );
  }

  // Show archived sessions list view
  if (showArchived) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <Archive className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">{archivedSessions.length} Archived</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => setShowArchived(false)}
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            Active
          </Button>
        </div>

        {/* Archived Sessions List */}
        <div className="flex-1 overflow-auto">
          <div className="p-2 space-y-1">
            {archivedSessions.length === 0 ? (
              <div className="text-center py-6">
                <Archive className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground">No archived sessions</p>
              </div>
            ) : (
              archivedSessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    'p-2 rounded-md border border-border bg-card',
                    'hover:bg-accent/50 transition-colors group'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
                        <p className="text-xs font-medium truncate">{session.name}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1 ml-4">
                        <span className="text-[10px] text-muted-foreground">
                          {session.messageCount} messages
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => handleUnarchiveSession(session.id, e)}
                        title="Restore"
                      >
                        <ArchiveRestore className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive"
                        onClick={(e) => handleDeleteSession(session, e)}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Delete Dialog */}
        <DeleteSessionDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          session={sessionToDelete}
          onConfirm={confirmDeleteSession}
        />
      </div>
    );
  }

  // No active sessions - show empty state
  if (activeSessions.length === 0) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Chat</span>
          </div>
          <div className="flex items-center gap-1">
            {archivedSessions.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setShowArchived(true)}
              >
                <Archive className="h-3 w-3 mr-1" />
                {archivedSessions.length}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleCreateSession}
              disabled={creating}
              title="New session"
            >
              {creating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>

        {/* Empty State */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground mb-1">No chat sessions</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={handleCreateSession}
              disabled={creating}
            >
              {creating ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Plus className="h-3 w-3 mr-1" />
              )}
              New Chat Session
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Active sessions view with tabs and embedded chat
  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center px-2 py-1 border-b border-border/50 shrink-0 gap-1 overflow-x-auto">
        {activeSessions.map((session) => (
          <button
            key={session.id}
            onClick={() => setActiveSessionId(session.id)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors shrink-0',
              session.id === activeSessionId
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
          >
            <MessageSquare className="h-3 w-3" />
            <span className="max-w-20 truncate">{session.name}</span>
            <button
              className="ml-0.5 p-0.5 rounded hover:bg-background/50 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                handleArchiveSession(session.id, e);
              }}
              title="Archive session"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </button>
        ))}

        <button
          className="flex items-center justify-center p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
          onClick={handleCreateSession}
          disabled={creating}
          title="New Session"
        >
          {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        </button>

        <div className="flex-1" />

        <div className="flex items-center gap-0.5 shrink-0">
          {activeSessions.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={handleArchiveAll}
              disabled={archivingAll}
              title="Archive all sessions"
            >
              {archivingAll ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArchiveX className="h-3 w-3" />
              )}
            </Button>
          )}
          {archivedSessions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setShowArchived(true)}
              title="View archived sessions"
            >
              <Archive className="h-3 w-3 mr-1" />
              {archivedSessions.length}
            </Button>
          )}
        </div>
      </div>

      {/* Embedded chat content */}
      <div className="flex-1 overflow-hidden">
        {activeSessionId && currentProject ? (
          <EmbeddedChat
            key={activeSessionId}
            sessionId={activeSessionId}
            projectPath={currentProject.path}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">Select a session</p>
            </div>
          </div>
        )}
      </div>

      {/* Delete Dialog */}
      <DeleteSessionDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        session={sessionToDelete}
        onConfirm={confirmDeleteSession}
      />
    </div>
  );
}
