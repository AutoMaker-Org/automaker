import { useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView, keymap, Decoration, WidgetType } from '@codemirror/view';
import { Extension, RangeSetBuilder, StateField } from '@codemirror/state';
import { undo as cmUndo, redo as cmRedo } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { search, openSearchPanel } from '@codemirror/search';

import { getLanguageExtension } from '@/lib/codemirror-languages';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-media-query';
import { DEFAULT_FONT_VALUE } from '@/config/ui-font-options';

/** Default monospace font stack used when no custom font is set */
const DEFAULT_EDITOR_FONT =
  'var(--font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace)';

/** Get the actual CSS font family value for the editor */
function getEditorFontFamily(fontValue: string | undefined): string {
  if (!fontValue || fontValue === DEFAULT_FONT_VALUE) {
    return DEFAULT_EDITOR_FONT;
  }
  return fontValue;
}

/** Handle exposed by CodeEditor for external control */
export interface CodeEditorHandle {
  /** Opens the CodeMirror search panel */
  openSearch: () => void;
  /** Focuses the editor */
  focus: () => void;
  /** Undoes the last edit */
  undo: () => void;
  /** Redoes the last undone edit */
  redo: () => void;
  /** Returns the current text selection with line range, or null if nothing is selected */
  getSelection: () => { text: string; fromLine: number; toLine: number } | null;
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  filePath: string;
  readOnly?: boolean;
  tabSize?: number;
  wordWrap?: boolean;
  fontSize?: number;
  /** CSS font-family value for the editor. Use 'default' or undefined for the theme default mono font. */
  fontFamily?: string;
  onCursorChange?: (line: number, col: number) => void;
  onSave?: () => void;
  className?: string;
  /** When true, scrolls the cursor into view (e.g. after virtual keyboard opens) */
  scrollCursorIntoView?: boolean;
  /** Raw unified diff string for the file, used to highlight added/removed lines */
  diffContent?: string | null;
  /** Fires when the text selection state changes (true = non-empty selection) */
  onSelectionChange?: (hasSelection: boolean) => void;
}

/** Get a human-readable language name */
export function getLanguageName(filePath: string): string {
  const name = filePath.split('/').pop()?.toLowerCase() || '';
  const dotIndex = name.lastIndexOf('.');
  // Files without an extension (no dot, or dotfile with dot at position 0)
  const ext = dotIndex > 0 ? name.slice(dotIndex + 1) : '';

  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'Dockerfile';
  if (name === 'makefile' || name === 'gnumakefile') return 'Makefile';
  if (name.startsWith('.env')) return 'Environment';
  if (name.startsWith('.git') || name.startsWith('.npm') || name.startsWith('.docker'))
    return 'Config';

  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'JavaScript';
    case 'jsx':
      return 'JSX';
    case 'ts':
    case 'mts':
    case 'cts':
      return 'TypeScript';
    case 'tsx':
      return 'TSX';
    case 'html':
    case 'htm':
      return 'HTML';
    case 'svelte':
      return 'Svelte';
    case 'vue':
      return 'Vue';
    case 'css':
      return 'CSS';
    case 'scss':
      return 'SCSS';
    case 'less':
      return 'Less';
    case 'json':
    case 'jsonc':
    case 'json5':
      return 'JSON';
    case 'xml':
    case 'svg':
      return 'XML';
    case 'md':
    case 'mdx':
    case 'markdown':
      return 'Markdown';
    case 'py':
    case 'pyx':
    case 'pyi':
      return 'Python';
    case 'java':
      return 'Java';
    case 'kt':
    case 'kts':
      return 'Kotlin';
    case 'rs':
      return 'Rust';
    case 'c':
    case 'h':
      return 'C';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
      return 'C++';
    case 'go':
      return 'Go';
    case 'swift':
      return 'Swift';
    case 'rb':
    case 'erb':
      return 'Ruby';
    case 'php':
      return 'PHP';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'Shell';
    case 'sql':
      return 'SQL';
    case 'yaml':
    case 'yml':
      return 'YAML';
    case 'toml':
      return 'TOML';
    default:
      return 'Plain Text';
  }
}

// ─── Inline Diff Decorations ─────────────────────────────────────────────

/** Parsed diff info: added line numbers and groups of deleted lines with content */
interface DiffInfo {
  addedLines: Set<number>;
  /**
   * Groups of consecutive deleted lines keyed by the new-file line number
   * they appear before. E.g. key=3 means the deleted lines were removed
   * just before line 3 in the current file.
   */
  deletedGroups: Map<number, string[]>;
}

/** Parse a unified diff to extract added lines and groups of deleted lines */
function parseUnifiedDiff(diffContent: string): DiffInfo {
  const addedLines = new Set<number>();
  const deletedGroups = new Map<number, string[]>();
  const lines = diffContent.split('\n');

  let currentNewLine = 0;
  let inHunk = false;
  let pendingDeletions: string[] = [];

  const flushDeletions = () => {
    if (pendingDeletions.length > 0) {
      const existing = deletedGroups.get(currentNewLine);
      if (existing) {
        existing.push(...pendingDeletions);
      } else {
        deletedGroups.set(currentNewLine, [...pendingDeletions]);
      }
      pendingDeletions = [];
    }
  };

  for (const line of lines) {
    // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@ ...
    if (line.startsWith('@@')) {
      flushDeletions();
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        currentNewLine = parseInt(match[1], 10);
        inHunk = true;
      }
      continue;
    }

    if (!inHunk) continue;

    // Skip diff header lines
    if (
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('diff ') ||
      line.startsWith('index ')
    ) {
      continue;
    }

    if (line.startsWith('+')) {
      flushDeletions();
      addedLines.add(currentNewLine);
      currentNewLine++;
    } else if (line.startsWith('-')) {
      // Accumulate deleted lines to show as a group
      pendingDeletions.push(line.substring(1));
    } else if (line.startsWith(' ') || line === '') {
      flushDeletions();
      currentNewLine++;
    }
  }

  flushDeletions();
  return { addedLines, deletedGroups };
}

/** Widget that renders a block of deleted lines inline in the editor */
class DeletedLinesWidget extends WidgetType {
  constructor(readonly lines: string[]) {
    super();
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-diff-deleted-widget';
    container.style.cssText =
      'background-color: oklch(0.55 0.22 25 / 0.1); border-left: 3px solid oklch(0.55 0.22 25 / 0.5);';

    for (const line of this.lines) {
      const lineEl = document.createElement('div');
      lineEl.style.cssText =
        'text-decoration: line-through; color: oklch(0.55 0.22 25 / 0.8); background-color: oklch(0.55 0.22 25 / 0.15); padding: 0 0.5rem; padding-left: calc(0.5rem - 3px); white-space: pre; font-family: inherit;';
      lineEl.textContent = line || ' ';
      container.appendChild(lineEl);
    }

    return container;
  }

  eq(other: WidgetType) {
    if (!(other instanceof DeletedLinesWidget)) return false;
    return (
      this.lines.length === other.lines.length && this.lines.every((l, i) => l === other.lines[i])
    );
  }

  ignoreEvent() {
    return true;
  }
}

/** Create a CodeMirror extension that decorates lines based on diff */
function createDiffDecorations(diffContent: string | null | undefined): Extension {
  if (!diffContent) {
    return [];
  }

  const { addedLines, deletedGroups } = parseUnifiedDiff(diffContent);
  if (addedLines.size === 0 && deletedGroups.size === 0) {
    return [];
  }

  const addedLineDecoration = Decoration.line({
    class: 'cm-diff-added-line',
    attributes: { style: 'background-color: oklch(0.65 0.2 145 / 0.15);' },
  });

  const extensions: Extension[] = [];

  // Line decorations for added lines
  if (addedLines.size > 0) {
    extensions.push(
      EditorView.decorations.of((view) => {
        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;

        for (const lineNum of addedLines) {
          if (lineNum >= 1 && lineNum <= doc.lines) {
            const linePos = doc.line(lineNum).from;
            builder.add(linePos, linePos, addedLineDecoration);
          }
        }

        return builder.finish();
      })
    );
  }

  // Widget decorations for deleted line groups.
  // Block decorations MUST be provided via a StateField (not a plugin/function).
  if (deletedGroups.size > 0) {
    const buildDeletedDecorations = (doc: {
      lines: number;
      line(n: number): { from: number; to: number };
    }) => {
      const builder = new RangeSetBuilder<Decoration>();
      const positions = [...deletedGroups.keys()].sort((a, b) => a - b);

      for (const pos of positions) {
        const deletedLines = deletedGroups.get(pos)!;
        if (pos >= 1 && pos <= doc.lines) {
          const linePos = doc.line(pos).from;
          builder.add(
            linePos,
            linePos,
            Decoration.widget({
              widget: new DeletedLinesWidget(deletedLines),
              block: true,
              side: -1,
            })
          );
        } else {
          const lastLinePos = doc.line(doc.lines).to;
          builder.add(
            lastLinePos,
            lastLinePos,
            Decoration.widget({
              widget: new DeletedLinesWidget(deletedLines),
              block: true,
              side: 1,
            })
          );
        }
      }

      return builder.finish();
    };

    extensions.push(
      StateField.define({
        create(state) {
          return buildDeletedDecorations(state.doc);
        },
        update(decorations, tr) {
          if (tr.docChanged) {
            return decorations.map(tr.changes);
          }
          return decorations;
        },
        provide: (f) => EditorView.decorations.from(f),
      })
    );
  }

  return extensions;
}

// ─────────────────────────────────────────────────────────────────────────

// Syntax highlighting using CSS variables for theme compatibility
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

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  {
    value,
    onChange,
    filePath,
    readOnly = false,
    tabSize = 2,
    wordWrap = true,
    fontSize = 13,
    fontFamily,
    onCursorChange,
    onSave,
    className,
    scrollCursorIntoView = false,
    diffContent,
    onSelectionChange,
  },
  ref
) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const isMobile = useIsMobile();

  // Stable refs for callbacks to avoid frequent extension rebuilds
  const onSaveRef = useRef(onSave);
  const onCursorChangeRef = useRef(onCursorChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const lastHasSelectionRef = useRef(false);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  }, [onCursorChange]);
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  // Expose imperative methods to parent components
  useImperativeHandle(
    ref,
    () => ({
      openSearch: () => {
        if (editorRef.current?.view) {
          editorRef.current.view.focus();
          openSearchPanel(editorRef.current.view);
        }
      },
      focus: () => {
        if (editorRef.current?.view) {
          editorRef.current.view.focus();
        }
      },
      undo: () => {
        if (editorRef.current?.view) {
          editorRef.current.view.focus();
          cmUndo(editorRef.current.view);
        }
      },
      redo: () => {
        if (editorRef.current?.view) {
          editorRef.current.view.focus();
          cmRedo(editorRef.current.view);
        }
      },
      getSelection: () => {
        const view = editorRef.current?.view;
        if (!view) return null;
        const { from, to } = view.state.selection.main;
        if (from === to) return null;
        const text = view.state.sliceDoc(from, to);
        const fromLine = view.state.doc.lineAt(from).number;
        const toLine = view.state.doc.lineAt(to).number;
        return { text, fromLine, toLine };
      },
    }),
    []
  );

  // When the virtual keyboard opens on mobile, the container shrinks but the
  // cursor may be below the new fold. Dispatch a scrollIntoView effect so
  // CodeMirror re-centres the viewport around the caret.
  useEffect(() => {
    if (scrollCursorIntoView && editorRef.current?.view) {
      const view = editorRef.current.view;
      // Request CodeMirror to scroll the current selection into view
      view.dispatch({
        effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }),
      });
    }
  }, [scrollCursorIntoView]);

  // Resolve the effective font family CSS value
  const resolvedFontFamily = useMemo(() => getEditorFontFamily(fontFamily), [fontFamily]);

  // Build editor theme dynamically based on fontSize, fontFamily, and screen size
  const editorTheme = useMemo(
    () =>
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: `${fontSize}px`,
          fontFamily: resolvedFontFamily,
          backgroundColor: 'transparent',
          color: 'var(--foreground)',
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: resolvedFontFamily,
        },
        '.cm-content': {
          padding: '0.5rem 0',
          minHeight: '100%',
          caretColor: 'var(--primary)',
        },
        '.cm-cursor, .cm-dropCursor': {
          borderLeftColor: 'var(--primary)',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: 'oklch(0.55 0.25 265 / 0.3)',
        },
        '.cm-activeLine': {
          backgroundColor: 'var(--accent)',
          opacity: '0.3',
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
          minWidth: isMobile ? '1.75rem' : '3rem',
          textAlign: 'right',
          paddingRight: isMobile ? '0.25rem' : '0.5rem',
          fontSize: `${fontSize - 1}px`,
        },
        '.cm-foldGutter .cm-gutterElement': {
          padding: '0 0.25rem',
        },
        '.cm-placeholder': {
          color: 'var(--muted-foreground)',
          fontStyle: 'italic',
        },
        // Search panel styling
        '.cm-panels': {
          backgroundColor: 'var(--card)',
          borderBottom: '1px solid var(--border)',
        },
        '.cm-panels-top': {
          borderBottom: '1px solid var(--border)',
        },
        '.cm-search': {
          backgroundColor: 'var(--card)',
          padding: '0.5rem 0.75rem',
          gap: '0.375rem',
          fontSize: `${fontSize - 1}px`,
        },
        '.cm-search input, .cm-search select': {
          backgroundColor: 'var(--background)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          borderRadius: '0.375rem',
          padding: '0.25rem 0.5rem',
          outline: 'none',
          fontSize: `${fontSize - 1}px`,
          fontFamily:
            'var(--font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace)',
        },
        '.cm-search input:focus': {
          borderColor: 'var(--primary)',
          boxShadow: '0 0 0 1px var(--primary)',
        },
        '.cm-search button': {
          backgroundColor: 'var(--muted)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          borderRadius: '0.375rem',
          padding: '0.25rem 0.625rem',
          cursor: 'pointer',
          fontSize: `${fontSize - 1}px`,
          transition: 'background-color 0.15s ease',
        },
        '.cm-search button:hover': {
          backgroundColor: 'var(--accent)',
        },
        '.cm-search button[name="close"]': {
          backgroundColor: 'transparent',
          border: 'none',
          padding: '0.25rem',
          borderRadius: '0.25rem',
          color: 'var(--muted-foreground)',
        },
        '.cm-search button[name="close"]:hover': {
          backgroundColor: 'var(--accent)',
          color: 'var(--foreground)',
        },
        '.cm-search label': {
          color: 'var(--muted-foreground)',
          fontSize: `${fontSize - 1}px`,
        },
        '.cm-search .cm-textfield': {
          minWidth: '10rem',
        },
        '.cm-searchMatch': {
          backgroundColor: 'oklch(0.7 0.2 90 / 0.3)',
          borderRadius: '1px',
        },
        '.cm-searchMatch-selected': {
          backgroundColor: 'oklch(0.6 0.25 265 / 0.4)',
        },
      }),
    [fontSize, resolvedFontFamily, isMobile]
  );

  // Build extensions list
  // Uses refs for onSave/onCursorChange to avoid frequent extension rebuilds
  // when parent passes inline arrow functions
  const extensions = useMemo(() => {
    const exts: Extension[] = [
      syntaxHighlighting(syntaxColors),
      editorTheme,
      search(),
      EditorView.updateListener.of((update) => {
        if (update.selectionSet) {
          if (onCursorChangeRef.current) {
            const pos = update.state.selection.main.head;
            const line = update.state.doc.lineAt(pos);
            onCursorChangeRef.current(line.number, pos - line.from + 1);
          }
          if (onSelectionChangeRef.current) {
            const { from, to } = update.state.selection.main;
            const hasSelection = from !== to;
            if (hasSelection !== lastHasSelectionRef.current) {
              lastHasSelectionRef.current = hasSelection;
              onSelectionChangeRef.current(hasSelection);
            }
          }
        }
      }),
    ];

    // Add save keybinding (always register, check ref at call time)
    exts.push(
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            onSaveRef.current?.();
            return true;
          },
        },
      ])
    );

    // Add word wrap
    if (wordWrap) {
      exts.push(EditorView.lineWrapping);
    }

    // Add tab size
    exts.push(EditorView.editorAttributes.of({ style: `tab-size: ${tabSize}` }));

    // Add language extension
    const langExt = getLanguageExtension(filePath);
    if (langExt) {
      exts.push(langExt);
    }

    // Add inline diff decorations if diff content is provided
    if (diffContent) {
      exts.push(createDiffDecorations(diffContent));
    }

    return exts;
  }, [filePath, wordWrap, tabSize, editorTheme, diffContent]);

  return (
    <div className={cn('h-full w-full', className)}>
      <CodeMirror
        ref={editorRef}
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme="none"
        height="100%"
        readOnly={readOnly}
        className="h-full [&_.cm-editor]:h-full"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          autocompletion: false,
          bracketMatching: true,
          indentOnInput: true,
          closeBrackets: true,
          tabSize,
        }}
      />
    </div>
  );
});
