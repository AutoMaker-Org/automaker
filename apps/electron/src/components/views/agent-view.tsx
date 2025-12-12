"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageDropZone } from "@/components/ui/image-drop-zone";
import {
  Bot,
  Send,
  User,
  Loader2,
  Sparkles,
  Wrench,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  Paperclip,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useElectronAgent } from "@/hooks/use-electron-agent";
import { SessionManager } from "@/components/session-manager";
import { Markdown } from "@/components/ui/markdown";
import type { ImageAttachment } from "@/store/app-store";
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  KeyboardShortcut,
} from "@/hooks/use-keyboard-shortcuts";

export function AgentView() {
  const { currentProject, setLastSelectedSession, getLastSelectedSession } = useAppStore();
  const shortcuts = useKeyboardShortcutsConfig();
  const [input, setInput] = useState("");
  const [selectedImages, setSelectedImages] = useState<ImageAttachment[]>([]);
  const [showImageDropZone, setShowImageDropZone] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showSessionManager, setShowSessionManager] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);

  // Track if initial session has been loaded
  const initialSessionLoadedRef = useRef(false);

  // Scroll management for auto-scroll
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);

  // Input ref for auto-focus
  const inputRef = useRef<HTMLInputElement>(null);

  // Ref for quick create session function from SessionManager
  const quickCreateSessionRef = useRef<(() => Promise<void>) | null>(null);

  // Use the Electron agent hook (only if we have a session)
  const {
    messages,
    isProcessing,
    isConnected,
    sendMessage,
    clearHistory,
    error: agentError,
  } = useElectronAgent({
    sessionId: currentSessionId || "",
    workingDirectory: currentProject?.path,
    onToolUse: (toolName) => {
      setCurrentTool(toolName);
      setTimeout(() => setCurrentTool(null), 2000);
    },
  });

  // Handle session selection with persistence
  const handleSelectSession = useCallback((sessionId: string | null) => {
    setCurrentSessionId(sessionId);
    // Persist the selection for this project
    if (currentProject?.path) {
      setLastSelectedSession(currentProject.path, sessionId);
    }
  }, [currentProject?.path, setLastSelectedSession]);

  // Restore last selected session when switching to Agent view or when project changes
  useEffect(() => {
    if (!currentProject?.path) {
      // No project, reset
      setCurrentSessionId(null);
      initialSessionLoadedRef.current = false;
      return;
    }

    // Only restore once per project
    if (initialSessionLoadedRef.current) return;
    initialSessionLoadedRef.current = true;

    const lastSessionId = getLastSelectedSession(currentProject.path);
    if (lastSessionId) {
      console.log("[AgentView] Restoring last selected session:", lastSessionId);
      setCurrentSessionId(lastSessionId);
    }
  }, [currentProject?.path, getLastSelectedSession]);

  // Reset initialSessionLoadedRef when project changes
  useEffect(() => {
    initialSessionLoadedRef.current = false;
  }, [currentProject?.path]);

  const handleSend = useCallback(async () => {
    if ((!input.trim() && selectedImages.length === 0) || isProcessing) return;

    const messageContent = input;
    const messageImages = selectedImages;

    setInput("");
    setSelectedImages([]);
    setShowImageDropZone(false);

    await sendMessage(messageContent, messageImages);
  }, [input, selectedImages, isProcessing, sendMessage]);

  const handleImagesSelected = useCallback((images: ImageAttachment[]) => {
    setSelectedImages(images);
  }, []);

  const toggleImageDropZone = useCallback(() => {
    setShowImageDropZone(!showImageDropZone);
  }, [showImageDropZone]);

  // Helper function to convert file to base64
  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to read file as base64"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }, []);

  // Process dropped files
  const processDroppedFiles = useCallback(
    async (files: FileList) => {
      if (isProcessing) return;

      const ACCEPTED_IMAGE_TYPES = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
      ];
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      const MAX_FILES = 5;

      const newImages: ImageAttachment[] = [];
      const errors: string[] = [];

      for (const file of Array.from(files)) {
        // Validate file type
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
          errors.push(
            `${file.name}: Unsupported file type. Please use JPG, PNG, GIF, or WebP.`
          );
          continue;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          const maxSizeMB = MAX_FILE_SIZE / (1024 * 1024);
          errors.push(
            `${file.name}: File too large. Maximum size is ${maxSizeMB}MB.`
          );
          continue;
        }

        // Check if we've reached max files
        if (newImages.length + selectedImages.length >= MAX_FILES) {
          errors.push(`Maximum ${MAX_FILES} images allowed.`);
          break;
        }

        try {
          const base64 = await fileToBase64(file);
          const imageAttachment: ImageAttachment = {
            id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            data: base64,
            mimeType: file.type,
            filename: file.name,
            size: file.size,
          };
          newImages.push(imageAttachment);
        } catch (error) {
          errors.push(`${file.name}: Failed to process image.`);
        }
      }

      if (errors.length > 0) {
        console.warn("Image upload errors:", errors);
      }

      if (newImages.length > 0) {
        setSelectedImages((prev) => [...prev, ...newImages]);
      }
    },
    [isProcessing, selectedImages, fileToBase64]
  );

  // Remove individual image
  const removeImage = useCallback((imageId: string) => {
    setSelectedImages((prev) => prev.filter((img) => img.id !== imageId));
  }, []);

  // Drag and drop handlers for the input area
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isProcessing || !isConnected) return;

      console.log(
        "[agent-view] Drag enter types:",
        Array.from(e.dataTransfer.types)
      );

      // Check if dragged items contain files
      if (e.dataTransfer.types.includes("Files")) {
        setIsDragOver(true);
      }
    },
    [isProcessing, isConnected]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Only set dragOver to false if we're leaving the input container
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (isProcessing || !isConnected) return;

      console.log("[agent-view] Drop event:", {
        filesCount: e.dataTransfer.files.length,
        itemsCount: e.dataTransfer.items.length,
        types: Array.from(e.dataTransfer.types),
      });

      // Check if we have files
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        console.log("[agent-view] Processing files from dataTransfer.files");
        processDroppedFiles(files);
        return;
      }

      // Handle file paths (from screenshots or other sources)
      // This is common on macOS when dragging screenshots
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        console.log("[agent-view] Processing items");
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          console.log(`[agent-view] Item ${i}:`, {
            kind: item.kind,
            type: item.type,
          });
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) {
              console.log("[agent-view] Got file from item:", {
                name: file.name,
                type: file.type,
                size: file.size,
              });
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);
              processDroppedFiles(dataTransfer.files);
            }
          }
        }
      }
    },
    [isProcessing, isConnected, processDroppedFiles]
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      // Check if clipboard contains files
      const items = e.clipboardData?.items;
      if (items) {
        const files: File[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          console.log("[agent-view] Paste item:", {
            kind: item.kind,
            type: item.type,
          });

          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file && file.type.startsWith("image/")) {
              e.preventDefault(); // Prevent default paste of file path
              files.push(file);
            }
          }
        }

        if (files.length > 0) {
          console.log(
            "[agent-view] Processing pasted image files:",
            files.length
          );
          const dataTransfer = new DataTransfer();
          files.forEach((file) => dataTransfer.items.add(file));
          await processDroppedFiles(dataTransfer.files);
        }
      }
    },
    [processDroppedFiles]
  );

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = async () => {
    if (!confirm("Are you sure you want to clear this conversation?")) return;
    await clearHistory();
  };

  // Scroll position detection
  const checkIfUserIsAtBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const threshold = 50; // 50px threshold for "near bottom"
    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      threshold;

    setIsUserAtBottom(isAtBottom);
  }, []);

  // Scroll to bottom function
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: behavior,
    });
  }, []);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    checkIfUserIsAtBottom();
  }, [checkIfUserIsAtBottom]);

  // Auto-scroll effect when messages change
  useEffect(() => {
    // Only auto-scroll if user was already at bottom
    if (isUserAtBottom && messages.length > 0) {
      // Use a small delay to ensure DOM is updated
      setTimeout(() => {
        scrollToBottom("smooth");
      }, 100);
    }
  }, [messages, isUserAtBottom, scrollToBottom]);

  // Initial scroll to bottom when session changes
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      // Scroll immediately without animation when switching sessions
      setTimeout(() => {
        scrollToBottom("auto");
        setIsUserAtBottom(true);
      }, 100);
    }
  }, [currentSessionId, scrollToBottom]);

  // Auto-focus input when session is selected/changed
  useEffect(() => {
    if (currentSessionId && inputRef.current) {
      // Small delay to ensure UI has updated
      setTimeout(() => {
        inputRef.current?.focus();
      }, 200);
    }
  }, [currentSessionId]);

  // Keyboard shortcuts for agent view
  const agentShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcutsList: KeyboardShortcut[] = [];

    // New session shortcut - only when in agent view with a project
    if (currentProject) {
      shortcutsList.push({
        key: shortcuts.newSession,
        action: () => {
          if (quickCreateSessionRef.current) {
            quickCreateSessionRef.current();
          }
        },
        description: "Create new session",
      });
    }

    return shortcutsList;
  }, [currentProject, shortcuts]);

  // Register keyboard shortcuts
  useKeyboardShortcuts(agentShortcuts);

  if (!currentProject) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="agent-view-no-project"
      >
        <div className="text-center">
          <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Project Selected</h2>
          <p className="text-muted-foreground">
            Open or create a project to start working with the AI agent.
          </p>
        </div>
      </div>
    );
  }

  // Show welcome message if no messages yet
  const displayMessages =
    messages.length === 0
      ? [
          {
            id: "welcome",
            role: "assistant" as const,
            content:
              "Hello! I'm the Automaker Agent. I can help you build software autonomously. I can read and modify files in this project, run commands, and execute tests. What would you like to create today?",
            timestamp: new Date().toISOString(),
          },
        ]
      : messages;

  return (
    <div
      className="flex-1 flex overflow-hidden content-bg"
      data-testid="agent-view"
    >
      {/* Session Manager Sidebar */}
      {showSessionManager && currentProject && (
        <div className="w-80 border-r flex-shrink-0">
          <SessionManager
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            projectPath={currentProject.path}
            isCurrentSessionThinking={isProcessing}
            onQuickCreateRef={quickCreateSessionRef}
          />
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSessionManager(!showSessionManager)}
              className="h-8 w-8 p-0"
            >
              {showSessionManager ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeft className="w-4 h-4" />
              )}
            </Button>
            <Bot className="w-5 h-5 text-primary" />
            <div>
              <h1 className="text-xl font-bold">AI Agent</h1>
              <p className="text-sm text-muted-foreground">
                {currentProject.name}
                {currentSessionId && !isConnected && " · Connecting..."}
              </p>
            </div>
          </div>

          {/* Status indicators & actions */}
          <div className="flex items-center gap-2">
            {currentTool && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                <Wrench className="w-3 h-3" />
                <span>{currentTool}</span>
              </div>
            )}
            {agentError && (
              <span className="text-xs text-destructive">{agentError}</span>
            )}
            {currentSessionId && messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearChat}
                disabled={isProcessing}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Messages */}
        {!currentSessionId ? (
          <div
            className="flex-1 flex items-center justify-center"
            data-testid="no-session-placeholder"
          >
            <div className="text-center">
              <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h2 className="text-lg font-semibold mb-2">
                No Session Selected
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Create or select a session to start chatting
              </p>
              <Button
                onClick={() => setShowSessionManager(true)}
                variant="outline"
              >
                <PanelLeft className="w-4 h-4 mr-2" />
                {showSessionManager ? "View" : "Show"} Sessions
              </Button>
            </div>
          </div>
        ) : (
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
            data-testid="message-list"
            onScroll={handleScroll}
          >
            {displayMessages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" && "flex-row-reverse"
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                    message.role === "assistant" ? "bg-primary/10" : "bg-muted"
                  )}
                >
                  {message.role === "assistant" ? (
                    <Bot className="w-4 h-4 text-primary" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                </div>
                <Card
                  className={cn(
                    "max-w-[80%] py-0",
                    message.role === "user"
                      ? "bg-transparent border border-primary text-foreground"
                      : "border-l-4 border-primary bg-card"
                  )}
                >
                  <CardContent className="px-3 py-2">
                    {message.role === "assistant" ? (
                      <Markdown className="text-sm text-primary prose-headings:text-primary prose-strong:text-primary prose-code:text-primary">
                        {message.content}
                      </Markdown>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">
                        {message.content}
                      </p>
                    )}
                    <p
                      className={cn(
                        "text-xs mt-1",
                        message.role === "user"
                          ? "text-muted-foreground"
                          : "text-primary/70"
                      )}
                    >
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                  </CardContent>
                </Card>
              </div>
            ))}

            {isProcessing && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <Card className="border-l-4 border-primary bg-card py-0">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-sm text-primary">
                        Thinking...
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        {currentSessionId && (
          <div className="border-t border-border p-4 space-y-3 bg-background">
            {/* Image Drop Zone (when visible) */}
            {showImageDropZone && (
              <ImageDropZone
                onImagesSelected={handleImagesSelected}
                images={selectedImages}
                maxFiles={5}
                className="mb-3"
                disabled={isProcessing || !isConnected}
              />
            )}

            {/* Text Input and Controls - with drag and drop support */}
            <div
              className={cn(
                "flex gap-2 transition-all duration-200 rounded-lg",
                isDragOver &&
                  "bg-primary/10 ring-2 ring-primary ring-offset-2 ring-offset-background"
              )}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <div className="flex-1 relative">
                <Input
                  ref={inputRef}
                  placeholder={
                    isDragOver
                      ? "Drop your images here..."
                      : "Describe what you want to build..."
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  onPaste={handlePaste}
                  disabled={isProcessing || !isConnected}
                  data-testid="agent-input"
                  className={cn(
                    "bg-input border-border",
                    selectedImages.length > 0 &&
                      "border-primary/50 bg-primary/5",
                    isDragOver &&
                      "border-primary bg-primary/10"
                  )}
                />
                {selectedImages.length > 0 && !isDragOver && (
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-primary-foreground bg-primary px-2 py-1 rounded">
                    {selectedImages.length} image
                    {selectedImages.length > 1 ? "s" : ""}
                  </div>
                )}
                {isDragOver && (
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-primary-foreground bg-primary px-2 py-1 rounded flex items-center gap-1">
                    <Paperclip className="w-3 h-3" />
                    Drop here
                  </div>
                )}
              </div>

              {/* Image Attachment Button */}
              <Button
                variant="outline"
                size="default"
                onClick={toggleImageDropZone}
                disabled={isProcessing || !isConnected}
                className={cn(
                  showImageDropZone &&
                    "bg-primary/20 text-primary border-primary",
                  selectedImages.length > 0 && "border-primary"
                )}
                title="Attach images"
              >
                <Paperclip className="w-4 h-4" />
              </Button>

              {/* Send Button */}
              <Button
                onClick={handleSend}
                disabled={
                  (!input.trim() && selectedImages.length === 0) ||
                  isProcessing ||
                  !isConnected
                }
                data-testid="send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>

            {/* Selected Images Preview */}
            {selectedImages.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">
                    {selectedImages.length} image
                    {selectedImages.length > 1 ? "s" : ""} attached
                  </p>
                  <button
                    onClick={() => setSelectedImages([])}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    disabled={isProcessing}
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedImages.map((image) => (
                    <div
                      key={image.id}
                      className="relative group rounded-md border border-muted bg-muted/50 p-2 flex items-center space-x-2"
                    >
                      {/* Image thumbnail */}
                      <div className="w-8 h-8 rounded overflow-hidden bg-muted flex-shrink-0">
                        <img
                          src={image.data}
                          alt={image.filename}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {/* Image info */}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">
                          {image.filename}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(image.size)}
                        </p>
                      </div>
                      {/* Remove button */}
                      <button
                        onClick={() => removeImage(image.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-destructive hover:text-destructive-foreground text-muted-foreground"
                        disabled={isProcessing}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
