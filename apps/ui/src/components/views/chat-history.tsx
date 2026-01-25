import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus,
  MessageSquare,
  Archive,
  Trash2,
  MoreVertical,
  Search,
  ChevronLeft,
  ArchiveRestore,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

const CHAT_SESSION_ROW_HEIGHT_PX = 84;
const CHAT_SESSION_OVERSCAN_COUNT = 6;
const CHAT_SESSION_LIST_PADDING_PX = 8;

export function ChatHistory() {
  const {
    chatSessions,
    currentProject,
    currentChatSession,
    chatHistoryOpen,
    createChatSession,
    setCurrentChatSession,
    archiveChatSession,
    unarchiveChatSession,
    deleteChatSession,
    setChatHistoryOpen,
  } = useAppStore(
    useShallow((state) => ({
      chatSessions: state.chatSessions,
      currentProject: state.currentProject,
      currentChatSession: state.currentChatSession,
      chatHistoryOpen: state.chatHistoryOpen,
      createChatSession: state.createChatSession,
      setCurrentChatSession: state.setCurrentChatSession,
      archiveChatSession: state.archiveChatSession,
      unarchiveChatSession: state.unarchiveChatSession,
      deleteChatSession: state.deleteChatSession,
      setChatHistoryOpen: state.setChatHistoryOpen,
    }))
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const currentProjectId = currentProject?.id;

  // Filter sessions for current project
  const projectSessions = useMemo(() => {
    if (!currentProjectId) return [];
    return chatSessions.filter((session) => session.projectId === currentProjectId);
  }, [chatSessions, currentProjectId]);

  // Filter by search query and archived status
  const filteredSessions = useMemo(() => {
    return projectSessions.filter((session) => {
      const matchesSearch = session.title.toLowerCase().includes(normalizedQuery);
      const matchesArchivedStatus = showArchived ? session.archived : !session.archived;
      return matchesSearch && matchesArchivedStatus;
    });
  }, [projectSessions, normalizedQuery, showArchived]);

  // Sort by most recently updated
  const sortedSessions = useMemo(() => {
    return [...filteredSessions].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [filteredSessions]);

  const totalHeight =
    sortedSessions.length * CHAT_SESSION_ROW_HEIGHT_PX + CHAT_SESSION_LIST_PADDING_PX * 2;
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / CHAT_SESSION_ROW_HEIGHT_PX) - CHAT_SESSION_OVERSCAN_COUNT
  );
  const endIndex = Math.min(
    sortedSessions.length,
    Math.ceil((scrollTop + viewportHeight) / CHAT_SESSION_ROW_HEIGHT_PX) +
      CHAT_SESSION_OVERSCAN_COUNT
  );
  const offsetTop = startIndex * CHAT_SESSION_ROW_HEIGHT_PX;
  const visibleSessions = sortedSessions.slice(startIndex, endIndex);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      setScrollTop(target.scrollTop);
      scrollRafRef.current = null;
    });
  }, []);

  useEffect(() => {
    const container = listRef.current;
    if (!container || typeof window === 'undefined') return;

    const updateHeight = () => {
      setViewportHeight(container.clientHeight);
    };

    updateHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeight);
      return () => window.removeEventListener('resize', updateHeight);
    }

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(container);
    return () => observer.disconnect();
  }, [chatHistoryOpen]);

  useEffect(() => {
    if (!chatHistoryOpen) return;
    setScrollTop(0);
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [chatHistoryOpen, normalizedQuery, showArchived, currentProjectId]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  if (!currentProjectId) {
    return null;
  }

  const handleCreateNewChat = () => {
    createChatSession();
  };

  const handleSelectSession = (session: any) => {
    setCurrentChatSession(session);
  };

  const handleArchiveSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    archiveChatSession(sessionId);
  };

  const handleUnarchiveSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    unarchiveChatSession(sessionId);
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this chat session?')) {
      deleteChatSession(sessionId);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-zinc-950/50 backdrop-blur-md border-r border-white/10 transition-all duration-200',
        chatHistoryOpen ? 'w-80' : 'w-0 overflow-hidden'
      )}
    >
      {chatHistoryOpen && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              <h2 className="font-semibold">Chat History</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setChatHistoryOpen(false)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>

          {/* New Chat Button */}
          <div className="p-4 border-b">
            <Button
              onClick={handleCreateNewChat}
              className="w-full justify-start gap-2"
              variant="outline"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </Button>
          </div>

          {/* Search */}
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Archive Toggle */}
          <div className="px-4 py-2 border-b">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
              className="w-full justify-start gap-2"
            >
              {showArchived ? (
                <ArchiveRestore className="w-4 h-4" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
              {showArchived ? 'Show Active' : 'Show Archived'}
              {showArchived && (
                <Badge variant="outline" className="ml-auto">
                  {projectSessions.filter((s) => s.archived).length}
                </Badge>
              )}
            </Button>
          </div>

          {/* Chat Sessions List */}
          <div
            className="flex-1 overflow-y-auto perf-contain"
            ref={listRef}
            onScroll={handleScroll}
          >
            {sortedSessions.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                {searchQuery ? (
                  <>No chats match your search</>
                ) : showArchived ? (
                  <>No archived chats</>
                ) : (
                  <>No active chats. Create your first chat to get started!</>
                )}
              </div>
            ) : (
              <div
                className="relative"
                style={{
                  height: totalHeight,
                  paddingTop: CHAT_SESSION_LIST_PADDING_PX,
                  paddingBottom: CHAT_SESSION_LIST_PADDING_PX,
                }}
              >
                <div
                  className="absolute left-0 right-0"
                  style={{ transform: `translateY(${offsetTop}px)` }}
                >
                  {visibleSessions.map((session) => (
                    <div
                      key={session.id}
                      className={cn(
                        'flex items-center gap-2 p-3 rounded-lg cursor-pointer hover:bg-accent transition-colors group',
                        currentChatSession?.id === session.id && 'bg-accent'
                      )}
                      style={{ height: CHAT_SESSION_ROW_HEIGHT_PX }}
                      onClick={() => handleSelectSession(session)}
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">{session.title}</h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {session.messages.length} messages
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(session.updatedAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <MoreVertical className="w-3 h-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {session.archived ? (
                              <DropdownMenuItem
                                onClick={(e) => handleUnarchiveSession(session.id, e)}
                              >
                                <ArchiveRestore className="w-4 h-4 mr-2" />
                                Unarchive
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={(e) => handleArchiveSession(session.id, e)}
                              >
                                <Archive className="w-4 h-4 mr-2" />
                                Archive
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => handleDeleteSession(session.id, e)}
                              className="text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
