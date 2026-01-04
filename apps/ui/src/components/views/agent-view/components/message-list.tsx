import type { ImageAttachment } from '@/store/app-store';
import { MessageBubble } from './message-bubble';
import { ThinkingIndicator } from './thinking-indicator';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  images?: ImageAttachment[];
}

interface MessageListProps {
  messages: Message[];
  isProcessing: boolean;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}

export function MessageList({
  messages,
  isProcessing,
  messagesContainerRef,
  onScroll,
}: MessageListProps) {
  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scroll-smooth"
      data-testid="message-list"
      onScroll={onScroll}
    >
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {/* Thinking Indicator */}
      {isProcessing && <ThinkingIndicator />}
    </div>
  );
}
