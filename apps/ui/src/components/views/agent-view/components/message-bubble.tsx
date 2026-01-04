import { Bot, User, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Markdown } from '@/components/ui/markdown';
import type { ImageAttachment } from '@/store/app-store';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  images?: ImageAttachment[];
}

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <div
      className={cn(
        'flex gap-4 max-w-4xl',
        message.role === 'user' ? 'flex-row-reverse ml-auto' : ''
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm',
          message.role === 'assistant'
            ? 'bg-primary/10 ring-1 ring-primary/20'
            : 'bg-muted ring-1 ring-border'
        )}
      >
        {message.role === 'assistant' ? (
          <Bot className="w-4 h-4 text-primary" />
        ) : (
          <User className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      {/* Message Bubble */}
      <div
        className={cn(
          'flex-1 max-w-[85%] rounded-2xl px-4 py-3 shadow-sm',
          message.role === 'user'
            ? 'bg-primary text-primary-foreground'
            : 'bg-card border border-border'
        )}
      >
        {message.role === 'assistant' ? (
          <Markdown className="text-sm text-foreground prose-p:leading-relaxed prose-headings:text-foreground prose-strong:text-foreground prose-code:text-primary prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded">
            {message.content}
          </Markdown>
        ) : (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        )}

        {/* Display attached images for user messages */}
        {message.role === 'user' && message.images && message.images.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-primary-foreground/80">
              <ImageIcon className="w-3 h-3" />
              <span>
                {message.images.length} image
                {message.images.length > 1 ? 's' : ''} attached
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {message.images.map((image, index) => {
                // Construct proper data URL from base64 data and mime type
                const dataUrl = image.data.startsWith('data:')
                  ? image.data
                  : `data:${image.mimeType || 'image/png'};base64,${image.data}`;
                return (
                  <div
                    key={image.id || `img-${index}`}
                    className="relative group rounded-lg overflow-hidden border border-primary-foreground/20 bg-primary-foreground/10"
                  >
                    <img
                      src={dataUrl}
                      alt={image.filename || `Attached image ${index + 1}`}
                      className="w-20 h-20 object-cover hover:opacity-90 transition-opacity"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-0.5 text-[9px] text-white truncate">
                      {image.filename || `Image ${index + 1}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p
          className={cn(
            'text-[11px] mt-2 font-medium',
            message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}
