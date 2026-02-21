import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileCode2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { UI_MONO_FONT_OPTIONS, DEFAULT_FONT_VALUE } from '@/config/ui-font-options';

/**
 * Editor font options - reuses UI_MONO_FONT_OPTIONS with editor-specific default label
 *
 * The 'default' value means "use the default editor font" (Geist Mono / theme default)
 */
const EDITOR_FONT_OPTIONS = UI_MONO_FONT_OPTIONS.map((option) => {
  if (option.value === DEFAULT_FONT_VALUE) {
    return { value: option.value, label: 'Default (Geist Mono)' };
  }
  return option;
});

export function EditorSection() {
  const {
    editorFontSize,
    editorFontFamily,
    editorAutoSave,
    setEditorFontSize,
    setEditorFontFamily,
    setEditorAutoSave,
  } = useAppStore();

  return (
    <div className="space-y-6">
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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center border border-blue-500/20">
              <FileCode2 className="w-5 h-5 text-blue-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">File Editor</h2>
          </div>
          <p className="text-sm text-muted-foreground/80 ml-12">
            Customize the appearance of the built-in file editor.
          </p>
        </div>
        <div className="p-6 space-y-6">
          {/* Font Family */}
          <div className="space-y-3">
            <Label className="text-foreground font-medium">Font Family</Label>
            <Select
              value={editorFontFamily || DEFAULT_FONT_VALUE}
              onValueChange={(value) => {
                setEditorFontFamily(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Default (Geist Mono)" />
              </SelectTrigger>
              <SelectContent>
                {EDITOR_FONT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span
                      style={{
                        fontFamily: option.value === DEFAULT_FONT_VALUE ? undefined : option.value,
                      }}
                    >
                      {option.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Font Size */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Font Size</Label>
              <span className="text-sm text-muted-foreground">{editorFontSize}px</span>
            </div>
            <Slider
              value={[editorFontSize]}
              min={8}
              max={32}
              step={1}
              onValueChange={([value]) => setEditorFontSize(value)}
              className="flex-1"
            />
          </div>

          {/* Auto Save */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-foreground font-medium">Auto Save</Label>
                <p className="text-xs text-muted-foreground/80 mt-0.5">
                  Automatically save files after changes or when switching tabs
                </p>
              </div>
              <Switch checked={editorAutoSave} onCheckedChange={setEditorAutoSave} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
