import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { javascript } from '@codemirror/legacy-modes/mode/javascript';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { cn } from '@/lib/utils';

interface JsonSyntaxEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  readOnly?: boolean;
  'data-testid'?: string;
}

// Syntax highlighting using CSS variables for theme compatibility
const syntaxColors = HighlightStyle.define([
  // Property names (keys)
  { tag: t.propertyName, color: 'var(--chart-2, oklch(0.6 0.118 184.704))' },

  // Strings (values)
  { tag: t.string, color: 'var(--chart-1, oklch(0.646 0.222 41.116))' },

  // Numbers
  { tag: t.number, color: 'var(--chart-3, oklch(0.7 0.15 150))' },

  // Booleans and null
  { tag: t.bool, color: 'var(--chart-4, oklch(0.7 0.15 280))' },
  { tag: t.null, color: 'var(--chart-4, oklch(0.7 0.15 280))' },
  { tag: t.keyword, color: 'var(--chart-4, oklch(0.7 0.15 280))' },

  // Brackets and punctuation
  { tag: t.bracket, color: 'var(--muted-foreground)' },
  { tag: t.punctuation, color: 'var(--muted-foreground)' },

  // Default text
  { tag: t.content, color: 'var(--foreground)' },
]);

// Editor theme using CSS variables
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '0.8125rem',
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
    backgroundColor: 'var(--accent)',
    opacity: '0.3',
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
    minWidth: '2.5rem',
    textAlign: 'right',
    paddingRight: '0.5rem',
  },
  '.cm-placeholder': {
    color: 'var(--muted-foreground)',
    fontStyle: 'italic',
  },
});

// JavaScript language in JSON mode
const jsonLanguage = StreamLanguage.define(javascript);

// Combine all extensions
const extensions: Extension[] = [jsonLanguage, syntaxHighlighting(syntaxColors), editorTheme];

export function JsonSyntaxEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = '300px',
  maxHeight,
  readOnly = false,
  'data-testid': testId,
}: JsonSyntaxEditorProps) {
  return (
    <div
      className={cn('w-full rounded-lg border border-border bg-muted/30', className)}
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
        readOnly={readOnly}
        className="[&_.cm-editor]:min-h-[inherit]"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
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
