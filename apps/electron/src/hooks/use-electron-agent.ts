import { useState, useEffect, useCallback, useRef } from "react";
import type { Message } from "@/types/electron";
import { useMessageQueue } from "./use-message-queue";
import type { ImageAttachment } from "@/store/app-store";
import { services, isBootstrapped } from "@/services";
import type { StreamEvent } from "@/services/types/events";

interface UseElectronAgentOptions {
  sessionId: string;
  workingDirectory?: string;
  onToolUse?: (toolName: string, toolInput: unknown) => void;
}

interface UseElectronAgentResult {
  messages: Message[];
  isProcessing: boolean;
  isConnected: boolean;
  sendMessage: (content: string, images?: ImageAttachment[]) => Promise<void>;
  stopExecution: () => Promise<void>;
  clearHistory: () => Promise<void>;
  error: string | null;
  // Queue-related state
  queuedMessages: { id: string; content: string; images?: ImageAttachment[]; timestamp: Date }[];
  isQueueProcessing: boolean;
  clearMessageQueue: () => void;
}

/**
 * React hook for interacting with the Claude agent via the service layer
 *
 * This hook provides a clean interface to the agent, abstracted from the
 * underlying implementation (Electron IPC, REST API, or mock).
 */
export function useElectronAgent({
  sessionId,
  workingDirectory,
  onToolUse,
}: UseElectronAgentOptions): UseElectronAgentResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const currentMessageRef = useRef<Message | null>(null);

  // Send message directly to the agent (bypassing queue)
  const sendMessageDirectly = useCallback(
    async (content: string, images?: ImageAttachment[]) => {
      if (!isBootstrapped()) {
        setError("Services not initialized");
        return;
      }

      if (isProcessing) {
        throw new Error("Agent is already processing a message");
      }

      setIsProcessing(true);
      setError(null);

      try {
        console.log("[useElectronAgent] Sending message directly", {
          hasImages: images && images.length > 0,
          imageCount: images?.length || 0
        });

        // Save images to .automaker/images and get paths
        let imagePaths: string[] | undefined;
        if (images && images.length > 0) {
          imagePaths = [];
          for (const image of images) {
            const result = await services.app.saveImageToTemp(
              image.data,
              image.filename,
              image.mimeType,
              workingDirectory // Pass workingDirectory as projectPath
            );
            if (result.success && result.data?.path) {
              imagePaths.push(result.data.path);
              console.log("[useElectronAgent] Saved image to .automaker/images:", result.data.path);
            } else {
              console.error("[useElectronAgent] Failed to save image:", result.error);
            }
          }
        }

        const result = await services.agent.send(
          sessionId,
          content,
          workingDirectory,
          imagePaths
        );

        if (!result.success) {
          setError(result.error || "Failed to send message");
          setIsProcessing(false);
        }
        // Note: We don't set isProcessing to false here because
        // it will be set by the "complete" or "error" stream event
      } catch (err) {
        console.error("[useElectronAgent] Failed to send message:", err);
        setError(err instanceof Error ? err.message : "Failed to send message");
        setIsProcessing(false);
        throw err;
      }
    },
    [sessionId, workingDirectory, isProcessing]
  );

  // Message queue for queuing messages when agent is busy
  const {
    queuedMessages,
    isProcessingQueue,
    addToQueue,
    clearQueue,
    processNext,
  } = useMessageQueue({
    onProcessNext: async (queuedMessage) => {
      await sendMessageDirectly(queuedMessage.content, queuedMessage.images);
    },
  });

  // Initialize connection and load history
  useEffect(() => {
    if (!isBootstrapped()) {
      setError("Services not initialized. Please wait...");
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
        console.log("[useElectronAgent] Starting session:", sessionId);
        const result = await services.agent.start(
          sessionId,
          workingDirectory
        );

        if (!mounted) return;

        if (result.success && result.data?.messages) {
          console.log("[useElectronAgent] Loaded", result.data.messages.length, "messages");
          setMessages(result.data.messages);
          setIsConnected(true);

          // Check if the agent is currently running for this session
          const historyResult = await services.agent.getHistory(sessionId);
          if (mounted && historyResult.success && historyResult.data) {
            const isRunning = historyResult.data.isRunning || false;
            console.log("[useElectronAgent] Session running state:", isRunning);
            setIsProcessing(isRunning);
          }
        } else {
          setError(result.error || "Failed to start session");
          setIsProcessing(false);
        }
      } catch (err) {
        if (!mounted) return;
        console.error("[useElectronAgent] Failed to initialize:", err);
        setError(err instanceof Error ? err.message : "Failed to initialize");
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
      console.log("[useElectronAgent] Auto-processing next queued message");
      processNext();
    }
  }, [isProcessing, isProcessingQueue, queuedMessages.length, processNext]);

  // Subscribe to streaming events
  useEffect(() => {
    if (!isBootstrapped()) return;
    if (!sessionId) return; // Don't subscribe if no session

    console.log("[useElectronAgent] Subscribing to stream events for session:", sessionId);

    const handleStream = (event: StreamEvent) => {
      // CRITICAL: Only process events for our specific session
      if (event.sessionId !== sessionId) {
        console.log("[useElectronAgent] Ignoring event for different session:", event.sessionId);
        return;
      }

      console.log("[useElectronAgent] Stream event for", sessionId, ":", event.type);

      switch (event.type) {
        case "message":
          // User message added
          if (event.message) {
            setMessages((prev) => [...prev, event.message!]);
          }
          break;

        case "stream":
          // Assistant message streaming
          if (event.isComplete) {
            // Final update
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === event.messageId
                  ? { ...msg, content: event.content || "" }
                  : msg
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
                  msg.id === event.messageId
                    ? { ...msg, content: event.content || "" }
                    : msg
                );
              } else {
                // Create new message
                const newMessage: Message = {
                  id: event.messageId!,
                  role: "assistant",
                  content: event.content || "",
                  timestamp: new Date().toISOString(),
                };
                currentMessageRef.current = newMessage;
                return [...prev, newMessage];
              }
            });
          }
          break;

        case "tool_use":
          // Tool being used
          if (event.tool) {
            console.log("[useElectronAgent] Tool use:", event.tool.name);
            onToolUse?.(event.tool.name, event.tool.input);
          }
          break;

        case "complete":
          // Agent finished processing for THIS session
          console.log("[useElectronAgent] Processing complete for session:", sessionId);
          setIsProcessing(false);
          if (event.messageId) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === event.messageId
                  ? { ...msg, content: event.content || "" }
                  : msg
              )
            );
          }
          break;

        case "error":
          // Error occurred for THIS session
          console.error("[useElectronAgent] Agent error for session:", sessionId, event.error);
          setIsProcessing(false);
          setError(event.error || "Unknown error");
          if (event.message) {
            const errorMessage = event.message;
            setMessages((prev) => [...prev, errorMessage]);
          }
          break;
      }
    };

    const { unsubscribe } = services.agent.onStream(handleStream);
    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        console.log("[useElectronAgent] Unsubscribing from stream events for session:", sessionId);
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [sessionId, onToolUse]);

  // Send a message to the agent
  const sendMessage = useCallback(
    async (content: string, images?: ImageAttachment[]) => {
      if (!isBootstrapped()) {
        setError("Services not initialized");
        return;
      }

      if (isProcessing) {
        console.warn("[useElectronAgent] Already processing a message");
        return;
      }

      setIsProcessing(true);
      setError(null);

      try {
        console.log("[useElectronAgent] Sending message", {
          hasImages: images && images.length > 0,
          imageCount: images?.length || 0
        });

        // Save images to .automaker/images and get paths
        let imagePaths: string[] | undefined;
        if (images && images.length > 0) {
          imagePaths = [];
          for (const image of images) {
            const result = await services.app.saveImageToTemp(
              image.data,
              image.filename,
              image.mimeType,
              workingDirectory // Pass workingDirectory as projectPath
            );
            if (result.success && result.data?.path) {
              imagePaths.push(result.data.path);
              console.log("[useElectronAgent] Saved image to .automaker/images:", result.data.path);
            } else {
              console.error("[useElectronAgent] Failed to save image:", result.error);
            }
          }
        }

        const result = await services.agent.send(
          sessionId,
          content,
          workingDirectory,
          imagePaths
        );

        if (!result.success) {
          setError(result.error || "Failed to send message");
          setIsProcessing(false);
        }
        // Note: We don't set isProcessing to false here because
        // it will be set by the "complete" or "error" stream event
      } catch (err) {
        console.error("[useElectronAgent] Failed to send message:", err);
        setError(err instanceof Error ? err.message : "Failed to send message");
        setIsProcessing(false);
      }
    },
    [sessionId, workingDirectory, isProcessing]
  );

  // Stop current execution
  const stopExecution = useCallback(async () => {
    if (!isBootstrapped()) {
      setError("Services not initialized");
      return;
    }

    try {
      console.log("[useElectronAgent] Stopping execution");
      const result = await services.agent.stop(sessionId);

      if (!result.success) {
        setError(result.error || "Failed to stop execution");
      } else {
        setIsProcessing(false);
      }
    } catch (err) {
      console.error("[useElectronAgent] Failed to stop:", err);
      setError(err instanceof Error ? err.message : "Failed to stop execution");
    }
  }, [sessionId]);

  // Clear conversation history
  const clearHistory = useCallback(async () => {
    if (!isBootstrapped()) {
      setError("Services not initialized");
      return;
    }

    try {
      console.log("[useElectronAgent] Clearing history");
      const result = await services.agent.clear(sessionId);

      if (result.success) {
        setMessages([]);
        setError(null);
      } else {
        setError(result.error || "Failed to clear history");
      }
    } catch (err) {
      console.error("[useElectronAgent] Failed to clear:", err);
      setError(err instanceof Error ? err.message : "Failed to clear history");
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
  };
}
