"use client";

import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Wrench,
  Zap,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Bug,
  Info,
  FileOutput,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  parseLogOutput,
  getLogTypeColors,
  type LogEntry,
  type LogEntryType,
} from "@/lib/log-parser";

interface LogViewerProps {
  output: string;
  className?: string;
}

const getLogIcon = (type: LogEntryType) => {
  switch (type) {
    case "prompt":
      return <MessageSquare className="w-4 h-4" />;
    case "tool_call":
      return <Wrench className="w-4 h-4" />;
    case "tool_result":
      return <FileOutput className="w-4 h-4" />;
    case "phase":
      return <Zap className="w-4 h-4" />;
    case "error":
      return <AlertCircle className="w-4 h-4" />;
    case "success":
      return <CheckCircle2 className="w-4 h-4" />;
    case "warning":
      return <AlertTriangle className="w-4 h-4" />;
    case "thinking":
      return <Brain className="w-4 h-4" />;
    case "debug":
      return <Bug className="w-4 h-4" />;
    default:
      return <Info className="w-4 h-4" />;
  }
};

interface LogEntryItemProps {
  entry: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}

function LogEntryItem({ entry, isExpanded, onToggle }: LogEntryItemProps) {
  const colors = getLogTypeColors(entry.type);
  const hasContent = entry.content.length > 100;

  // Format content - detect and highlight JSON
  const formattedContent = useMemo(() => {
    const content = entry.content;

    // Try to find and format JSON blocks
    const jsonRegex = /(\{[\s\S]*?\}|\[[\s\S]*?\])/g;
    let lastIndex = 0;
    const parts: { type: "text" | "json"; content: string }[] = [];

    let match;
    while ((match = jsonRegex.exec(content)) !== null) {
      // Add text before JSON
      if (match.index > lastIndex) {
        parts.push({
          type: "text",
          content: content.slice(lastIndex, match.index),
        });
      }

      // Try to parse and format JSON
      try {
        const parsed = JSON.parse(match[1]);
        parts.push({
          type: "json",
          content: JSON.stringify(parsed, null, 2),
        });
      } catch {
        // Not valid JSON, treat as text
        parts.push({ type: "text", content: match[1] });
      }

      lastIndex = match.index + match[1].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push({ type: "text", content: content.slice(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: "text" as const, content }];
  }, [entry.content]);

  return (
    <div
      className={cn(
        "rounded-lg border-l-4 transition-all duration-200",
        colors.bg,
        colors.border,
        "hover:brightness-110"
      )}
      data-testid={`log-entry-${entry.type}`}
    >
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center gap-2 text-left"
        data-testid={`log-entry-toggle-${entry.id}`}
      >
        {hasContent ? (
          isExpanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          )
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        <span className={cn("flex-shrink-0", colors.icon)}>
          {getLogIcon(entry.type)}
        </span>

        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0",
            colors.badge
          )}
          data-testid="log-entry-badge"
        >
          {entry.title}
        </span>

        <span className="text-xs text-zinc-400 truncate flex-1 ml-2">
          {!isExpanded &&
            entry.content.slice(0, 80) +
              (entry.content.length > 80 ? "..." : "")}
        </span>
      </button>

      {(isExpanded || !hasContent) && (
        <div
          className="px-4 pb-3 pt-1"
          data-testid={`log-entry-content-${entry.id}`}
        >
          <div className="font-mono text-xs space-y-1">
            {formattedContent.map((part, index) => (
              <div key={index}>
                {part.type === "json" ? (
                  <pre className="bg-zinc-900/50 rounded p-2 overflow-x-auto text-xs text-primary">
                    {part.content}
                  </pre>
                ) : (
                  <pre
                    className={cn(
                      "whitespace-pre-wrap break-words",
                      colors.text
                    )}
                  >
                    {part.content}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function LogViewer({ output, className }: LogViewerProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const entries = useMemo(() => parseLogOutput(output), [output]);

  const toggleEntry = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(entries.map((e) => e.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <div className="text-center">
          <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No log entries yet. Logs will appear here as the process runs.</p>
          {output && output.trim() && (
            <div className="mt-4 p-3 bg-zinc-900/50 rounded text-xs font-mono text-left max-h-40 overflow-auto">
              <pre className="whitespace-pre-wrap">{output}</pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Count entries by type
  const typeCounts = entries.reduce((acc, entry) => {
    acc[entry.type] = (acc[entry.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Header with controls */}
      <div className="flex items-center justify-between px-1" data-testid="log-viewer-header">
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(typeCounts).map(([type, count]) => {
            const colors = getLogTypeColors(type as LogEntryType);
            return (
              <span
                key={type}
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full",
                  colors.badge
                )}
                data-testid={`log-type-count-${type}`}
              >
                {type}: {count}
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={expandAll}
            className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800/50 transition-colors"
            data-testid="log-expand-all"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800/50 transition-colors"
            data-testid="log-collapse-all"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div className="space-y-2" data-testid="log-entries-container">
        {entries.map((entry) => (
          <LogEntryItem
            key={entry.id}
            entry={entry}
            isExpanded={expandedIds.has(entry.id)}
            onToggle={() => toggleEntry(entry.id)}
          />
        ))}
      </div>
    </div>
  );
}
