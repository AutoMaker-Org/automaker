import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { UI_MONO_FONT_OPTIONS, DEFAULT_FONT_VALUE } from '@/config/ui-font-options';

interface EditorSettingsFormProps {
  editorFontSize: number;
  setEditorFontSize: (value: number) => void;
  editorFontFamily: string | null | undefined;
  setEditorFontFamily: (value: string) => void;
  editorAutoSave: boolean;
  setEditorAutoSave: (value: boolean) => void;
}

export function EditorSettingsForm({
  editorFontSize,
  setEditorFontSize,
  editorFontFamily,
  setEditorFontFamily,
  editorAutoSave,
  setEditorAutoSave,
}: EditorSettingsFormProps) {
  return (
    <>
      {/* Font Size */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Font Size</Label>
          <span className="text-xs text-muted-foreground">{editorFontSize}px</span>
        </div>
        <div className="flex items-center gap-2">
          <Slider
            value={[editorFontSize]}
            min={8}
            max={32}
            step={1}
            onValueChange={([value]) => setEditorFontSize(value)}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => setEditorFontSize(13)}
            disabled={editorFontSize === 13}
            title="Reset to default"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Font Family */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Font Family</Label>
        <Select
          value={editorFontFamily || DEFAULT_FONT_VALUE}
          onValueChange={(value) => setEditorFontFamily(value)}
        >
          <SelectTrigger className="w-full h-8 text-xs">
            <SelectValue placeholder="Default (Geist Mono)" />
          </SelectTrigger>
          <SelectContent>
            {UI_MONO_FONT_OPTIONS.map((option) => (
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

      {/* Auto Save toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Auto Save</Label>
        <Switch checked={editorAutoSave} onCheckedChange={setEditorAutoSave} />
      </div>
    </>
  );
}
