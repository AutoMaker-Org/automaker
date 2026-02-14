import { useMemo, useCallback, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, gutter, GutterMarker } from '@codemirror/view';
import { Extension, EditorState } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { go } from '@codemirror/legacy-modes/mode/go';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { vim } from '@replit/codemirror-vim';
import { emacs } from '@replit/codemirror-emacs';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import type { DiffHunk } from '@/lib/electron';
import type { EditorKeybindings } from '@/store/types/ui-types';

const DEFAULT_MONO_FONT = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onCursorChange?: (line: number, column: number) => void;
  language?: string;
  readOnly?: boolean;
  mobile?: boolean;
  diffHunks?: DiffHunk[];
  className?: string;
  'data-testid'?: string;
}

// Syntax highlighting using CSS variables for theme compatibility
const syntaxColors = HighlightStyle.define([
  // Keywords (if, else, return, function, class, etc.)
  { tag: t.keyword, color: 'var(--chart-4, oklch(0.7 0.15 280))' },
  // Definitions (class names, function names when defined)
  { tag: t.definition(t.variableName), color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },
  {
    tag: t.definition(t.function(t.variableName)),
    color: 'var(--chart-2, oklch(0.6 0.118 184.704))',
  },
  // Type names
  { tag: t.typeName, color: 'var(--chart-3, oklch(0.7 0.15 150))' },
  // Function/method calls
  { tag: t.function(t.variableName), color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },
  // Variable names
  { tag: t.variableName, color: 'var(--foreground)' },
  // Property names
  { tag: t.propertyName, color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },
  // Strings
  { tag: t.string, color: 'var(--chart-1, oklch(0.646 0.222 41.116))' },
  // Numbers
  { tag: t.number, color: 'var(--chart-3, oklch(0.7 0.15 150))' },
  // Booleans and null
  { tag: t.bool, color: 'var(--chart-4, oklch(0.7 0.15 280))' },
  { tag: t.null, color: 'var(--chart-4, oklch(0.7 0.15 280))' },
  // Comments
  { tag: t.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: t.lineComment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: t.blockComment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  // Operators
  { tag: t.operator, color: 'var(--chart-5, oklch(0.65 0.2 30))' },
  // Brackets and punctuation
  { tag: t.bracket, color: 'var(--muted-foreground)' },
  { tag: t.punctuation, color: 'var(--muted-foreground)' },
  // Tags (HTML/XML)
  { tag: t.tagName, color: 'var(--chart-1, oklch(0.646 0.222 41.116))' },
  { tag: t.attributeName, color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },
  { tag: t.attributeValue, color: 'var(--chart-3, oklch(0.7 0.15 150))' },
  // Heading (for Markdown)
  { tag: t.heading, color: 'var(--chart-4, oklch(0.7 0.15 280))', fontWeight: 'bold' },
  // Meta / decorators
  { tag: t.meta, color: 'var(--chart-5, oklch(0.65 0.2 30))' },
  // Regex
  { tag: t.regexp, color: 'var(--chart-1, oklch(0.646 0.222 41.116))' },
  // Default text
  { tag: t.content, color: 'var(--foreground)' },
]);

/** Build a dynamic EditorView theme based on user preferences */
function createEditorTheme(opts: {
  fontSize: string;
  fontFamily: string;
  lineHeight: string;
  ligatures: boolean;
  mobile?: boolean;
}): Extension {
  const fontFeatureSettings = opts.ligatures ? '"liga" 1, "calt" 1' : '"liga" 0, "calt" 0';

  if (opts.mobile) {
    return EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '16px', // Prevents iOS zoom on focus
        fontFamily: opts.fontFamily,
        fontFeatureSettings,
        backgroundColor: 'transparent',
        color: 'var(--foreground)',
      },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: opts.fontFamily,
        lineHeight: opts.lineHeight,
        '-webkit-overflow-scrolling': 'touch',
      },
      '.cm-content': {
        padding: '0.5rem 0',
        minHeight: '100%',
        caretColor: 'var(--primary)',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--primary)',
        borderLeftWidth: '2px',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'oklch(0.55 0.25 265 / 0.3)',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--accent)',
        opacity: '0.5',
      },
      '.cm-line': {
        padding: '2px 1rem 2px 0.25rem',
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
        minWidth: '2.5rem',
        textAlign: 'right',
        paddingRight: '0.375rem',
        fontSize: '0.8125rem',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--accent)',
        opacity: '0.5',
      },
      '.cm-panels': {
        backgroundColor: 'var(--muted)',
        color: 'var(--foreground)',
        borderBottom: '1px solid var(--border)',
      },
      '.cm-panels.cm-panels-top': {
        borderBottom: '1px solid var(--border)',
      },
      '.cm-searchMatch': {
        backgroundColor: 'oklch(0.7 0.15 80 / 0.4)',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'oklch(0.7 0.15 80 / 0.7)',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: 'var(--muted)',
        border: '1px solid var(--border)',
        color: 'var(--muted-foreground)',
        borderRadius: '0.25rem',
        padding: '0 0.25rem',
        margin: '0 0.25rem',
      },
      '&.cm-focused .cm-matchingBracket': {
        backgroundColor: 'oklch(0.55 0.25 265 / 0.2)',
        outline: '1px solid oklch(0.55 0.25 265 / 0.5)',
      },
      '.cm-tooltip': {
        backgroundColor: 'var(--popover)',
        color: 'var(--popover-foreground)',
        border: '1px solid var(--border)',
        borderRadius: '0.375rem',
      },
      '.cm-diff-gutter': { width: '3px', marginRight: '2px' },
      '.cm-diff-gutter .cm-gutterElement': { padding: '0', minWidth: '3px' },
      '.cm-diff-added': { backgroundColor: 'oklch(0.65 0.2 145)' },
      '.cm-diff-modified': { backgroundColor: 'oklch(0.7 0.15 80)' },
      '.cm-diff-deleted': { backgroundColor: 'oklch(0.6 0.2 25)' },
    });
  }

  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: opts.fontSize,
      fontFamily: opts.fontFamily,
      fontFeatureSettings,
      backgroundColor: 'transparent',
      color: 'var(--foreground)',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: opts.fontFamily,
      lineHeight: opts.lineHeight,
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
      opacity: '0.5',
    },
    '.cm-line': {
      padding: '0 1rem 0 0.25rem',
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
      fontSize: '0.75rem',
    },
    '.cm-foldGutter .cm-gutterElement': {
      padding: '0 0.25rem',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--accent)',
      opacity: '0.5',
    },
    '.cm-panels': {
      backgroundColor: 'var(--muted)',
      color: 'var(--foreground)',
      borderBottom: '1px solid var(--border)',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid var(--border)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'oklch(0.7 0.15 80 / 0.4)',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'oklch(0.7 0.15 80 / 0.7)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--muted)',
      border: '1px solid var(--border)',
      color: 'var(--muted-foreground)',
      borderRadius: '0.25rem',
      padding: '0 0.25rem',
      margin: '0 0.25rem',
    },
    '&.cm-focused .cm-matchingBracket': {
      backgroundColor: 'oklch(0.55 0.25 265 / 0.2)',
      outline: '1px solid oklch(0.55 0.25 265 / 0.5)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--popover)',
      color: 'var(--popover-foreground)',
      border: '1px solid var(--border)',
      borderRadius: '0.375rem',
    },
    '.cm-diff-gutter': { width: '3px', marginRight: '2px' },
    '.cm-diff-gutter .cm-gutterElement': { padding: '0', minWidth: '3px' },
    '.cm-diff-added': { backgroundColor: 'oklch(0.65 0.2 145)' },
    '.cm-diff-modified': { backgroundColor: 'oklch(0.7 0.15 80)' },
    '.cm-diff-deleted': { backgroundColor: 'oklch(0.6 0.2 25)' },
  });
}

/** Git diff gutter marker for added lines */
class DiffAddedMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-diff-added';
    el.style.width = '3px';
    el.style.height = '100%';
    return el;
  }
}

/** Git diff gutter marker for modified lines */
class DiffModifiedMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-diff-modified';
    el.style.width = '3px';
    el.style.height = '100%';
    return el;
  }
}

/** Git diff gutter marker for deleted lines (shown as a thin line) */
class DiffDeletedMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-diff-deleted';
    el.style.width = '3px';
    el.style.height = '2px';
    el.style.marginTop = '-1px';
    return el;
  }
}

const addedMarker = new DiffAddedMarker();
const modifiedMarker = new DiffModifiedMarker();
const deletedMarker = new DiffDeletedMarker();

/**
 * Create a CodeMirror gutter extension that shows diff indicators
 * for added, modified, and deleted lines based on diff hunks
 */
function createDiffGutter(hunks: DiffHunk[]): Extension {
  // Pre-compute which lines have which status
  const lineStatuses = new Map<number, 'add' | 'delete' | 'modify'>();

  for (const hunk of hunks) {
    let hasDeletes = false;
    let hasAdds = false;

    for (const change of hunk.changes) {
      if (change.type === 'add') {
        hasAdds = true;
        lineStatuses.set(change.line, 'add');
      } else if (change.type === 'delete') {
        hasDeletes = true;
      }
    }

    // If a hunk has both adds and deletes, mark the added lines as modified
    if (hasDeletes && hasAdds) {
      for (const change of hunk.changes) {
        if (change.type === 'add') {
          lineStatuses.set(change.line, 'modify');
        }
      }
    }

    // If there are only deletes, mark the line where content was deleted
    if (hasDeletes && !hasAdds) {
      lineStatuses.set(hunk.newStart, 'delete');
    }
  }

  return gutter({
    class: 'cm-diff-gutter',
    lineMarker(view, line) {
      const lineNum = view.state.doc.lineAt(line.from).number;
      const status = lineStatuses.get(lineNum);
      if (status === 'add') return addedMarker;
      if (status === 'modify') return modifiedMarker;
      if (status === 'delete') return deletedMarker;
      return null;
    },
  });
}

/** Map file extension to a CodeMirror language extension */
function getLanguageExtension(lang: string): Extension | null {
  switch (lang) {
    case 'typescript':
    case 'tsx':
      return javascript({ typescript: true, jsx: lang === 'tsx' });
    case 'javascript':
      return javascript();
    case 'jsx':
      return javascript({ jsx: true });
    case 'html':
      return html();
    case 'css':
    case 'scss':
    case 'less':
      return css();
    case 'json':
    case 'jsonc':
      return json();
    case 'markdown':
      return markdown();
    case 'xml':
    case 'svg':
      return xml();
    case 'python':
      return python();
    case 'rust':
      return rust();
    case 'cpp':
    case 'c':
    case 'h':
    case 'hpp':
      return cpp();
    case 'java':
      return java();
    case 'sql':
      return sql();
    case 'yaml':
    case 'yml':
      return yaml();
    case 'shell':
    case 'bash':
    case 'sh':
    case 'zsh':
      return StreamLanguage.define(shell);
    case 'go':
      return StreamLanguage.define(go);
    case 'ruby':
    case 'rb':
      return StreamLanguage.define(ruby);
    case 'toml':
      return StreamLanguage.define(toml);
    case 'dockerfile':
      return StreamLanguage.define(dockerFile);
    default:
      return null;
  }
}

/** Return the keybinding extension for the given mode */
function getKeybindingExtension(mode: EditorKeybindings): Extension | null {
  switch (mode) {
    case 'vim':
      return vim();
    case 'emacs':
      return emacs();
    default:
      return null;
  }
}

/** Map a file name/path to a language identifier */
export function detectLanguage(filePath: string): string {
  const name = filePath.split('/').pop() || filePath;
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';

  // Check exact file names first
  const fileNameMap: Record<string, string> = {
    Dockerfile: 'dockerfile',
    Makefile: 'shell',
    Rakefile: 'ruby',
    Gemfile: 'ruby',
    '.gitignore': 'shell',
    '.env': 'shell',
    '.bashrc': 'bash',
    '.zshrc': 'zsh',
  };
  if (fileNameMap[name]) return fileNameMap[name];

  // Then check extensions
  const extMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    mjs: 'javascript',
    cjs: 'javascript',
    mts: 'typescript',
    cts: 'typescript',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    jsonc: 'jsonc',
    md: 'markdown',
    mdx: 'markdown',
    xml: 'xml',
    svg: 'svg',
    py: 'python',
    rs: 'rust',
    cpp: 'cpp',
    c: 'c',
    h: 'h',
    hpp: 'hpp',
    java: 'java',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yml',
    sh: 'sh',
    bash: 'bash',
    zsh: 'zsh',
    go: 'go',
    rb: 'ruby',
    toml: 'toml',
  };

  return ext ? extMap[ext] || '' : '';
}

export function CodeEditor({
  value,
  onChange,
  onCursorChange,
  language = '',
  readOnly = false,
  mobile = false,
  diffHunks,
  className,
  'data-testid': testId,
}: CodeEditorProps) {
  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;

  // Read editor preferences from store
  const editorSettings = useAppStore((s) => s.fileEditorSettings);

  const resolvedFontFamily = editorSettings.fontFamily || DEFAULT_MONO_FONT;
  const resolvedFontSize = `${editorSettings.fontSize}px`;
  const resolvedLineHeight = `${editorSettings.lineHeight}`;

  // Serialize diffHunks to a stable key for useMemo
  const diffHunksKey = useMemo(
    () => (diffHunks && diffHunks.length > 0 ? JSON.stringify(diffHunks) : ''),
    [diffHunks]
  );

  const extensions = useMemo(() => {
    const theme = createEditorTheme({
      fontSize: resolvedFontSize,
      fontFamily: resolvedFontFamily,
      lineHeight: resolvedLineHeight,
      ligatures: editorSettings.ligatures,
      mobile,
    });
    const exts: Extension[] = [syntaxHighlighting(syntaxColors), theme];

    // Tab size and indent style
    exts.push(
      indentUnit.of(editorSettings.indentWithTabs ? '\t' : ' '.repeat(editorSettings.tabSize))
    );
    exts.push(EditorState.tabSize.of(editorSettings.tabSize));

    // Word wrap
    if (editorSettings.wordWrap) {
      exts.push(EditorView.lineWrapping);
    }

    // Language support
    const langExt = getLanguageExtension(language);
    if (langExt) exts.push(langExt);

    // Add diff gutter if hunks are available
    if (diffHunks && diffHunks.length > 0) {
      exts.push(createDiffGutter(diffHunks));
    }

    // Keybinding mode
    const kbExt = getKeybindingExtension(editorSettings.keybindings);
    if (kbExt) exts.push(kbExt);

    // Cursor position tracking extension
    exts.push(
      EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.docChanged) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          onCursorChangeRef.current?.(line.number, pos - line.from + 1);
        }
      })
    );

    return exts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    language,
    mobile,
    diffHunksKey,
    resolvedFontSize,
    resolvedFontFamily,
    resolvedLineHeight,
    editorSettings.ligatures,
    editorSettings.tabSize,
    editorSettings.indentWithTabs,
    editorSettings.wordWrap,
    editorSettings.keybindings,
  ]);

  const handleChange = useCallback(
    (val: string) => {
      onChange?.(val);
    },
    [onChange]
  );

  return (
    <div className={cn('h-full w-full', className)} data-testid={testId}>
      <CodeMirror
        value={value}
        onChange={handleChange}
        extensions={extensions}
        theme="none"
        height="100%"
        className="h-full [&_.cm-editor]:h-full"
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: editorSettings.showLineNumbers,
          foldGutter: mobile ? false : editorSettings.showFoldGutter,
          highlightActiveLine: editorSettings.highlightActiveLine,
          highlightSelectionMatches: true,
          autocompletion: false,
          bracketMatching: editorSettings.bracketMatching,
          indentOnInput: true,
          closeBrackets: editorSettings.closeBrackets,
          searchKeymap: true,
          tabSize: editorSettings.tabSize,
        }}
      />
    </div>
  );
}
