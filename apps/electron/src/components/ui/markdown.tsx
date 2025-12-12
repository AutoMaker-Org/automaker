"use client";

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface MarkdownProps {
  children: string;
  className?: string;
}

/**
 * Reusable Markdown component for rendering markdown content
 * Theme-aware styling that adapts to all predefined themes
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        "prose prose-sm prose-invert max-w-none",
        // Headings
        "[&_h1]:text-xl [&_h1]:text-foreground [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2",
        "[&_h2]:text-lg [&_h2]:text-foreground [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2",
        "[&_h3]:text-base [&_h3]:text-foreground [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-2",
        "[&_h4]:text-sm [&_h4]:text-foreground [&_h4]:font-semibold [&_h4]:mt-2 [&_h4]:mb-1",
        // Paragraphs
        "[&_p]:text-foreground-secondary [&_p]:leading-relaxed [&_p]:my-2",
        // Lists
        "[&_ul]:my-2 [&_ul]:pl-4 [&_ol]:my-2 [&_ol]:pl-4",
        "[&_li]:text-foreground-secondary [&_li]:my-0.5",
        // Code
        "[&_code]:text-chart-2 [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm",
        "[&_pre]:bg-card [&_pre]:border [&_pre]:border-border [&_pre]:rounded-lg [&_pre]:my-2 [&_pre]:p-3 [&_pre]:overflow-x-auto",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        // Strong/Bold
        "[&_strong]:text-foreground [&_strong]:font-semibold",
        // Links
        "[&_a]:text-brand-500 [&_a]:no-underline hover:[&_a]:underline",
        // Blockquotes
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:italic [&_blockquote]:my-2",
        // Horizontal rules
        "[&_hr]:border-border [&_hr]:my-4",
        className
      )}
    >
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
