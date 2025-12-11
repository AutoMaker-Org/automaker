"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, List, FileText } from "lucide-react";
import { getElectronAPI } from "@/lib/electron";
import { LogViewer } from "@/components/ui/log-viewer";
import { safeJoin } from "@/lib/path-utils";

interface AgentOutputModalProps {
  open: boolean;
  onClose: () => void;
  featureDescription: string;
  featureId: string;
  /** Called when a number key (0-9) is pressed while the modal is open */
  onNumberKeyPress?: (key: string) => void;
}

type ViewMode = "parsed" | "raw";

export function AgentOutputModal({
  open,
  onClose,
  featureDescription,
  featureId,
  onNumberKeyPress,
}: AgentOutputModalProps) {
  const [output, setOutput] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("parsed");
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const projectPathRef = useRef<string>("");

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  // Load existing output from file
  useEffect(() => {
    if (!open) return;

    const loadOutput = async () => {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }

      setIsLoading(true);

      try {
        // Get current project path from store (we'll need to pass this)
        const currentProject = (window as any).__currentProject;
        if (!currentProject?.path) {
          setIsLoading(false);
          return;
        }

        projectPathRef.current = currentProject.path;

        // Ensure context directory exists
        const contextDir = safeJoin(currentProject.path, '.automaker', 'agents-context');
        await api.mkdir(contextDir);

        // Try to read existing output file
        const outputPath = `${contextDir}/${featureId}.md`;
        const result = await api.readFile(outputPath);

        if (result.success && result.content) {
          setOutput(result.content);
        } else {
          setOutput("");
        }
      } catch (error) {
        console.error("Failed to load output:", error);
        setOutput("");
      } finally {
        setIsLoading(false);
      }
    };

    loadOutput();
  }, [open, featureId]);

  // Save output to file
  const saveOutput = async (newContent: string) => {
    if (!projectPathRef.current) return;

    const api = await getElectronAPI();
    if (!api) {
      console.error("Failed to get Electron API");
      return;
    }

    try {
      const contextDir = safeJoin(projectPathRef.current, '.automaker', 'agents-context');
      const outputPath = `${contextDir}/${featureId}.md`;

      await api.writeFile(outputPath, newContent);
    } catch (error) {
      console.error("Failed to save output:", error);
    }
  };

  // Listen to auto mode events and update output
  useEffect(() => {
    if (!open) return;

    const setupEventListener = async () => {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      if (!api.autoMode) return;

    const unsubscribe = api.autoMode.onEvent((event) => {
      // Filter events for this specific feature only
      if (event.featureId !== featureId) {
        return;
      }

      let newContent = "";

      if (event.type === "auto_mode_progress") {
        newContent = event.content || "";
      } else if (event.type === "auto_mode_tool") {
        const toolName = event.tool || "Unknown Tool";
        const toolInput = event.input
          ? JSON.stringify(event.input, null, 2)
          : "";
        newContent = `\n🔧 Tool: ${toolName}\n${
          toolInput ? `Input: ${toolInput}` : ""
        }`;
      } else if (event.type === "auto_mode_phase") {
        const phaseEmoji =
          event.phase === "planning"
            ? "📋"
            : event.phase === "action"
            ? "⚡"
            : "✅";
        newContent = `\n${phaseEmoji} ${event.message}\n`;
      } else if (event.type === "auto_mode_error") {
        newContent = `\n❌ Error: ${event.error}\n`;
      } else if (event.type === "auto_mode_feature_complete") {
        const emoji = event.passes ? "✅" : "⚠️";
        newContent = `\n${emoji} Task completed: ${event.message}\n`;

        // Close the modal when the feature is verified (passes = true)
        if (event.passes) {
          // Small delay to show the completion message before closing
          setTimeout(() => {
            onClose();
          }, 1500);
        }
      }

      if (newContent) {
        setOutput((prev) => {
          const updated = prev + newContent;
          saveOutput(updated);
          return updated;
        });
      }
      });

      return () => {
        unsubscribe();
      };
    };

    const cleanup = setupEventListener();
    return () => {
      cleanup.then(unsubscribe => unsubscribe?.());
    };
  }, [open, featureId]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    autoScrollRef.current = isAtBottom;
  };

  // Handle number key presses while modal is open
  useEffect(() => {
    if (!open || !onNumberKeyPress) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if a number key (0-9) was pressed without modifiers
      if (
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        /^[0-9]$/.test(event.key)
      ) {
        event.preventDefault();
        onNumberKeyPress(event.key);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onNumberKeyPress]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="w-[60vw] max-w-[60vw] max-h-[80vh] flex flex-col"
        data-testid="agent-output-modal"
      >
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              Agent Output
            </DialogTitle>
            <div className="flex items-center gap-1 bg-zinc-900/50 rounded-lg p-1">
              <button
                onClick={() => setViewMode("parsed")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === "parsed"
                    ? "bg-primary/20 text-primary shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
                data-testid="view-mode-parsed"
              >
                <List className="w-3.5 h-3.5" />
                Parsed
              </button>
              <button
                onClick={() => setViewMode("raw")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === "raw"
                    ? "bg-primary/20 text-primary shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
                data-testid="view-mode-raw"
              >
                <FileText className="w-3.5 h-3.5" />
                Raw
              </button>
            </div>
          </div>
          <DialogDescription
            className="mt-1 max-h-24 overflow-y-auto break-words"
            data-testid="agent-output-description"
          >
            {featureDescription}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto bg-zinc-950 rounded-lg p-4 font-mono text-xs min-h-[400px] max-h-[60vh]"
        >
          {isLoading && !output ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading output...
            </div>
          ) : !output ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No output yet. The agent will stream output here as it works.
            </div>
          ) : viewMode === "parsed" ? (
            <LogViewer output={output} />
          ) : (
            <div className="whitespace-pre-wrap break-words text-zinc-300">
              {output}
            </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground text-center flex-shrink-0">
          {autoScrollRef.current
            ? "Auto-scrolling enabled"
            : "Scroll to bottom to enable auto-scroll"}
        </div>
      </DialogContent>
    </Dialog>
  );
}
