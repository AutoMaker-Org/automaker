import { useRef } from 'react';
import { Columns2, Eye, Code2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Markdown } from '@/components/ui/markdown';
import type { MarkdownViewMode } from '../use-file-editor-store';

/** Toolbar for switching between editor/preview/split modes */
export function MarkdownViewToolbar({
  viewMode,
  onViewModeChange,
}: {
  viewMode: MarkdownViewMode;
  onViewModeChange: (mode: MarkdownViewMode) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5">
      <button
        onClick={() => onViewModeChange('editor')}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
          viewMode === 'editor'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
        title="Editor only"
      >
        <Code2 className="w-3 h-3" />
        <span>Edit</span>
      </button>
      <button
        onClick={() => onViewModeChange('split')}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
          viewMode === 'split'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
        title="Split view"
      >
        <Columns2 className="w-3 h-3" />
        <span>Split</span>
      </button>
      <button
        onClick={() => onViewModeChange('preview')}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
          viewMode === 'preview'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
        title="Preview only"
      >
        <Eye className="w-3 h-3" />
        <span>Preview</span>
      </button>
    </div>
  );
}

/** Rendered markdown preview panel */
export function MarkdownPreviewPanel({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={scrollRef}
      className={cn('h-full overflow-y-auto bg-background/50 p-6', className)}
      data-testid="markdown-preview"
    >
      <div className="max-w-3xl mx-auto">
        <Markdown>{content || '*No content to preview*'}</Markdown>
      </div>
    </div>
  );
}

/** Check if a file is a markdown file */
export function isMarkdownFile(filePath: string): boolean {
  const fileName = filePath.split('/').pop() || '';
  const dotIndex = fileName.lastIndexOf('.');
  const ext = dotIndex > 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
  return ['md', 'mdx', 'markdown'].includes(ext);
}
