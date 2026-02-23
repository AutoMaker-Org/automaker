/**
 * CodeMirror-based unified diff viewer.
 *
 * Uses @codemirror/merge's `unifiedMergeView` extension to display a
 * syntax-highlighted inline diff between the original and modified file content.
 * The viewer is read-only and collapses unchanged regions.
 */

import { useMemo, useRef, useEffect } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { unifiedMergeView } from '@codemirror/merge';
import { getLanguageExtension } from '@/lib/codemirror-languages';
import { reconstructFilesFromDiff } from '@/lib/diff-utils';
import { cn } from '@/lib/utils';

// Reuse the same syntax highlighting from the code editor
const syntaxColors = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--chart-4, oklch(0.7 0.15 280))' },
  { tag: t.string, color: 'var(--chart-1, oklch(0.646 0.222 41.116))' },
  { tag: t.number, color: 'var(--chart-3, oklch(0.7 0.15 150))' },
  { tag: t.bool, color: 'var(--chart-4, oklch(0.7 0.15 280))' },
  { tag: t.null, color: 'var(--chart-4, oklch(0.7 0.15 280))' },
  { tag: t.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: t.propertyName, color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },
  { tag: t.variableName, color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },
  { tag: t.function(t.variableName), color: 'var(--primary)' },
  { tag: t.typeName, color: 'var(--chart-5, oklch(0.65 0.2 30))' },
  { tag: t.className, color: 'var(--chart-5, oklch(0.65 0.2 30))' },
  { tag: t.definition(t.variableName), color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },
  { tag: t.operator, color: 'var(--muted-foreground)' },
  { tag: t.bracket, color: 'var(--muted-foreground)' },
  { tag: t.punctuation, color: 'var(--muted-foreground)' },
  { tag: t.attributeName, color: 'var(--chart-5, oklch(0.65 0.2 30))' },
  { tag: t.attributeValue, color: 'var(--chart-1, oklch(0.646 0.222 41.116))' },
  { tag: t.tagName, color: 'var(--chart-4, oklch(0.7 0.15 280))' },
  { tag: t.heading, color: 'var(--foreground)', fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.link, color: 'var(--primary)', textDecoration: 'underline' },
  { tag: t.content, color: 'var(--foreground)' },
  { tag: t.regexp, color: 'var(--chart-1, oklch(0.646 0.222 41.116))' },
  { tag: t.meta, color: 'var(--muted-foreground)' },
]);

const diffViewTheme = EditorView.theme(
  {
    '&': {
      fontSize: '12px',
      fontFamily:
        'var(--font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace)',
      backgroundColor: 'var(--background)',
      color: 'var(--foreground)',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily:
        'var(--font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace)',
    },
    '.cm-content': {
      padding: '0',
      minHeight: 'auto',
    },
    '.cm-line': {
      padding: '0 0.5rem',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--muted-foreground)',
      border: 'none',
      borderRight: '1px solid var(--border)',
      paddingRight: '0.25rem',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      minWidth: '3rem',
      textAlign: 'right',
      paddingRight: '0.5rem',
      fontSize: '11px',
    },

    // --- GitHub-style diff colors (dark mode) ---

    // Added/changed lines: green background
    '&.cm-merge-b .cm-changedLine': {
      backgroundColor: 'rgba(46, 160, 67, 0.15)',
    },
    // Highlighted text within added/changed lines: stronger green
    '&.cm-merge-b .cm-changedText': {
      background: 'rgba(46, 160, 67, 0.4)',
    },

    // Deleted chunk container: red background
    '.cm-deletedChunk': {
      backgroundColor: 'rgba(248, 81, 73, 0.1)',
      paddingLeft: '6px',
    },
    // Individual deleted lines within the chunk
    '.cm-deletedChunk .cm-deletedLine': {
      backgroundColor: 'rgba(248, 81, 73, 0.15)',
    },
    // Highlighted text within deleted lines: stronger red
    '.cm-deletedChunk .cm-deletedText': {
      background: 'rgba(248, 81, 73, 0.4)',
    },
    // Remove strikethrough from deleted text (GitHub doesn't use it)
    '.cm-insertedLine, .cm-deletedLine, .cm-deletedLine del': {
      textDecoration: 'none',
    },

    // Gutter markers for changed lines (green bar)
    '&.cm-merge-b .cm-changedLineGutter': {
      background: '#3fb950',
    },
    // Gutter markers for deleted lines (red bar)
    '.cm-deletedLineGutter': {
      background: '#f85149',
    },

    // Collapse button styling
    '.cm-collapsedLines': {
      color: 'var(--muted-foreground)',
      backgroundColor: 'var(--muted)',
      borderTop: '1px solid var(--border)',
      borderBottom: '1px solid var(--border)',
      cursor: 'pointer',
      padding: '2px 8px',
      fontSize: '11px',
    },

    // Selection styling
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'oklch(0.55 0.25 265 / 0.3)',
    },
  },
  { dark: true }
);

interface CodeMirrorDiffViewProps {
  /** The unified diff text for a single file */
  fileDiff: string;
  /** File path for language detection */
  filePath: string;
  /** Max height of the diff view (CSS value) */
  maxHeight?: string;
  className?: string;
}

export function CodeMirrorDiffView({
  fileDiff,
  filePath,
  maxHeight = '400px',
  className,
}: CodeMirrorDiffViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const { oldContent, newContent } = useMemo(() => reconstructFilesFromDiff(fileDiff), [fileDiff]);

  const extensions = useMemo(() => {
    const exts: Extension[] = [
      EditorView.darkTheme.of(true),
      diffViewTheme,
      syntaxHighlighting(syntaxColors),
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      EditorView.lineWrapping,
      unifiedMergeView({
        original: oldContent,
        highlightChanges: true,
        gutter: true,
        syntaxHighlightDeletions: true,
        mergeControls: false,
        collapseUnchanged: { margin: 3, minSize: 4 },
      }),
    ];

    const langExt = getLanguageExtension(filePath);
    if (langExt) {
      exts.push(langExt);
    }

    return exts;
  }, [oldContent, filePath]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up previous view
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const state = EditorState.create({
      doc: newContent,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [newContent, extensions]);

  return (
    <div ref={containerRef} className={cn('overflow-auto', className)} style={{ maxHeight }} />
  );
}
