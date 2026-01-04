import { useState, useEffect, useCallback, useRef } from 'react';
import type { Message, StreamEvent } from '@/types/electron';
import { useMessageQueue } from './use-message-queue';
import type { ImageAttachment, TextFileAttachment } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { sanitizeFilename } from '@/lib/image-utils';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('ElectronAgent');

interface UseElectronAgentOptions {
  sessionId: string;
  workingDirectory?: string;
  model?: string;
  thinkingLevel?: string;
  onToolUse?: (toolName: string, toolInput: unknown) => void;
}

// Server-side queued prompt type
interface QueuedPrompt {
  id: string;
  message: string;
  imagePaths?: string[];
  model?: string;
  thinkingLevel?: string;
  addedAt: string;
}

interface UseElectronAgentResult {
  messages: Message[];
  isProcessing: boolean;
  isConnected: boolean;
  sendMessage: (
    content: string,
    images?: ImageAttachment[],
    textFiles?: TextFileAttachment[]
  ) => Promise<void>;
  stopExecution: () => Promise<void>;
  clearHistory: () => Promise<void>;
  error: string | null;
  // Client-side queue (local)
  queuedMessages: {
    id: string;
    content: string;
    images?: ImageAttachment[];
    textFiles?: TextFileAttachment[];
    timestamp: Date;
  }[];
  isQueueProcessing: boolean;
  clearMessageQueue: () => void;
  // Server-side queue (persistent, auto-runs)
  serverQueue: QueuedPrompt[];
  addToServerQueue: (
    message: string,
    images?: ImageAttachment[],
    textFiles?: TextFileAttachment[]
  ) => Promise<void>;
  removeFromServerQueue: (promptId: string) => Promise<void>;
  clearServerQueue: () => Promise<void>;
}

/**
 * React hook for interacting with the Electron-based Claude agent
 *
 * This hook provides a clean interface to the agent running in the Electron
 * main process, which survives Next.js restarts.
 */
export function useElectronAgent({
  sessionId,
  workingDirectory,
  model,
  thinkingLevel,
  onToolUse,
}: UseElectronAgentOptions): UseElectronAgentResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverQueue, setServerQueue] = useState<QueuedPrompt[]>([]);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const currentMessageRef = useRef<Message | null>(null);

  // Send message directly to the agent (bypassing queue)
  const sendMessageDirectly = useCallback(
    async (content: string, images?: ImageAttachment[], textFiles?: TextFileAttachment[]) => {
      const api = getElectronAPI();
      if (!api?.agent) {
        setError('API not available');
        return;
      }

      if (isProcessing) {
        throw new Error('Agent is already processing a message');
      }

      setIsProcessing(true);
      setError(null);

      try {
        logger.info('Sending message directly', {
          hasImages: images && images.length > 0,
          imageCount: images?.length || 0,
          hasTextFiles: textFiles && textFiles.length > 0,
          textFileCount: textFiles?.length || 0,
        });

        // Build message content with text file context prepended
        let messageContent = content;
        if (textFiles && textFiles.length > 0) {
          const contextParts = textFiles.map((file) => {
            return `<file name="${file.filename}">\n${file.content}\n</file>`;
          });
          const contextBlock = `Here are some files for context:\n\n${contextParts.join('\n\n')}\n\n`;
          messageContent = contextBlock + content;
        }

        // Save images to .automaker/images and get paths
        let imagePaths: string[] | undefined;
        if (images && images.length > 0 && api.saveImageToTemp) {
          imagePaths = [];
          for (const image of images) {
            const result = await api.saveImageToTemp(
              image.data,
              sanitizeFilename(image.filename),
              image.mimeType,
              workingDirectory // Pass workingDirectory as projectPath
            );
            if (result.success && result.path) {
              imagePaths.push(result.path);
              logger.info('Saved image to .automaker/images:', result.path);
            } else {
              logger.error('Failed to save image:', result.error);
            }
          }
        }

        const result = await api.agent!.send(
          sessionId,
          messageContent,
          workingDirectory,
          imagePaths,
          model,
          thinkingLevel
        );

        if (!result.success) {
          setError(result.error || 'Failed to send message');
          setIsProcessing(false);
        }
        // Note: We don't set isProcessing to false here because
        // it will be set by the "complete" or "error" stream event
      } catch (err) {
        logger.error('Failed to send message:', err);
        setError(err instanceof Error ? err.message : 'Failed to send message');
        setIsProcessing(false);
        throw err;
      }
    },
    [sessionId, workingDirectory, model, thinkingLevel, isProcessing]
  );

  // Message queue for queuing messages when agent is busy
  const { queuedMessages, isProcessingQueue, addToQueue, clearQueue, processNext } =
    useMessageQueue({
      onProcessNext: async (queuedMessage) => {
        await sendMessageDirectly(
          queuedMessage.content,
          queuedMessage.images,
          queuedMessage.textFiles
        );
      },
    });

  // Initialize connection and load history
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.agent) {
      setError('API not available.');
      return;
    }

    if (!sessionId) {
      // No session selected - reset state
      setMessages([]);
      setIsConnected(false);
      setIsProcessing(false);
      setError(null);
      return;
    }

    let mounted = true;

    const initialize = async () => {
      // Reset error state when switching sessions
      setError(null);

      try {
        logger.info('Starting session:', sessionId);
        const result = await api.agent!.start(sessionId, workingDirectory);

        if (!mounted) return;

        if (result.success && result.messages) {
          logger.info('Loaded', result.messages.length, 'messages');
          setMessages(result.messages);
          setIsConnected(true);

          // Check if the agent is currently running for this session
          const historyResult = await api.agent!.getHistory(sessionId);
          if (mounted && historyResult.success) {
            const isRunning = historyResult.isRunning || false;
            logger.info('Session running state:', isRunning);
            setIsProcessing(isRunning);
          }
        } else {
          setError(result.error || 'Failed to start session');
          setIsProcessing(false);
        }
      } catch (err) {
        if (!mounted) return;
        logger.error('Failed to initialize:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize');
        setIsProcessing(false);
      }
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, [sessionId, workingDirectory]);

  // Auto-process queue when agent finishes processing
  useEffect(() => {
    if (!isProcessing && !isProcessingQueue && queuedMessages.length > 0) {
      logger.info('Auto-processing next queued message');
      processNext();
    }
  }, [isProcessing, isProcessingQueue, queuedMessages.length, processNext]);

  // Subscribe to streaming events
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.agent) return;
    if (!sessionId) return; // Don't subscribe if no session

    logger.info('Subscribing to stream events for session:', sessionId);

    const handleStream = (event: StreamEvent) => {
      // CRITICAL: Only process events for our specific session
      if (event.sessionId !== sessionId) {
        logger.info('Ignoring event for different session:', event.sessionId);
        return;
      }

      logger.info('Stream event for', sessionId, ':', event.type);

      switch (event.type) {
        case 'started':
          // Agent started processing (including from queue)
          logger.info('Agent started processing for session:', sessionId);
          setIsProcessing(true);
          break;

        case 'message':
          // User message added
          setMessages((prev) => [...prev, event.message]);
          break;

        case 'stream':
          // Assistant message streaming
          if (event.isComplete) {
            // Final update
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === event.messageId ? { ...msg, content: event.content } : msg
              )
            );
            currentMessageRef.current = null;
          } else {
            // Streaming update
            setMessages((prev) => {
              const existingIndex = prev.findIndex((m) => m.id === event.messageId);
              if (existingIndex >= 0) {
                // Update existing message
                return prev.map((msg) =>
                  msg.id === event.messageId ? { ...msg, content: event.content } : msg
                );
              } else {
                // Create new message
                const newMessage: Message = {
                  id: event.messageId,
                  role: 'assistant',
                  content: event.content,
                  timestamp: new Date().toISOString(),
                };
                currentMessageRef.current = newMessage;
                return [...prev, newMessage];
              }
            });
          }
          break;

        case 'tool_use':
          // Tool being used
          logger.info('Tool use:', event.tool.name);
          onToolUse?.(event.tool.name, event.tool.input);
          break;

        case 'complete':
          // Agent finished processing for THIS session
          logger.info('Processing complete for session:', sessionId);
          setIsProcessing(false);
          if (event.messageId) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === event.messageId ? { ...msg, content: event.content } : msg
              )
            );
          }
          break;

        case 'error':
          // Error occurred for THIS session
          logger.error('Agent error for session:', sessionId, event.error);
          setIsProcessing(false);
          setError(event.error);
          if (event.message) {
            const errorMessage = event.message;
            setMessages((prev) => [...prev, errorMessage]);
          }
          break;

        case 'queue_updated':
          // Server queue was updated
          logger.info('Queue updated:', event.queue);
          setServerQueue(event.queue || []);
          break;

        case 'queue_error':
          // Error processing a queued prompt
          logger.error('Queue error:', event.error);
          setError(event.error);
          break;
      }
    };

    unsubscribeRef.current = api.agent!.onStream(handleStream as (data: unknown) => void);

    return () => {
      if (unsubscribeRef.current) {
        logger.info('Unsubscribing from stream events for session:', sessionId);
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [sessionId, onToolUse]);

  // Send a message to the agent
  const sendMessage = useCallback(
    async (content: string, images?: ImageAttachment[], textFiles?: TextFileAttachment[]) => {
      const api = getElectronAPI();
      if (!api?.agent) {
        setError('API not available');
        return;
      }

      if (isProcessing) {
        logger.warn('Already processing a message');
        return;
      }

      setIsProcessing(true);
      setError(null);

      try {
        logger.info('Sending message', {
          hasImages: images && images.length > 0,
          imageCount: images?.length || 0,
          hasTextFiles: textFiles && textFiles.length > 0,
          textFileCount: textFiles?.length || 0,
        });

        // Build message content with text file context prepended
        let messageContent = content;
        if (textFiles && textFiles.length > 0) {
          const contextParts = textFiles.map((file) => {
            return `<file name="${file.filename}">\n${file.content}\n</file>`;
          });
          const contextBlock = `Here are some files for context:\n\n${contextParts.join('\n\n')}\n\n`;
          messageContent = contextBlock + content;
        }

        // Save images to .automaker/images and get paths
        let imagePaths: string[] | undefined;
        if (images && images.length > 0 && api.saveImageToTemp) {
          imagePaths = [];
          for (const image of images) {
            const result = await api.saveImageToTemp(
              image.data,
              sanitizeFilename(image.filename),
              image.mimeType,
              workingDirectory // Pass workingDirectory as projectPath
            );
            if (result.success && result.path) {
              imagePaths.push(result.path);
              logger.info('Saved image to .automaker/images:', result.path);
            } else {
              logger.error('Failed to save image:', result.error);
            }
          }
        }

        const result = await api.agent!.send(
          sessionId,
          messageContent,
          workingDirectory,
          imagePaths,
          model,
          thinkingLevel
        );

        if (!result.success) {
          setError(result.error || 'Failed to send message');
          setIsProcessing(false);
        }
        // Note: We don't set isProcessing to false here because
        // it will be set by the "complete" or "error" stream event
      } catch (err) {
        logger.error('Failed to send message:', err);
        setError(err instanceof Error ? err.message : 'Failed to send message');
        setIsProcessing(false);
      }
    },
    [sessionId, workingDirectory, model, thinkingLevel, isProcessing]
  );

  // Stop current execution
  const stopExecution = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.agent) {
      setError('API not available');
      return;
    }

    try {
      logger.info('Stopping execution');
      const result = await api.agent!.stop(sessionId);

      if (!result.success) {
        setError(result.error || 'Failed to stop execution');
      } else {
        setIsProcessing(false);
      }
    } catch (err) {
      logger.error('Failed to stop:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop execution');
    }
  }, [sessionId]);

  // Clear conversation history
  const clearHistory = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.agent) {
      setError('API not available');
      return;
    }

    try {
      logger.info('Clearing history');
      const result = await api.agent!.clear(sessionId);

      if (result.success) {
        setMessages([]);
        setError(null);
      } else {
        setError(result.error || 'Failed to clear history');
      }
    } catch (err) {
      logger.error('Failed to clear:', err);
      setError(err instanceof Error ? err.message : 'Failed to clear history');
    }
  }, [sessionId]);

  // Add a prompt to the server queue (will auto-run when current task finishes)
  const addToServerQueue = useCallback(
    async (message: string, images?: ImageAttachment[], textFiles?: TextFileAttachment[]) => {
      const api = getElectronAPI();
      if (!api?.agent?.queueAdd) {
        setError('Queue API not available');
        return;
      }

      try {
        // Build message content with text file context
        let messageContent = message;
        if (textFiles && textFiles.length > 0) {
          const contextParts = textFiles.map((file) => {
            return `<file name="${file.filename}">\n${file.content}\n</file>`;
          });
          const contextBlock = `Here are some files for context:\n\n${contextParts.join('\n\n')}\n\n`;
          messageContent = contextBlock + message;
        }

        // Save images and get paths
        let imagePaths: string[] | undefined;
        if (images && images.length > 0 && api.saveImageToTemp) {
          imagePaths = [];
          for (const image of images) {
            const result = await api.saveImageToTemp(
              image.data,
              sanitizeFilename(image.filename),
              image.mimeType,
              workingDirectory
            );
            if (result.success && result.path) {
              imagePaths.push(result.path);
            }
          }
        }

        logger.info('Adding to server queue');
        const result = await api.agent.queueAdd(
          sessionId,
          messageContent,
          imagePaths,
          model,
          thinkingLevel
        );

        if (!result.success) {
          setError(result.error || 'Failed to add to queue');
        }
      } catch (err) {
        logger.error('Failed to add to queue:', err);
        setError(err instanceof Error ? err.message : 'Failed to add to queue');
      }
    },
    [sessionId, workingDirectory, model, thinkingLevel]
  );

  // Remove a prompt from the server queue
  const removeFromServerQueue = useCallback(
    async (promptId: string) => {
      const api = getElectronAPI();
      if (!api?.agent?.queueRemove) {
        setError('Queue API not available');
        return;
      }

      try {
        logger.info('Removing from server queue:', promptId);
        const result = await api.agent.queueRemove(sessionId, promptId);

        if (!result.success) {
          setError(result.error || 'Failed to remove from queue');
        }
      } catch (err) {
        logger.error('Failed to remove from queue:', err);
        setError(err instanceof Error ? err.message : 'Failed to remove from queue');
      }
    },
    [sessionId]
  );

  // Clear the entire server queue
  const clearServerQueue = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.agent?.queueClear) {
      setError('Queue API not available');
      return;
    }

    try {
      logger.info('Clearing server queue');
      const result = await api.agent.queueClear(sessionId);

      if (!result.success) {
        setError(result.error || 'Failed to clear queue');
      }
    } catch (err) {
      logger.error('Failed to clear queue:', err);
      setError(err instanceof Error ? err.message : 'Failed to clear queue');
    }
  }, [sessionId]);

  return {
    messages,
    isProcessing,
    isConnected,
    sendMessage,
    stopExecution,
    clearHistory,
    error,
    queuedMessages,
    isQueueProcessing: isProcessingQueue,
    clearMessageQueue: clearQueue,
    // Server-side queue
    serverQueue,
    addToServerQueue,
    removeFromServerQueue,
    clearServerQueue,
  };
}
