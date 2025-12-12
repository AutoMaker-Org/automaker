import { useState, useCallback } from 'react';
import type { ImageAttachment } from '@/store/app-store';

export interface QueuedMessage {
  id: string;
  content: string;
  images?: ImageAttachment[];
  timestamp: Date;
}

interface UseMessageQueueOptions {
  onProcessNext: (message: QueuedMessage) => Promise<void>;
}

interface UseMessageQueueResult {
  queuedMessages: QueuedMessage[];
  isProcessingQueue: boolean;
  addToQueue: (content: string, images?: ImageAttachment[]) => void;
  clearQueue: () => void;
  removeFromQueue: (messageId: string) => void;
  processNext: () => Promise<void>;
}

/**
 * React hook for managing a queue of messages to be sent to the agent
 *
 * This allows users to queue up multiple messages while one is being processed,
 * improving the chat experience by removing blocking behavior.
 */
export function useMessageQueue({ onProcessNext }: UseMessageQueueOptions): UseMessageQueueResult {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  const addToQueue = useCallback((content: string, images?: ImageAttachment[]) => {
    const queuedMessage: QueuedMessage = {
      id: `queued-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: content.trim(),
      images,
      timestamp: new Date(),
    };

    setQueuedMessages(prev => [...prev, queuedMessage]);
  }, []);

  const removeFromQueue = useCallback((messageId: string) => {
    setQueuedMessages(prev => prev.filter(msg => msg.id !== messageId));
  }, []);

  const clearQueue = useCallback(() => {
    setQueuedMessages([]);
  }, []);

  const processNext = useCallback(async () => {
    if (queuedMessages.length === 0 || isProcessingQueue) {
      return;
    }

    const nextMessage = queuedMessages[0];
    setIsProcessingQueue(true);

    try {
      await onProcessNext(nextMessage);
      // Remove the processed message from queue
      setQueuedMessages(prev => prev.slice(1));
    } catch (error) {
      console.error('Error processing queued message:', error);
      // Keep the message in queue for retry or manual removal
    } finally {
      setIsProcessingQueue(false);
    }
  }, [queuedMessages, isProcessingQueue, onProcessNext]);

  return {
    queuedMessages,
    isProcessingQueue,
    addToQueue,
    clearQueue,
    removeFromQueue,
    processNext,
  };
}