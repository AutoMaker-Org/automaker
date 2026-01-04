import { X } from 'lucide-react';

interface QueueItem {
  id: string;
  message: string;
  imagePaths?: string[];
}

interface QueueDisplayProps {
  serverQueue: QueueItem[];
  onRemoveFromQueue: (id: string) => void;
  onClearQueue: () => void;
}

export function QueueDisplay({ serverQueue, onRemoveFromQueue, onClearQueue }: QueueDisplayProps) {
  if (serverQueue.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          {serverQueue.length} prompt{serverQueue.length > 1 ? 's' : ''} queued
        </p>
        <button
          onClick={onClearQueue}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className="space-y-1.5">
        {serverQueue.map((item, index) => (
          <div
            key={item.id}
            className="group flex items-center gap-2 text-sm bg-muted/50 rounded-lg px-3 py-2 border border-border"
          >
            <span className="text-xs text-muted-foreground font-medium min-w-[1.5rem]">
              {index + 1}.
            </span>
            <span className="flex-1 truncate text-foreground">{item.message}</span>
            {item.imagePaths && item.imagePaths.length > 0 && (
              <span className="text-xs text-muted-foreground">
                +{item.imagePaths.length} file{item.imagePaths.length > 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={() => onRemoveFromQueue(item.id)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-all"
              title="Remove from queue"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
