import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { cn } from '@/lib/utils';

interface ShellSyntaxEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  'data-testid'?: string;
}

// Syntax highlighting using CSS variables for theme compatibility
const syntaxColors = HighlightStyle.define([
  // Keywords (if, then, else, fi, for, while, do, done, case, esac, etc.)
  { tag: t.keyword, color: 'var(--chart-4, oklch(0.7 0.15 280))' },

  // Strings (single and double quoted)
  { tag: t.string, color: 'var(--chart-1, oklch(0.646 0.222 41.116))' },

  // Comments
  { tag: t.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },

  // Variables ($VAR, ${VAR})
  { tag: t.variableName, color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },

  // Operators
  { tag: t.operator, color: 'var(--muted-foreground)' },

  // Numbers
  { tag: t.number, color: 'var(--chart-3, oklch(0.7 0.15 150))' },

  // Function names / commands
  { tag: t.function(t.variableName), color: 'var(--primary)' },
  { tag: t.attributeName, color: 'var(--chart-5, oklch(0.65 0.2 30))' },

  // Default text
  { tag: t.content, color: 'var(--foreground)' },
]);

// Editor theme using CSS variables
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '0.875rem',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
  '.cm-content': {
    padding: '0.75rem',
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
    backgroundColor: 'transparent',
  },
  '.cm-line': {
    padding: '0 0.25rem',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    border: 'none',
    paddingRight: '0.5rem',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '2rem',
    textAlign: 'right',
    paddingRight: '0.5rem',
  },
  '.cm-placeholder': {
    color: 'var(--muted-foreground)',
    fontStyle: 'italic',
  },
});

// Combine all extensions
const extensions: Extension[] = [
  StreamLanguage.define(shell),
  syntaxHighlighting(syntaxColors),
  editorTheme,
];

export function ShellSyntaxEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = '200px',
  maxHeight,
  'data-testid': testId,
}: ShellSyntaxEditorProps) {
  return (
    <div
      className={cn('w-full rounded-lg border border-border bg-background', className)}
      style={{ minHeight }}
      data-testid={testId}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme="none"
        placeholder={placeholder}
        height={maxHeight}
        minHeight={minHeight}
        className="[&_.cm-editor]:min-h-[inherit]"
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          autocompletion: false,
          bracketMatching: true,
          indentOnInput: true,
        }}
      />
    </div>
  );
}
