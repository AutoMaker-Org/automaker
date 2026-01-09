import { useEffect, useCallback, useMemo } from 'react';
import { useAppStore, parseShortcut, DEFAULT_KEYBOARD_SHORTCUTS } from '@/store/app-store';

export interface KeyboardShortcut {
  key: string; // Can be simple "K" or with modifiers "Shift+N", "Cmd+K"
  action: () => void;
  description?: string;
}

/**
 * Check if the currently focused element is an input, textarea, or contenteditable element
 * or if an autocomplete/typeahead dropdown is open
 */
function isInputFocused(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;

  // Check if it's a form input element
  const tagName = activeElement.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  // Check if it's a contenteditable element
  if (activeElement.getAttribute('contenteditable') === 'true') {
    return true;
  }

  // Check if it has a role of textbox or searchbox
  const role = activeElement.getAttribute('role');
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
    return true;
  }

  // Check if focus is inside an xterm terminal (they use a hidden textarea)
  const xtermContainer = activeElement.closest('.xterm');
  if (xtermContainer) {
    return true;
  }

  // Also check if any parent has data-terminal-container attribute
  const terminalContainer = activeElement.closest('[data-terminal-container]');
  if (terminalContainer) {
    return true;
  }

  // Check for autocomplete/typeahead dropdowns being open
  const autocompleteList = document.querySelector('[data-testid="category-autocomplete-list"]');
  if (autocompleteList) {
    return true;
  }

  // Check for any open dialogs
  const dialog = document.querySelector('[role="dialog"][data-state="open"]');
  if (dialog) {
    return true;
  }

  // Check for project picker dropdown being open
  const projectPickerDropdown = document.querySelector('[data-testid="project-picker-dropdown"]');
  if (projectPickerDropdown) {
    return true;
  }

  // Check for any open dropdown menus (Radix UI uses role="menu")
  // This prevents shortcuts from firing when user is typing in dropdown filters
  const dropdownMenu = document.querySelector('[role="menu"]');
  if (dropdownMenu) {
    return true;
  }

  return false;
}

/**
 * Convert a key character to its corresponding event.code
 * This is used for keyboard-layout independent matching in terminals
 */
function keyToCode(key: string): string {
  const upperKey = key.toUpperCase();

  // Letters A-Z map to KeyA-KeyZ
  if (/^[A-Z]$/.test(upperKey)) {
    return `Key${upperKey}`;
  }

  // Numbers 0-9 on main row map to Digit0-Digit9
  if (/^[0-9]$/.test(key)) {
    return `Digit${key}`;
  }

  // Special key mappings
  const specialMappings: Record<string, string> = {
    '`': 'Backquote',
    '~': 'Backquote',
    '-': 'Minus',
    _: 'Minus',
    '=': 'Equal',
    '+': 'Equal',
    '[': 'BracketLeft',
    '{': 'BracketLeft',
    ']': 'BracketRight',
    '}': 'BracketRight',
    '\\': 'Backslash',
    '|': 'Backslash',
    ';': 'Semicolon',
    ':': 'Semicolon',
    "'": 'Quote',
    '"': 'Quote',
    ',': 'Comma',
    '<': 'Comma',
    '.': 'Period',
    '>': 'Period',
    '/': 'Slash',
    '?': 'Slash',
    ' ': 'Space',
    Enter: 'Enter',
    Tab: 'Tab',
    Escape: 'Escape',
    Backspace: 'Backspace',
    Delete: 'Delete',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
  };

  return specialMappings[key] || specialMappings[upperKey] || key;
}

/**
 * Check if a keyboard event matches a shortcut definition using event.code
 * This is keyboard-layout independent - useful for terminals where Alt+key
 * combinations can produce special characters with event.key
 */
export function matchesShortcutWithCode(event: KeyboardEvent, shortcutStr: string): boolean {
  const shortcut = parseShortcut(shortcutStr);
  if (!shortcut.key) return false;

  // Convert the shortcut key to event.code format
  const expectedCode = keyToCode(shortcut.key);

  // Check if the code matches
  if (event.code !== expectedCode) {
    return false;
  }

  // Check modifier keys
  const cmdCtrlPressed = event.metaKey || event.ctrlKey;
  const shiftPressed = event.shiftKey;
  const altPressed = event.altKey;

  // If shortcut requires cmdCtrl, it must be pressed
  if (shortcut.cmdCtrl && !cmdCtrlPressed) return false;
  // If shortcut doesn't require cmdCtrl, it shouldn't be pressed
  if (!shortcut.cmdCtrl && cmdCtrlPressed) return false;

  // If shortcut requires shift, it must be pressed
  if (shortcut.shift && !shiftPressed) return false;
  // If shortcut doesn't require shift, it shouldn't be pressed
  if (!shortcut.shift && shiftPressed) return false;

  // If shortcut requires alt, it must be pressed
  if (shortcut.alt && !altPressed) return false;
  // If shortcut doesn't require alt, it shouldn't be pressed
  if (!shortcut.alt && altPressed) return false;

  return true;
}

/**
 * Check if a keyboard event matches a shortcut definition
 */
function matchesShortcut(event: KeyboardEvent, shortcutStr: string): boolean {
  const shortcut = parseShortcut(shortcutStr);

  // Check if the key matches (case-insensitive)
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) {
    return false;
  }

  // Check modifier keys
  const cmdCtrlPressed = event.metaKey || event.ctrlKey;
  const shiftPressed = event.shiftKey;
  const altPressed = event.altKey;

  // If shortcut requires cmdCtrl, it must be pressed
  if (shortcut.cmdCtrl && !cmdCtrlPressed) return false;
  // If shortcut doesn't require cmdCtrl, it shouldn't be pressed
  if (!shortcut.cmdCtrl && cmdCtrlPressed) return false;

  // If shortcut requires shift, it must be pressed
  if (shortcut.shift && !shiftPressed) return false;
  // If shortcut doesn't require shift, it shouldn't be pressed
  if (!shortcut.shift && shiftPressed) return false;

  // If shortcut requires alt, it must be pressed
  if (shortcut.alt && !altPressed) return false;
  // If shortcut doesn't require alt, it shouldn't be pressed
  if (!shortcut.alt && altPressed) return false;

  return true;
}

/**
 * Hook to manage keyboard shortcuts
 * Shortcuts won't fire when user is typing in inputs, textareas, or when dialogs are open
 * Supports modifier keys: Shift, Cmd/Ctrl, Alt/Option
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (isInputFocused()) {
        return;
      }

      // Find matching shortcut
      const matchingShortcut = shortcuts.find((shortcut) => matchesShortcut(event, shortcut.key));

      if (matchingShortcut) {
        event.preventDefault();
        matchingShortcut.action();
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}

/**
 * Hook to get current keyboard shortcuts from store
 * This replaces the static constants and allows customization
 * Merges with defaults to ensure new shortcuts are always available
 */
export function useKeyboardShortcutsConfig() {
  const keyboardShortcuts = useAppStore((state) => state.keyboardShortcuts);

  // Merge with defaults to ensure new shortcuts are available
  // even if user's persisted state predates them
  return useMemo(
    () => ({
      ...DEFAULT_KEYBOARD_SHORTCUTS,
      ...keyboardShortcuts,
    }),
    [keyboardShortcuts]
  );
}
