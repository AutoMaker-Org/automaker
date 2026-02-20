import { useCallback, useRef, useEffect, useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  Copy,
  ClipboardPaste,
  CheckSquare,
  TextSelect,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StickyModifierKeys, type StickyModifier } from './sticky-modifier-keys';

/**
 * ANSI escape sequences for special keys.
 * These are what terminal emulators send when these keys are pressed.
 */
const SPECIAL_KEYS = {
  escape: '\x1b',
  tab: '\t',
  delete: '\x1b[3~',
  home: '\x1b[H',
  end: '\x1b[F',
} as const;

/**
 * Common Ctrl key combinations sent as control codes.
 * Ctrl+<char> sends the char code & 0x1f (e.g., Ctrl+C = 0x03).
 */
const CTRL_KEYS = {
  'Ctrl+C': '\x03', // Interrupt / SIGINT
  'Ctrl+Z': '\x1a', // Suspend / SIGTSTP
  'Ctrl+A': '\x01', // Move to beginning of line
  'Ctrl+B': '\x02', // Move cursor back (tmux prefix)
} as const;

const ARROW_KEYS = {
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
} as const;

interface MobileTerminalShortcutsProps {
  /** Callback to send input data to the terminal WebSocket */
  onSendInput: (data: string) => void;
  /** Whether the terminal is connected and ready */
  isConnected: boolean;
  /** Currently active sticky modifier (Ctrl or Alt) */
  activeModifier: StickyModifier;
  /** Callback when sticky modifier is toggled */
  onModifierChange: (modifier: StickyModifier) => void;
  /** Callback to copy selected text to clipboard */
  onCopy?: () => void;
  /** Callback to paste from clipboard into terminal */
  onPaste?: () => void;
  /** Callback to select all terminal content */
  onSelectAll?: () => void;
  /** Callback to toggle text selection mode (renders selectable text overlay) */
  onToggleSelectMode?: () => void;
  /** Whether text selection mode is currently active */
  isSelectMode?: boolean;
}

/**
 * Mobile shortcuts bar for terminal interaction on touch devices.
 * Provides special keys (Escape, Tab, Ctrl+C, etc.) and arrow keys that are
 * typically unavailable on mobile virtual keyboards.
 *
 * Anchored at the top of the terminal panel, above the terminal content.
 * Can be collapsed to a minimal toggle to maximize terminal space.
 */
export function MobileTerminalShortcuts({
  onSendInput,
  isConnected,
  activeModifier,
  onModifierChange,
  onCopy,
  onPaste,
  onSelectAll,
  onToggleSelectMode,
  isSelectMode,
}: MobileTerminalShortcutsProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Track repeat interval for arrow key long-press
  const repeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const repeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup repeat timers on unmount
  useEffect(() => {
    return () => {
      if (repeatIntervalRef.current) clearInterval(repeatIntervalRef.current);
      if (repeatTimeoutRef.current) clearTimeout(repeatTimeoutRef.current);
    };
  }, []);

  const clearRepeat = useCallback(() => {
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
    if (repeatTimeoutRef.current) {
      clearTimeout(repeatTimeoutRef.current);
      repeatTimeoutRef.current = null;
    }
  }, []);

  /** Sends a key sequence to the terminal. */
  const sendKey = useCallback(
    (data: string) => {
      if (!isConnected) return;
      onSendInput(data);
    },
    [isConnected, onSendInput]
  );

  /** Handles arrow key press with long-press repeat support. */
  const handleArrowPress = useCallback(
    (data: string) => {
      // Cancel any in-flight timeout/interval before starting a new one
      // to prevent timer leaks when multiple touches occur.
      clearRepeat();
      sendKey(data);
      // Start repeat after 400ms hold, then every 80ms
      repeatTimeoutRef.current = setTimeout(() => {
        repeatIntervalRef.current = setInterval(() => {
          sendKey(data);
        }, 80);
      }, 400);
    },
    [clearRepeat, sendKey]
  );

  const handleArrowRelease = useCallback(() => {
    clearRepeat();
  }, [clearRepeat]);

  if (isCollapsed) {
    return (
      <div className="flex items-center justify-center shrink-0 bg-card/95 backdrop-blur-sm border-b border-border">
        <button
          className="flex items-center gap-1 px-4 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
          onClick={() => setIsCollapsed(false)}
          title="Show shortcuts"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          <span>Shortcuts</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 shrink-0 bg-card/95 backdrop-blur-sm border-b border-border overflow-x-auto">
      {/* Collapse button */}
      <button
        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 touch-manipulation"
        onClick={() => setIsCollapsed(true)}
        title="Hide shortcuts"
      >
        <ChevronUp className="h-4 w-4" />
      </button>

      {/* Separator */}
      <div className="w-px h-6 bg-border shrink-0" />

      {/* Sticky modifier keys (Ctrl, Alt) - at the beginning of the bar */}
      <StickyModifierKeys
        activeModifier={activeModifier}
        onModifierChange={onModifierChange}
        isConnected={isConnected}
      />

      {/* Separator */}
      <div className="w-px h-6 bg-border shrink-0" />

      {/* Clipboard actions */}
      {onToggleSelectMode && (
        <IconShortcutButton
          icon={TextSelect}
          title={isSelectMode ? 'Exit select mode' : 'Select text'}
          onPress={onToggleSelectMode}
          disabled={!isConnected}
          active={isSelectMode}
        />
      )}
      {onSelectAll && (
        <IconShortcutButton
          icon={CheckSquare}
          title="Select all"
          onPress={onSelectAll}
          disabled={!isConnected}
        />
      )}
      {onCopy && (
        <IconShortcutButton
          icon={Copy}
          title="Copy selection"
          onPress={onCopy}
          disabled={!isConnected}
        />
      )}
      {onPaste && (
        <IconShortcutButton
          icon={ClipboardPaste}
          title="Paste from clipboard"
          onPress={onPaste}
          disabled={!isConnected}
        />
      )}

      {/* Separator */}
      <div className="w-px h-6 bg-border shrink-0" />

      {/* Special keys */}
      <ShortcutButton
        label="Esc"
        onPress={() => sendKey(SPECIAL_KEYS.escape)}
        disabled={!isConnected}
      />
      <ShortcutButton
        label="Tab"
        onPress={() => sendKey(SPECIAL_KEYS.tab)}
        disabled={!isConnected}
      />

      {/* Separator */}
      <div className="w-px h-6 bg-border shrink-0" />

      {/* Common Ctrl shortcuts */}
      <ShortcutButton
        label="^C"
        title="Ctrl+C (Interrupt)"
        onPress={() => sendKey(CTRL_KEYS['Ctrl+C'])}
        disabled={!isConnected}
      />
      <ShortcutButton
        label="^Z"
        title="Ctrl+Z (Suspend)"
        onPress={() => sendKey(CTRL_KEYS['Ctrl+Z'])}
        disabled={!isConnected}
      />
      <ShortcutButton
        label="^B"
        title="Ctrl+B (Back/tmux prefix)"
        onPress={() => sendKey(CTRL_KEYS['Ctrl+B'])}
        disabled={!isConnected}
      />

      {/* Separator */}
      <div className="w-px h-6 bg-border shrink-0" />

      {/* Arrow keys with long-press repeat */}
      <ArrowButton
        direction="left"
        onPress={() => handleArrowPress(ARROW_KEYS.left)}
        onRelease={handleArrowRelease}
        disabled={!isConnected}
      />
      <ArrowButton
        direction="down"
        onPress={() => handleArrowPress(ARROW_KEYS.down)}
        onRelease={handleArrowRelease}
        disabled={!isConnected}
      />
      <ArrowButton
        direction="up"
        onPress={() => handleArrowPress(ARROW_KEYS.up)}
        onRelease={handleArrowRelease}
        disabled={!isConnected}
      />
      <ArrowButton
        direction="right"
        onPress={() => handleArrowPress(ARROW_KEYS.right)}
        onRelease={handleArrowRelease}
        disabled={!isConnected}
      />

      {/* Separator */}
      <div className="w-px h-6 bg-border shrink-0" />

      {/* Navigation keys */}
      <ShortcutButton
        label="Del"
        onPress={() => sendKey(SPECIAL_KEYS.delete)}
        disabled={!isConnected}
      />
      <ShortcutButton
        label="Home"
        onPress={() => sendKey(SPECIAL_KEYS.home)}
        disabled={!isConnected}
      />
      <ShortcutButton
        label="End"
        onPress={() => sendKey(SPECIAL_KEYS.end)}
        disabled={!isConnected}
      />
    </div>
  );
}

/**
 * Individual shortcut button for special keys.
 */
function ShortcutButton({
  label,
  title,
  onPress,
  disabled = false,
}: {
  label: string;
  title?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={cn(
        'px-3 py-2 rounded-md text-xs font-medium shrink-0 select-none transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center',
        'active:scale-95 touch-manipulation',
        'bg-muted/80 text-foreground hover:bg-accent',
        disabled && 'opacity-40 pointer-events-none'
      )}
      onPointerDown={(e) => {
        e.preventDefault(); // Prevent focus stealing from terminal
        onPress();
      }}
      title={title}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

/**
 * Arrow key button with long-press repeat support.
 * Uses pointer events for reliable touch + mouse handling.
 */
function ArrowButton({
  direction,
  onPress,
  onRelease,
  disabled = false,
}: {
  direction: 'up' | 'down' | 'left' | 'right';
  onPress: () => void;
  onRelease: () => void;
  disabled?: boolean;
}) {
  const icons = {
    up: ArrowUp,
    down: ArrowDown,
    left: ArrowLeft,
    right: ArrowRight,
  };
  const Icon = icons[direction];

  return (
    <button
      className={cn(
        'p-2 rounded-md shrink-0 select-none transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center',
        'active:scale-95 touch-manipulation',
        'bg-muted/80 text-foreground hover:bg-accent',
        disabled && 'opacity-40 pointer-events-none'
      )}
      onPointerDown={(e) => {
        e.preventDefault(); // Prevent focus stealing from terminal
        onPress();
      }}
      onPointerUp={onRelease}
      onPointerLeave={onRelease}
      onPointerCancel={onRelease}
      disabled={disabled}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/**
 * Icon-based shortcut button for clipboard actions.
 * Uses a Lucide icon instead of text label for a cleaner mobile UI.
 */
function IconShortcutButton({
  icon: Icon,
  title,
  onPress,
  disabled = false,
  active = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      className={cn(
        'p-2 rounded-md shrink-0 select-none transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center',
        'active:scale-95 touch-manipulation',
        active
          ? 'bg-brand-500/20 text-brand-500 ring-1 ring-brand-500/40'
          : 'bg-muted/80 text-foreground hover:bg-accent',
        disabled && 'opacity-40 pointer-events-none'
      )}
      onPointerDown={(e) => {
        e.preventDefault(); // Prevent focus stealing from terminal
        onPress();
      }}
      title={title}
      disabled={disabled}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
