import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Code2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PreferredEditor } from '@automaker/types';

interface EditorSectionProps {
  preferredEditor: PreferredEditor;
  onPreferredEditorChange: (value: PreferredEditor) => void;
}

const EDITOR_OPTIONS: { value: PreferredEditor; label: string; description: string }[] = [
  { value: 'cursor', label: 'Cursor', description: 'AI-powered code editor' },
  { value: 'code', label: 'VS Code', description: 'Visual Studio Code' },
  { value: 'zed', label: 'Zed', description: 'High-performance code editor' },
];

export function EditorSection({ preferredEditor, onPreferredEditorChange }: EditorSectionProps) {
  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <Code2 className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Editor</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure your preferred code editor for opening files.
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div className="space-y-3">
          <Label htmlFor="preferred-editor" className="text-foreground font-medium">
            Preferred Editor
          </Label>
          <Select
            value={preferredEditor}
            onValueChange={(value) => onPreferredEditorChange(value as PreferredEditor)}
          >
            <SelectTrigger id="preferred-editor" className="w-full max-w-xs">
              <SelectValue placeholder="Select an editor" />
            </SelectTrigger>
            <SelectContent>
              {EDITOR_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground/80 leading-relaxed">
            The editor that will be used when you press{' '}
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Ctrl+Enter</kbd>{' '}
            on a file in the file mention picker. Make sure the editor&apos;s CLI is installed and
            available in your PATH.
          </p>
        </div>
      </div>
    </div>
  );
}
