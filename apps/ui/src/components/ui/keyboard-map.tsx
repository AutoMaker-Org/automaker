import * as React from 'react';
import {
  useAppStore,
  DEFAULT_KEYBOARD_SHORTCUTS,
  parseShortcut,
  formatShortcut,
} from '@/store/app-store';
import type { KeyboardShortcuts } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CheckCircle2, X, RotateCcw, Edit2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

// Detect if running on Mac
const isMac =
  typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

// Keyboard layout - US QWERTY
const KEYBOARD_ROWS = [
  // Number row
  [
    { key: '`', label: '`', width: 1 },
    { key: '1', label: '1', width: 1 },
    { key: '2', label: '2', width: 1 },
    { key: '3', label: '3', width: 1 },
    { key: '4', label: '4', width: 1 },
    { key: '5', label: '5', width: 1 },
    { key: '6', label: '6', width: 1 },
    { key: '7', label: '7', width: 1 },
    { key: '8', label: '8', width: 1 },
    { key: '9', label: '9', width: 1 },
    { key: '0', label: '0', width: 1 },
    { key: '-', label: '-', width: 1 },
    { key: '=', label: '=', width: 1 },
  ],
  // Top letter row
  [
    { key: 'Q', label: 'Q', width: 1 },
    { key: 'W', label: 'W', width: 1 },
    { key: 'E', label: 'E', width: 1 },
    { key: 'R', label: 'R', width: 1 },
    { key: 'T', label: 'T', width: 1 },
    { key: 'Y', label: 'Y', width: 1 },
    { key: 'U', label: 'U', width: 1 },
    { key: 'I', label: 'I', width: 1 },
    { key: 'O', label: 'O', width: 1 },
    { key: 'P', label: 'P', width: 1 },
    { key: '[', label: '[', width: 1 },
    { key: ']', label: ']', width: 1 },
    { key: '\\', label: '\\', width: 1 },
  ],
  // Home row
  [
    { key: 'A', label: 'A', width: 1 },
    { key: 'S', label: 'S', width: 1 },
    { key: 'D', label: 'D', width: 1 },
    { key: 'F', label: 'F', width: 1 },
    { key: 'G', label: 'G', width: 1 },
    { key: 'H', label: 'H', width: 1 },
    { key: 'J', label: 'J', width: 1 },
    { key: 'K', label: 'K', width: 1 },
    { key: 'L', label: 'L', width: 1 },
    { key: ';', label: ';', width: 1 },
    { key: "'", label: "'", width: 1 },
  ],
  // Bottom letter row
  [
    { key: 'Z', label: 'Z', width: 1 },
    { key: 'X', label: 'X', width: 1 },
    { key: 'C', label: 'C', width: 1 },
    { key: 'V', label: 'V', width: 1 },
    { key: 'B', label: 'B', width: 1 },
    { key: 'N', label: 'N', width: 1 },
    { key: 'M', label: 'M', width: 1 },
    { key: ',', label: ',', width: 1 },
    { key: '.', label: '.', width: 1 },
    { key: '/', label: '/', width: 1 },
  ],
];

// Map shortcut names to human-readable labels
const SHORTCUT_LABELS: Record<keyof KeyboardShortcuts, string> = {
  board: 'Kanban Board',
  graph: 'Graph View',
  agent: 'Agent Runner',
  spec: 'Spec Editor',
  context: 'Context',
  memory: 'Memory',
  settings: 'Settings',
  terminal: 'Terminal',
  ideation: 'Ideation',
  githubIssues: 'GitHub Issues',
  githubPrs: 'Pull Requests',
  toggleSidebar: 'Toggle Sidebar',
  addFeature: 'Add Feature',
  addContextFile: 'Add Context File',
  startNext: 'Start Next',
  newSession: 'New Session',
  openProject: 'Open Project',
  projectPicker: 'Project Picker',
  cyclePrevProject: 'Prev Project',
  cycleNextProject: 'Next Project',
  splitTerminalRight: 'Split Right',
  splitTerminalDown: 'Split Down',
  closeTerminal: 'Close Terminal',
  newTerminalTab: 'New Tab',
};

// Categorize shortcuts for color coding
const SHORTCUT_CATEGORIES: Record<keyof KeyboardShortcuts, 'navigation' | 'ui' | 'action'> = {
  board: 'navigation',
  graph: 'navigation',
  agent: 'navigation',
  spec: 'navigation',
  context: 'navigation',
  memory: 'navigation',
  settings: 'navigation',
  terminal: 'navigation',
  ideation: 'navigation',
  githubIssues: 'navigation',
  githubPrs: 'navigation',
  toggleSidebar: 'ui',
  addFeature: 'action',
  addContextFile: 'action',
  startNext: 'action',
  newSession: 'action',
  openProject: 'action',
  projectPicker: 'action',
  cyclePrevProject: 'action',
  cycleNextProject: 'action',
  splitTerminalRight: 'action',
  splitTerminalDown: 'action',
  closeTerminal: 'action',
  newTerminalTab: 'action',
};

// Category colors
const CATEGORY_COLORS = {
  navigation: {
    bg: 'bg-blue-500/20',
    border: 'border-blue-500/50',
    text: 'text-blue-400',
    label: 'Navigation',
  },
  ui: {
    bg: 'bg-purple-500/20',
    border: 'border-purple-500/50',
    text: 'text-purple-400',
    label: 'UI Controls',
  },
  action: {
    bg: 'bg-green-500/20',
    border: 'border-green-500/50',
    text: 'text-green-400',
    label: 'Actions',
  },
};

interface KeyboardMapProps {
  onKeySelect?: (key: string) => void;
  selectedKey?: string | null;
  className?: string;
}

export function KeyboardMap({ onKeySelect, selectedKey, className }: KeyboardMapProps) {
  const { keyboardShortcuts } = useAppStore();

  // Merge with defaults to ensure new shortcuts are always shown
  const mergedShortcuts = React.useMemo(
    () => ({
      ...DEFAULT_KEYBOARD_SHORTCUTS,
      ...keyboardShortcuts,
    }),
    [keyboardShortcuts]
  );

  // Create a reverse map: base key -> list of shortcut names (including info about modifiers)
  const keyToShortcuts = React.useMemo(() => {
    const map: Record<string, Array<{ name: keyof KeyboardShortcuts; hasModifiers: boolean }>> = {};
    (Object.entries(mergedShortcuts) as [keyof KeyboardShortcuts, string][]).forEach(
      ([shortcutName, shortcutStr]) => {
        if (!shortcutStr) return; // Skip undefined shortcuts
        const parsed = parseShortcut(shortcutStr);
        const normalizedKey = parsed.key.toUpperCase();
        const hasModifiers = !!(parsed.shift || parsed.cmdCtrl || parsed.alt);
        if (!map[normalizedKey]) {
          map[normalizedKey] = [];
        }
        map[normalizedKey].push({ name: shortcutName, hasModifiers });
      }
    );
    return map;
  }, [mergedShortcuts]);

  const renderKey = (keyDef: { key: string; label: string; width: number }) => {
    const normalizedKey = keyDef.key.toUpperCase();
    const shortcutInfos = keyToShortcuts[normalizedKey] || [];
    const shortcuts = shortcutInfos.map((s) => s.name);
    const isBound = shortcuts.length > 0;
    const isSelected = selectedKey?.toUpperCase() === normalizedKey;
    const isModified = shortcuts.some((s) => mergedShortcuts[s] !== DEFAULT_KEYBOARD_SHORTCUTS[s]);

    // Get category for coloring (use first shortcut's category if multiple)
    const category = shortcuts.length > 0 ? SHORTCUT_CATEGORIES[shortcuts[0]] : null;
    const colors = category ? CATEGORY_COLORS[category] : null;

    const keyElement = (
      <button
        key={keyDef.key}
        onClick={() => onKeySelect?.(keyDef.key)}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg border transition-all',
          'h-12 min-w-11 py-1',
          keyDef.width > 1 && `w-[${keyDef.width * 2.75}rem]`,
          // Base styles
          !isBound && 'bg-sidebar-accent/10 border-sidebar-border hover:bg-sidebar-accent/20',
          // Bound key styles
          isBound && colors && `${colors.bg} ${colors.border} hover:brightness-110`,
          // Selected state
          isSelected && 'ring-2 ring-brand-500 ring-offset-2 ring-offset-background',
          // Modified indicator
          isModified && 'ring-1 ring-yellow-500/50'
        )}
        data-testid={`keyboard-key-${keyDef.key}`}
      >
        {/* Key label - always at top */}
        <span
          className={cn(
            'text-sm font-mono font-bold leading-none',
            isBound && colors ? colors.text : 'text-muted-foreground'
          )}
        >
          {keyDef.label}
        </span>
        {/* Shortcut label - always takes up space to maintain consistent height */}
        <span
          className={cn(
            'text-[9px] leading-tight text-center px-0.5 truncate max-w-full h-3 mt-0.5',
            isBound && shortcuts.length > 0
              ? colors
                ? colors.text
                : 'text-muted-foreground'
              : 'opacity-0'
          )}
        >
          {
            isBound && shortcuts.length > 0
              ? shortcuts.length === 1
                ? (SHORTCUT_LABELS[shortcuts[0]]?.split(' ')[0] ?? shortcuts[0])
                : `${shortcuts.length}x`
              : '\u00A0' // Non-breaking space to maintain height
          }
        </span>
        {isModified && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-500" />
        )}
      </button>
    );

    // Wrap in tooltip if bound
    if (isBound) {
      return (
        <Tooltip key={keyDef.key}>
          <TooltipTrigger asChild>{keyElement}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-1">
              {shortcuts.map((shortcut) => {
                const shortcutStr = mergedShortcuts[shortcut];
                const displayShortcut = formatShortcut(shortcutStr, true);
                return (
                  <div key={shortcut} className="flex items-center gap-2">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        SHORTCUT_CATEGORIES[shortcut] &&
                          CATEGORY_COLORS[SHORTCUT_CATEGORIES[shortcut]]
                          ? CATEGORY_COLORS[SHORTCUT_CATEGORIES[shortcut]].bg.replace('/20', '')
                          : 'bg-muted-foreground'
                      )}
                    />
                    <span className="text-sm">{SHORTCUT_LABELS[shortcut] ?? shortcut}</span>
                    <kbd className="text-xs font-mono bg-sidebar-accent/30 px-1 rounded">
                      {displayShortcut}
                    </kbd>
                    {mergedShortcuts[shortcut] !== DEFAULT_KEYBOARD_SHORTCUTS[shortcut] && (
                      <span className="text-xs text-yellow-400">(custom)</span>
                    )}
                  </div>
                );
              })}
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    return keyElement;
  };

  return (
    <TooltipProvider>
      <div className={cn('space-y-4', className)} data-testid="keyboard-map">
        {/* Legend */}
        <div className="flex flex-wrap gap-4 justify-center text-xs">
          {Object.entries(CATEGORY_COLORS).map(([key, colors]) => (
            <div key={key} className="flex items-center gap-2">
              <div className={cn('w-4 h-4 rounded border', colors.bg, colors.border)} />
              <span className={colors.text}>{colors.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-sidebar-accent/10 border border-sidebar-border" />
            <span className="text-muted-foreground">Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-yellow-400">Modified</span>
          </div>
        </div>

        {/* Keyboard layout */}
        <div className="flex flex-col items-center gap-1.5 p-4 rounded-xl bg-sidebar-accent/5 border border-sidebar-border">
          {KEYBOARD_ROWS.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-1.5 justify-center">
              {row.map(renderKey)}
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-6 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{Object.keys(keyboardShortcuts).length}</strong>{' '}
            shortcuts configured
          </span>
          <span>
            <strong className="text-foreground">{Object.keys(keyToShortcuts).length}</strong> keys
            in use
          </span>
          <span>
            <strong className="text-foreground">
              {KEYBOARD_ROWS.flat().length - Object.keys(keyToShortcuts).length}
            </strong>{' '}
            keys available
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}

// Full shortcut reference panel with editing capability
interface ShortcutReferencePanelProps {
  editable?: boolean;
}

export function ShortcutReferencePanel({ editable = false }: ShortcutReferencePanelProps) {
  const { keyboardShortcuts, setKeyboardShortcut, resetKeyboardShortcuts } = useAppStore();
  const [editingShortcut, setEditingShortcut] = React.useState<keyof KeyboardShortcuts | null>(
    null
  );
  const [keyValue, setKeyValue] = React.useState('');
  const [modifiers, setModifiers] = React.useState({ shift: false, cmdCtrl: false, alt: false });
  const [shortcutError, setShortcutError] = React.useState<string | null>(null);

  // Merge with defaults to ensure new shortcuts are always shown
  const mergedShortcuts = React.useMemo(
    () => ({
      ...DEFAULT_KEYBOARD_SHORTCUTS,
      ...keyboardShortcuts,
    }),
    [keyboardShortcuts]
  );

  const groupedShortcuts = React.useMemo(() => {
    const groups: Record<
      string,
      Array<{ key: keyof KeyboardShortcuts; label: string; value: string }>
    > = {
      navigation: [],
      ui: [],
      action: [],
    };

    (Object.entries(SHORTCUT_CATEGORIES) as [keyof KeyboardShortcuts, string][]).forEach(
      ([shortcut, category]) => {
        groups[category].push({
          key: shortcut,
          label: SHORTCUT_LABELS[shortcut] ?? shortcut,
          value: mergedShortcuts[shortcut],
        });
      }
    );

    return groups;
  }, [mergedShortcuts]);

  // Build the full shortcut string from key + modifiers
  const buildShortcutString = React.useCallback((key: string, mods: typeof modifiers) => {
    const parts: string[] = [];
    if (mods.cmdCtrl) parts.push(isMac ? 'Cmd' : 'Ctrl');
    if (mods.alt) parts.push(isMac ? 'Opt' : 'Alt');
    if (mods.shift) parts.push('Shift');
    parts.push(key.toUpperCase());
    return parts.join('+');
  }, []);

  // Check for conflicts with other shortcuts
  const checkConflict = React.useCallback(
    (shortcutStr: string, currentKey: keyof KeyboardShortcuts) => {
      const conflict = Object.entries(mergedShortcuts).find(
        ([k, v]) => k !== currentKey && v?.toUpperCase() === shortcutStr.toUpperCase()
      );
      return conflict
        ? (SHORTCUT_LABELS[conflict[0] as keyof KeyboardShortcuts] ?? conflict[0])
        : null;
    },
    [mergedShortcuts]
  );

  const handleStartEdit = (key: keyof KeyboardShortcuts) => {
    const currentValue = mergedShortcuts[key];
    const parsed = parseShortcut(currentValue);
    setEditingShortcut(key);
    setKeyValue(parsed.key);
    setModifiers({
      shift: parsed.shift || false,
      cmdCtrl: parsed.cmdCtrl || false,
      alt: parsed.alt || false,
    });
    setShortcutError(null);
  };

  const handleSaveShortcut = () => {
    if (!editingShortcut || shortcutError || !keyValue) return;
    const shortcutStr = buildShortcutString(keyValue, modifiers);
    setKeyboardShortcut(editingShortcut, shortcutStr);
    setEditingShortcut(null);
    setKeyValue('');
    setModifiers({ shift: false, cmdCtrl: false, alt: false });
    setShortcutError(null);
  };

  const handleCancelEdit = () => {
    setEditingShortcut(null);
    setKeyValue('');
    setModifiers({ shift: false, cmdCtrl: false, alt: false });
    setShortcutError(null);
  };

  const handleKeyChange = (value: string, currentKey: keyof KeyboardShortcuts) => {
    setKeyValue(value);
    // Check for conflicts with full shortcut string
    if (!value) {
      setShortcutError('Key cannot be empty');
    } else {
      const shortcutStr = buildShortcutString(value, modifiers);
      const conflictLabel = checkConflict(shortcutStr, currentKey);
      if (conflictLabel) {
        setShortcutError(`Already used by "${conflictLabel}"`);
      } else {
        setShortcutError(null);
      }
    }
  };

  const handleModifierChange = (
    modifier: keyof typeof modifiers,
    checked: boolean,
    currentKey: keyof KeyboardShortcuts
  ) => {
    // Enforce single modifier: when checking, uncheck all others (radio-button behavior)
    const newModifiers = checked
      ? { shift: false, cmdCtrl: false, alt: false, [modifier]: true }
      : { ...modifiers, [modifier]: false };

    setModifiers(newModifiers);

    // Recheck for conflicts
    if (keyValue) {
      const shortcutStr = buildShortcutString(keyValue, newModifiers);
      const conflictLabel = checkConflict(shortcutStr, currentKey);
      if (conflictLabel) {
        setShortcutError(`Already used by "${conflictLabel}"`);
      } else {
        setShortcutError(null);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !shortcutError && keyValue) {
      handleSaveShortcut();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleResetShortcut = (key: keyof KeyboardShortcuts) => {
    setKeyboardShortcut(key, DEFAULT_KEYBOARD_SHORTCUTS[key]);
  };

  return (
    <TooltipProvider>
      <div className="space-y-4" data-testid="shortcut-reference-panel">
        {editable && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetKeyboardShortcuts()}
              className="gap-2 text-xs"
              data-testid="reset-all-shortcuts-button"
            >
              <RotateCcw className="w-3 h-3" />
              Reset All to Defaults
            </Button>
          </div>
        )}
        {Object.entries(groupedShortcuts).map(([category, shortcuts]) => {
          const colors = CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS];
          return (
            <div key={category} className="space-y-2">
              <h4 className={cn('text-sm font-semibold', colors.text)}>{colors.label}</h4>
              <div className="grid grid-cols-2 gap-2">
                {shortcuts.map(({ key, label, value }) => {
                  const isModified = mergedShortcuts[key] !== DEFAULT_KEYBOARD_SHORTCUTS[key];
                  const isEditing = editingShortcut === key;

                  return (
                    <div
                      key={key}
                      className={cn(
                        'flex items-center justify-between p-2 rounded-lg bg-sidebar-accent/10 border transition-colors',
                        isEditing ? 'border-brand-500' : 'border-sidebar-border',
                        editable && !isEditing && 'hover:bg-sidebar-accent/20 cursor-pointer'
                      )}
                      onClick={() => editable && !isEditing && handleStartEdit(key)}
                      data-testid={`shortcut-row-${key}`}
                    >
                      <span className="text-sm text-foreground">{label}</span>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <div
                            className="flex items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Modifier checkboxes */}
                            <div className="flex items-center gap-1.5 text-xs">
                              <div className="flex items-center gap-1">
                                <Checkbox
                                  id={`mod-cmd-${key}`}
                                  checked={modifiers.cmdCtrl}
                                  onCheckedChange={(checked) =>
                                    handleModifierChange('cmdCtrl', !!checked, key)
                                  }
                                  className="h-3.5 w-3.5"
                                />
                                <Label
                                  htmlFor={`mod-cmd-${key}`}
                                  className="text-xs text-muted-foreground cursor-pointer"
                                >
                                  {isMac ? '⌘' : 'Ctrl'}
                                </Label>
                              </div>
                              <div className="flex items-center gap-1">
                                <Checkbox
                                  id={`mod-alt-${key}`}
                                  checked={modifiers.alt}
                                  onCheckedChange={(checked) =>
                                    handleModifierChange('alt', !!checked, key)
                                  }
                                  className="h-3.5 w-3.5"
                                />
                                <Label
                                  htmlFor={`mod-alt-${key}`}
                                  className="text-xs text-muted-foreground cursor-pointer"
                                >
                                  {isMac ? '⌥' : 'Alt'}
                                </Label>
                              </div>
                              <div className="flex items-center gap-1">
                                <Checkbox
                                  id={`mod-shift-${key}`}
                                  checked={modifiers.shift}
                                  onCheckedChange={(checked) =>
                                    handleModifierChange('shift', !!checked, key)
                                  }
                                  className="h-3.5 w-3.5"
                                />
                                <Label
                                  htmlFor={`mod-shift-${key}`}
                                  className="text-xs text-muted-foreground cursor-pointer"
                                >
                                  ⇧
                                </Label>
                              </div>
                            </div>
                            <span className="text-muted-foreground">+</span>
                            <Input
                              value={keyValue}
                              onChange={(e) => handleKeyChange(e.target.value, key)}
                              onKeyDown={handleKeyDown}
                              className={cn(
                                'w-12 h-7 text-center font-mono text-xs uppercase',
                                shortcutError && 'border-red-500 focus-visible:ring-red-500'
                              )}
                              placeholder="Key"
                              maxLength={1}
                              autoFocus
                              data-testid={`edit-shortcut-input-${key}`}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 hover:bg-green-500/20 hover:text-green-400"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSaveShortcut();
                              }}
                              disabled={!!shortcutError || !keyValue}
                              data-testid={`save-shortcut-${key}`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 hover:bg-red-500/20 hover:text-red-400"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelEdit();
                              }}
                              data-testid={`cancel-shortcut-${key}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <kbd
                              className={cn(
                                'px-2 py-1 text-xs font-mono rounded border',
                                colors.bg,
                                colors.border,
                                colors.text
                              )}
                            >
                              {formatShortcut(value, true)}
                            </kbd>
                            {isModified && editable && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 hover:bg-yellow-500/20 hover:text-yellow-400"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleResetShortcut(key);
                                    }}
                                    data-testid={`reset-shortcut-${key}`}
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  Reset to default ({DEFAULT_KEYBOARD_SHORTCUTS[key]})
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {isModified && !editable && (
                              <span className="w-2 h-2 rounded-full bg-yellow-500" />
                            )}
                            {editable && !isModified && (
                              <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {editingShortcut &&
                shortcutError &&
                SHORTCUT_CATEGORIES[editingShortcut] === category && (
                  <p className="text-xs text-red-400 mt-1">{shortcutError}</p>
                )}
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
