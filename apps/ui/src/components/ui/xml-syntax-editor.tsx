import CodeMirror from '@uiw/react-codemirror';
import { xml } from '@codemirror/lang-xml';
import { EditorView } from '@codemirror/view';
import { cn } from '@/lib/utils';

interface XmlSyntaxEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'data-testid'?: string;
}

// Simple editor theme - inherits text color from parent
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '0.875rem',
    backgroundColor: 'transparent',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-content': {
    padding: '1rem',
    minHeight: '100%',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-line': {
    padding: '0',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    display: 'none',
  },
});

export function XmlSyntaxEditor({
  value,
  onChange,
  placeholder,
  className,
  'data-testid': testId,
}: XmlSyntaxEditorProps) {
  return (
    <div className={cn('w-full h-full', className)} data-testid={testId}>
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={[xml(), editorTheme]}
        theme="none"
        placeholder={placeholder}
        className="h-full [&_.cm-editor]:h-full [&_.cm-content]:text-foreground"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightSelectionMatches: false,
          autocompletion: false,
          bracketMatching: true,
          indentOnInput: true,
        }}
      />
    </div>
  );
}
