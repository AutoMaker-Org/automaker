import { useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { undo as cmUndo, redo as cmRedo } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { search, openSearchPanel } from '@codemirror/search';

// Language imports
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { rust } from '@codemirror/lang-rust';
import { cpp } from '@codemirror/lang-cpp';
import { sql } from '@codemirror/lang-sql';
import { php } from '@codemirror/lang-php';
import { xml } from '@codemirror/lang-xml';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { go } from '@codemirror/legacy-modes/mode/go';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { swift } from '@codemirror/legacy-modes/mode/swift';

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
}

/** Detect language extension based on file extension */
function getLanguageExtension(filePath: string): Extension | null {
  const name = filePath.split('/').pop()?.toLowerCase() || '';
  const dotIndex = name.lastIndexOf('.');
  // Files without an extension (no dot, or dotfile with dot at position 0)
  const ext = dotIndex > 0 ? name.slice(dotIndex + 1) : '';

  // Handle files by name first
  switch (name) {
    case 'dockerfile':
    case 'dockerfile.dev':
    case 'dockerfile.prod':
      return StreamLanguage.define(dockerFile);
    case 'makefile':
    case 'gnumakefile':
      return StreamLanguage.define(shell);
    case '.gitignore':
    case '.dockerignore':
    case '.npmignore':
    case '.eslintignore':
      return StreamLanguage.define(shell); // close enough for ignore files
    case '.env':
    case '.env.local':
    case '.env.development':
    case '.env.production':
      return StreamLanguage.define(shell);
  }

  switch (ext) {
    // JavaScript/TypeScript
    case 'js':
    case 'mjs':
    case 'cjs':
      return javascript();
    case 'jsx':
      return javascript({ jsx: true });
    case 'ts':
    case 'mts':
    case 'cts':
      return javascript({ typescript: true });
    case 'tsx':
      return javascript({ jsx: true, typescript: true });

    // Web
    case 'html':
    case 'htm':
    case 'svelte':
    case 'vue':
      return html();
    case 'css':
    case 'scss':
    case 'less':
      return css();
    case 'json':
    case 'jsonc':
    case 'json5':
      return json();
    case 'xml':
    case 'svg':
    case 'xsl':
    case 'xslt':
    case 'plist':
      return xml();

    // Markdown
    case 'md':
    case 'mdx':
    case 'markdown':
      return markdown();

    // Python
    case 'py':
    case 'pyx':
    case 'pyi':
      return python();

    // Java/Kotlin
    case 'java':
    case 'kt':
    case 'kts':
      return java();

    // Systems
    case 'rs':
      return rust();
    case 'c':
    case 'h':
      return cpp();
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'hxx':
      return cpp();
    case 'go':
      return StreamLanguage.define(go);
    case 'swift':
      return StreamLanguage.define(swift);

    // Scripting
    case 'rb':
    case 'erb':
      return StreamLanguage.define(ruby);
    case 'php':
      return php();
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
      return StreamLanguage.define(shell);

    // Data
    case 'sql':
    case 'mysql':
    case 'pgsql':
      return sql();
    case 'yaml':
    case 'yml':
      return StreamLanguage.define(yaml);
    case 'toml':
      return StreamLanguage.define(toml);

    default:
      return null; // Plain text fallback
  }
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
  },
  ref
) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const isMobile = useIsMobile();

  // Stable refs for callbacks to avoid frequent extension rebuilds
  const onSaveRef = useRef(onSave);
  const onCursorChangeRef = useRef(onCursorChange);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  }, [onCursorChange]);

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
        if (update.selectionSet && onCursorChangeRef.current) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          onCursorChangeRef.current(line.number, pos - line.from + 1);
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

    return exts;
  }, [filePath, wordWrap, tabSize, editorTheme]);

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
