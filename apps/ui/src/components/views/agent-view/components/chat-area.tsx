import type { ImageAttachment } from '@/store/app-store';
import { MessageList } from './message-list';
import { NoSessionState } from './empty-states';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  images?: ImageAttachment[];
}

interface ChatAreaProps {
  currentSessionId: string | null;
  messages: Message[];
  isProcessing: boolean;
  showSessionManager: boolean;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onShowSessionManager: () => void;
}

export function ChatArea({
  currentSessionId,
  messages,
  isProcessing,
  showSessionManager,
  messagesContainerRef,
  onScroll,
  onShowSessionManager,
}: ChatAreaProps) {
  if (!currentSessionId) {
    return (
      <NoSessionState
        showSessionManager={showSessionManager}
        onShowSessionManager={onShowSessionManager}
      />
    );
  }

  return (
    <MessageList
      messages={messages}
      isProcessing={isProcessing}
      messagesContainerRef={messagesContainerRef}
      onScroll={onScroll}
    />
  );
}
