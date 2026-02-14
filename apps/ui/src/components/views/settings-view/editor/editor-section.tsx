import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
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
import { toast } from 'sonner';
import { UI_MONO_FONT_OPTIONS, DEFAULT_FONT_VALUE } from '@/config/ui-font-options';
import {
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_EDITOR_TAB_SIZE,
  DEFAULT_EDITOR_LINE_HEIGHT,
} from '@/store/defaults';
import type { EditorKeybindings } from '@/store/types/ui-types';

export function EditorSection() {
  const { fileEditorSettings, setFileEditorSettings } = useAppStore();

  const {
    fontSize,
    fontFamily,
    tabSize,
    indentWithTabs,
    wordWrap,
    ligatures,
    lineHeight,
    showLineNumbers,
    showFoldGutter,
    highlightActiveLine,
    bracketMatching,
    closeBrackets,
    autoSaveEnabled,
    autoSaveIntervalMs,
    keybindings,
  } = fileEditorSettings;

  return (
    <div className="space-y-6">
      {/* Main Editor Card */}
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
            <h2 className="text-lg font-semibold text-foreground tracking-tight">Editor</h2>
          </div>
          <p className="text-sm text-muted-foreground/80 ml-12">
            Configure the code editor appearance, behavior, and keybinding preferences.
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Font Family */}
          <div className="space-y-3">
            <Label className="text-foreground font-medium">Font Family</Label>
            <p className="text-xs text-muted-foreground">Monospace font used in the code editor</p>
            <Select
              value={fontFamily ?? DEFAULT_FONT_VALUE}
              onValueChange={(value) => {
                setFileEditorSettings({
                  fontFamily: value === DEFAULT_FONT_VALUE ? null : value,
                });
                toast.success('Editor font updated');
              }}
            >
              <SelectTrigger className="w-full" data-testid="editor-font-family">
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

          {/* Font Size */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Font Size</Label>
              <span className="text-sm text-muted-foreground">{fontSize}px</span>
            </div>
            <Slider
              value={[fontSize]}
              min={8}
              max={32}
              step={1}
              onValueChange={([value]) => setFileEditorSettings({ fontSize: value })}
              className="flex-1"
              data-testid="editor-font-size"
            />
          </div>

          {/* Line Height */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Line Height</Label>
              <span className="text-sm text-muted-foreground">{lineHeight.toFixed(1)}</span>
            </div>
            <Slider
              value={[lineHeight]}
              min={1.0}
              max={2.5}
              step={0.1}
              onValueChange={([value]) => setFileEditorSettings({ lineHeight: value })}
              className="flex-1"
              data-testid="editor-line-height"
            />
          </div>

          {/* Font Ligatures */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-foreground font-medium">Font Ligatures</Label>
              <p className="text-xs text-muted-foreground">
                Enable ligatures for fonts that support them (e.g. Fira Code, JetBrains Mono)
              </p>
            </div>
            <Switch
              checked={ligatures}
              onCheckedChange={(checked) => {
                setFileEditorSettings({ ligatures: checked });
                toast.success(checked ? 'Ligatures enabled' : 'Ligatures disabled');
              }}
              data-testid="editor-ligatures"
            />
          </div>

          {/* Tab Size */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Tab Size</Label>
              <span className="text-sm text-muted-foreground">{tabSize} spaces</span>
            </div>
            <Slider
              value={[tabSize]}
              min={1}
              max={8}
              step={1}
              onValueChange={([value]) => setFileEditorSettings({ tabSize: value })}
              className="flex-1"
              data-testid="editor-tab-size"
            />
          </div>

          {/* Indent with Tabs */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-foreground font-medium">Indent with Tabs</Label>
              <p className="text-xs text-muted-foreground">
                Use tab characters instead of spaces for indentation
              </p>
            </div>
            <Switch
              checked={indentWithTabs}
              onCheckedChange={(checked) => {
                setFileEditorSettings({ indentWithTabs: checked });
                toast.success(
                  checked ? 'Using tabs for indentation' : 'Using spaces for indentation'
                );
              }}
              data-testid="editor-indent-tabs"
            />
          </div>

          {/* Word Wrap */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-foreground font-medium">Word Wrap</Label>
              <p className="text-xs text-muted-foreground">
                Wrap long lines instead of horizontal scrolling
              </p>
            </div>
            <Switch
              checked={wordWrap}
              onCheckedChange={(checked) => {
                setFileEditorSettings({ wordWrap: checked });
                toast.success(checked ? 'Word wrap enabled' : 'Word wrap disabled');
              }}
              data-testid="editor-word-wrap"
            />
          </div>

          {/* Line Numbers */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-foreground font-medium">Line Numbers</Label>
              <p className="text-xs text-muted-foreground">Show line numbers in the gutter</p>
            </div>
            <Switch
              checked={showLineNumbers}
              onCheckedChange={(checked) => {
                setFileEditorSettings({ showLineNumbers: checked });
              }}
              data-testid="editor-line-numbers"
            />
          </div>

          {/* Fold Gutter */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-foreground font-medium">Code Folding</Label>
              <p className="text-xs text-muted-foreground">
                Show fold/collapse controls in the gutter
              </p>
            </div>
            <Switch
              checked={showFoldGutter}
              onCheckedChange={(checked) => {
                setFileEditorSettings({ showFoldGutter: checked });
              }}
              data-testid="editor-fold-gutter"
            />
          </div>

          {/* Highlight Active Line */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-foreground font-medium">Highlight Active Line</Label>
              <p className="text-xs text-muted-foreground">
                Highlight the line where the cursor is located
              </p>
            </div>
            <Switch
              checked={highlightActiveLine}
              onCheckedChange={(checked) => {
                setFileEditorSettings({ highlightActiveLine: checked });
              }}
              data-testid="editor-highlight-active-line"
            />
          </div>

          {/* Bracket Matching */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-foreground font-medium">Bracket Matching</Label>
              <p className="text-xs text-muted-foreground">
                Highlight matching brackets when the cursor is near one
              </p>
            </div>
            <Switch
              checked={bracketMatching}
              onCheckedChange={(checked) => {
                setFileEditorSettings({ bracketMatching: checked });
              }}
              data-testid="editor-bracket-matching"
            />
          </div>

          {/* Auto-close Brackets */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-foreground font-medium">Auto-close Brackets</Label>
              <p className="text-xs text-muted-foreground">
                Automatically insert closing brackets, quotes, and tags
              </p>
            </div>
            <Switch
              checked={closeBrackets}
              onCheckedChange={(checked) => {
                setFileEditorSettings({ closeBrackets: checked });
              }}
              data-testid="editor-close-brackets"
            />
          </div>

          {/* Keybindings */}
          <div className="space-y-3">
            <Label className="text-foreground font-medium">Keybindings</Label>
            <p className="text-xs text-muted-foreground">
              Keyboard shortcut style for the code editor
            </p>
            <Select
              value={keybindings}
              onValueChange={(value: EditorKeybindings) => {
                setFileEditorSettings({ keybindings: value });
                toast.success(
                  value === 'default'
                    ? 'Default keybindings active'
                    : `${value.charAt(0).toUpperCase() + value.slice(1)} keybindings active`
                );
              }}
            >
              <SelectTrigger className="w-full" data-testid="editor-keybindings">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="vim">Vim</SelectItem>
                <SelectItem value="emacs">Emacs</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Auto-save Card */}
      <div
        className={cn(
          'rounded-2xl overflow-hidden',
          'border border-border/50',
          'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm shadow-black/5'
        )}
      >
        <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
          <h3 className="text-base font-semibold text-foreground tracking-tight">Auto Save</h3>
          <p className="text-sm text-muted-foreground/80 mt-1">
            Automatically save files at a regular interval.
          </p>
        </div>
        <div className="p-6 space-y-6">
          {/* Auto-save Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-foreground font-medium">Enable Auto Save</Label>
              <p className="text-xs text-muted-foreground">Periodically save open files to disk</p>
            </div>
            <Switch
              checked={autoSaveEnabled}
              onCheckedChange={(checked) => {
                setFileEditorSettings({ autoSaveEnabled: checked });
                toast.success(checked ? 'Auto save enabled' : 'Auto save disabled');
              }}
              data-testid="editor-auto-save"
            />
          </div>

          {/* Auto-save Interval */}
          {autoSaveEnabled && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-foreground font-medium">Save Interval</Label>
                <span className="text-sm text-muted-foreground">
                  {(autoSaveIntervalMs / 1000).toFixed(0)}s
                </span>
              </div>
              <Slider
                value={[autoSaveIntervalMs]}
                min={5000}
                max={120000}
                step={5000}
                onValueChange={([value]) => setFileEditorSettings({ autoSaveIntervalMs: value })}
                className="flex-1"
                data-testid="editor-auto-save-interval"
              />
            </div>
          )}
        </div>
      </div>

      {/* Reset Button */}
      <div className="flex justify-end">
        <button
          onClick={() => {
            setFileEditorSettings({
              fontSize: DEFAULT_EDITOR_FONT_SIZE,
              fontFamily: null,
              tabSize: DEFAULT_EDITOR_TAB_SIZE,
              indentWithTabs: false,
              wordWrap: false,
              ligatures: true,
              lineHeight: DEFAULT_EDITOR_LINE_HEIGHT,
              showLineNumbers: true,
              showFoldGutter: true,
              highlightActiveLine: true,
              bracketMatching: true,
              closeBrackets: true,
              keybindings: 'default',
              showMinimap: false,
            });
            toast.success('Editor preferences reset to defaults');
          }}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="editor-reset-defaults"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
