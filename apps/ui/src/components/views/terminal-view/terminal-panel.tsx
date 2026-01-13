import { useEffect, useRef, useCallback, useState } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  X,
  SplitSquareHorizontal,
  SplitSquareVertical,
  GripHorizontal,
  Terminal,
  ZoomIn,
  ZoomOut,
  Copy,
  ClipboardPaste,
  CheckSquare,
  Trash2,
  ImageIcon,
  Loader2,
  Settings,
  RotateCcw,
  Search,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  ArrowDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useAppStore, DEFAULT_KEYBOARD_SHORTCUTS, type KeyboardShortcuts } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { matchesShortcutWithCode } from '@/hooks/use-keyboard-shortcuts';
import {
  getTerminalTheme,
  TERMINAL_FONT_OPTIONS,
  DEFAULT_TERMINAL_FONT,
} from '@/config/terminal-themes';
import { toast } from 'sonner';
import { getElectronAPI } from '@/lib/electron';
import { getApiKey, getSessionToken, getServerUrlSync } from '@/lib/http-api-client';

const logger = createLogger('Terminal');
const NO_STORE_CACHE_MODE: RequestCache = 'no-store';

// Font size constraints
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
const DEFAULT_FONT_SIZE = 14;

// Resize constraints
const RESIZE_DEBOUNCE_MS = 100; // Short debounce for responsive feel

// Image drag-drop constants
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

// Large paste handling constants
const LARGE_PASTE_WARNING_THRESHOLD = 1024 * 1024; // 1MB - show warning for pastes this size or larger
const PASTE_CHUNK_SIZE = 8 * 1024; // 8KB chunks for large pastes
const PASTE_CHUNK_DELAY_MS = 10; // Small delay between chunks to prevent overwhelming WebSocket

interface TerminalPanelProps {
  sessionId: string;
  authToken: string | null;
  isActive: boolean;
  onFocus: () => void;
  onClose: () => void;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onNewTab?: () => void;
  onNavigateUp?: () => void; // Navigate to terminal pane above
  onNavigateDown?: () => void; // Navigate to terminal pane below
  onNavigateLeft?: () => void; // Navigate to terminal pane on the left
  onNavigateRight?: () => void; // Navigate to terminal pane on the right
  onSessionInvalid?: () => void; // Called when session is no longer valid on server (e.g., server restarted)
  isDragging?: boolean;
  isDropTarget?: boolean;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  runCommandOnConnect?: string; // Command to run when terminal first connects (for new terminals)
  onCommandRan?: () => void; // Callback when the initial command has been sent
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

// Type for xterm Terminal - we'll use any since we're dynamically importing
type XTerminal = InstanceType<typeof import('@xterm/xterm').Terminal>;
type XFitAddon = InstanceType<typeof import('@xterm/addon-fit').FitAddon>;
type XSearchAddon = InstanceType<typeof import('@xterm/addon-search').SearchAddon>;
type XWebLinksAddon = InstanceType<typeof import('@xterm/addon-web-links').WebLinksAddon>;

export function TerminalPanel({
  sessionId,
  authToken,
  isActive,
  onFocus,
  onClose,
  onSplitHorizontal,
  onSplitVertical,
  onNewTab,
  onNavigateUp,
  onNavigateDown,
  onNavigateLeft,
  onNavigateRight,
  onSessionInvalid,
  isDragging = false,
  isDropTarget = false,
  fontSize,
  onFontSizeChange,
  runCommandOnConnect,
  onCommandRan,
  isMaximized = false,
  onToggleMaximize,
}: TerminalPanelProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<XFitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastShortcutTimeRef = useRef<number>(0);
  const resizeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const focusHandlerRef = useRef<{ dispose: () => void } | null>(null);
  const linkProviderRef = useRef<{ dispose: () => void } | null>(null);
  const [isTerminalReady, setIsTerminalReady] = useState(false);
  const [shellName, setShellName] = useState('shell');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isMac, setIsMac] = useState(false);
  const isMacRef = useRef(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [focusedMenuIndex, setFocusedMenuIndex] = useState(0);
  const focusedMenuIndexRef = useRef(0);
  const [isImageDragOver, setIsImageDragOver] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const hasRunInitialCommandRef = useRef(false);
  const searchAddonRef = useRef<XSearchAddon | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const showSearchRef = useRef(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'auth_failed'
  >('connecting');
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const INITIAL_RECONNECT_DELAY = 1000;
  const [processExitCode, setProcessExitCode] = useState<number | null>(null);

  // Get current project for image saving
  const currentProject = useAppStore((state) => state.currentProject);

  // Get terminal settings from store - grouped with shallow comparison to reduce re-renders
  const { defaultRunScript, screenReaderMode, fontFamily, scrollbackLines, lineHeight } =
    useAppStore(
      useShallow((state) => ({
        defaultRunScript: state.terminalState.defaultRunScript,
        screenReaderMode: state.terminalState.screenReaderMode,
        fontFamily: state.terminalState.fontFamily,
        scrollbackLines: state.terminalState.scrollbackLines,
        lineHeight: state.terminalState.lineHeight,
      }))
    );

  // Action setters are stable references, can use individual selectors
  const setTerminalDefaultRunScript = useAppStore((state) => state.setTerminalDefaultRunScript);
  const setTerminalScreenReaderMode = useAppStore((state) => state.setTerminalScreenReaderMode);
  const setTerminalFontFamily = useAppStore((state) => state.setTerminalFontFamily);
  const setTerminalScrollbackLines = useAppStore((state) => state.setTerminalScrollbackLines);
  const setTerminalLineHeight = useAppStore((state) => state.setTerminalLineHeight);

  // Detect platform on mount
  useEffect(() => {
    // Use modern userAgentData API with fallback to navigator.platform
    const nav = navigator as Navigator & { userAgentData?: { platform: string } };
    let detected = false;
    if (nav.userAgentData?.platform) {
      detected = nav.userAgentData.platform.toLowerCase().includes('mac');
    } else if (typeof navigator !== 'undefined') {
      // Fallback for browsers without userAgentData (intentionally using deprecated API)
      detected = /mac/i.test(navigator.platform);
    }
    setIsMac(detected);
    isMacRef.current = detected;
  }, []);

  // Get effective theme from store
  const getEffectiveTheme = useAppStore((state) => state.getEffectiveTheme);
  const effectiveTheme = getEffectiveTheme();

  // Get keyboard shortcuts from store - merged with defaults
  const keyboardShortcuts = useAppStore((state) => state.keyboardShortcuts);
  const mergedShortcuts: KeyboardShortcuts = {
    ...DEFAULT_KEYBOARD_SHORTCUTS,
    ...keyboardShortcuts,
  };
  const shortcutsRef = useRef(mergedShortcuts);
  shortcutsRef.current = mergedShortcuts;

  // Track system dark mode preference for "system" theme
  const [systemIsDark, setSystemIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Resolve "system" theme to actual light/dark
  const resolvedTheme =
    effectiveTheme === 'system' ? (systemIsDark ? 'dark' : 'light') : effectiveTheme;

  // Use refs for callbacks and values to avoid effect re-runs
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSplitHorizontalRef = useRef(onSplitHorizontal);
  onSplitHorizontalRef.current = onSplitHorizontal;
  const onSplitVerticalRef = useRef(onSplitVertical);
  onSplitVerticalRef.current = onSplitVertical;
  const onNewTabRef = useRef(onNewTab);
  onNewTabRef.current = onNewTab;
  const onNavigateUpRef = useRef(onNavigateUp);
  onNavigateUpRef.current = onNavigateUp;
  const onNavigateDownRef = useRef(onNavigateDown);
  onNavigateDownRef.current = onNavigateDown;
  const onNavigateLeftRef = useRef(onNavigateLeft);
  onNavigateLeftRef.current = onNavigateLeft;
  const onNavigateRightRef = useRef(onNavigateRight);
  onNavigateRightRef.current = onNavigateRight;
  const onSessionInvalidRef = useRef(onSessionInvalid);
  onSessionInvalidRef.current = onSessionInvalid;
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;
  const themeRef = useRef(resolvedTheme);
  themeRef.current = resolvedTheme;
  const copySelectionRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const pasteFromClipboardRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Zoom functions - use the prop callback
  const zoomIn = useCallback(() => {
    onFontSizeChange(Math.min(fontSize + 1, MAX_FONT_SIZE));
  }, [fontSize, onFontSizeChange]);

  const zoomOut = useCallback(() => {
    onFontSizeChange(Math.max(fontSize - 1, MIN_FONT_SIZE));
  }, [fontSize, onFontSizeChange]);

  const resetZoom = useCallback(() => {
    onFontSizeChange(DEFAULT_FONT_SIZE);
  }, [onFontSizeChange]);

  // Strip ANSI escape codes from text
  const stripAnsi = (text: string): string => {
    // Match ANSI escape sequences:
    // - CSI sequences: \x1b[...letter
    // - OSC sequences: \x1b]...ST
    // - Other escape sequences: \x1b followed by various characters
    // eslint-disable-next-line no-control-regex
    return text.replace(
      /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][AB012]|\x1b[>=<]|\x1b[78HM]|\x1b#[0-9]|\x1b./g,
      ''
    );
  };

  // Copy selected text to clipboard
  const copySelection = useCallback(async (): Promise<boolean> => {
    const terminal = xtermRef.current;
    if (!terminal) return false;

    const selection = terminal.getSelection();
    if (!selection) {
      toast.error('Nothing to copy', {
        description: 'Select some text first',
      });
      return false;
    }

    try {
      // Strip any ANSI escape codes that might be in the selection
      const cleanText = stripAnsi(selection);
      await navigator.clipboard.writeText(cleanText);
      toast.success('Copied to clipboard');
      return true;
    } catch (err) {
      logger.error('Copy failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Copy failed', {
        description: errorMessage.includes('permission')
          ? 'Clipboard permission denied'
          : 'Could not access clipboard',
      });
      return false;
    }
  }, []);
  copySelectionRef.current = copySelection;

  // Helper function to send text in chunks with delay
  const sendTextInChunks = useCallback(async (text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // For small pastes, send all at once
    if (text.length <= PASTE_CHUNK_SIZE) {
      ws.send(JSON.stringify({ type: 'input', data: text }));
      return;
    }

    // For large pastes, chunk it
    for (let i = 0; i < text.length; i += PASTE_CHUNK_SIZE) {
      if (ws.readyState !== WebSocket.OPEN) break;
      const chunk = text.slice(i, i + PASTE_CHUNK_SIZE);
      ws.send(JSON.stringify({ type: 'input', data: chunk }));
      // Small delay between chunks to prevent overwhelming the WebSocket
      if (i + PASTE_CHUNK_SIZE < text.length) {
        await new Promise((resolve) => setTimeout(resolve, PASTE_CHUNK_DELAY_MS));
      }
    }
  }, []);

  // Paste from clipboard
  const pasteFromClipboard = useCallback(async () => {
    const terminal = xtermRef.current;
    if (!terminal || !wsRef.current) return;

    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast.error('Nothing to paste', {
          description: 'Clipboard is empty',
        });
        return;
      }

      if (wsRef.current.readyState !== WebSocket.OPEN) {
        toast.error('Terminal not connected');
        return;
      }

      // Warn for large pastes
      if (text.length >= LARGE_PASTE_WARNING_THRESHOLD) {
        const sizeMB = (text.length / (1024 * 1024)).toFixed(1);
        toast.warning(`Large paste (${sizeMB}MB)`, {
          description: 'Sending in chunks, this may take a moment...',
          duration: 3000,
        });
      }

      await sendTextInChunks(text);
    } catch (err) {
      logger.error('Paste failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Paste failed', {
        description: errorMessage.includes('permission')
          ? 'Clipboard permission denied'
          : 'Could not read from clipboard',
      });
    }
  }, [sendTextInChunks]);
  pasteFromClipboardRef.current = pasteFromClipboard;

  // Select all terminal content
  const selectAll = useCallback(() => {
    xtermRef.current?.selectAll();
  }, []);

  // Clear terminal
  const clearTerminal = useCallback(() => {
    xtermRef.current?.clear();
  }, []);

  // Get theme colors for search highlighting
  const terminalTheme = getTerminalTheme(effectiveTheme);
  const searchOptions = {
    caseSensitive: false,
    regex: false,
    decorations: {
      matchBackground: terminalTheme.searchMatchBackground,
      matchBorder: terminalTheme.searchMatchBorder,
      matchOverviewRuler: terminalTheme.searchMatchBorder,
      activeMatchBackground: terminalTheme.searchActiveMatchBackground,
      activeMatchBorder: terminalTheme.searchActiveMatchBorder,
      activeMatchColorOverviewRuler: terminalTheme.searchActiveMatchBorder,
    },
  };

  // Search functions
  const searchNext = useCallback(() => {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findNext(searchQuery, searchOptions);
    }
  }, [searchQuery, searchOptions]);

  const searchPrevious = useCallback(() => {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findPrevious(searchQuery, searchOptions);
    }
  }, [searchQuery, searchOptions]);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    showSearchRef.current = false;
    setSearchQuery('');
    searchAddonRef.current?.clearDecorations();
    xtermRef.current?.focus();
  }, []);

  // Handle pane navigation keyboard shortcuts at container level (capture phase)
  // This ensures we intercept before xterm can process the event
  const handleContainerKeyDownCapture = useCallback(
    (event: React.KeyboardEvent) => {
      // Ctrl+Alt+Arrow / Cmd+Alt+Arrow - Navigate between panes directionally
      if ((event.ctrlKey || event.metaKey) && event.altKey && !event.shiftKey) {
        const code = event.nativeEvent.code;
        if (code === 'ArrowRight') {
          event.preventDefault();
          event.stopPropagation();
          onNavigateRight?.();
        } else if (code === 'ArrowLeft') {
          event.preventDefault();
          event.stopPropagation();
          onNavigateLeft?.();
        } else if (code === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          onNavigateDown?.();
        } else if (code === 'ArrowUp') {
          event.preventDefault();
          event.stopPropagation();
          onNavigateUp?.();
        }
      }
    },
    [onNavigateUp, onNavigateDown, onNavigateLeft, onNavigateRight]
  );

  // Scroll to bottom of terminal
  const scrollToBottom = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.scrollToBottom();
      setIsAtBottom(true);
    }
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handle context menu action
  const handleContextMenuAction = useCallback(
    async (action: 'copy' | 'paste' | 'selectAll' | 'clear') => {
      closeContextMenu();
      switch (action) {
        case 'copy':
          await copySelection();
          break;
        case 'paste':
          await pasteFromClipboard();
          break;
        case 'selectAll':
          selectAll();
          break;
        case 'clear':
          clearTerminal();
          break;
      }
      xtermRef.current?.focus();
    },
    [closeContextMenu, copySelection, pasteFromClipboard, selectAll, clearTerminal]
  );

  const serverUrl = import.meta.env.VITE_SERVER_URL || getServerUrlSync();
  const wsUrl = serverUrl.replace(/^http/, 'ws');

  // Fetch a short-lived WebSocket token for secure authentication
  const fetchWsToken = useCallback(async (): Promise<string | null> => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      const sessionToken = getSessionToken();
      if (sessionToken) {
        headers['X-Session-Token'] = sessionToken;
      }

      const response = await fetch(`${serverUrl}/api/auth/token`, {
        headers,
        credentials: 'include',
        cache: NO_STORE_CACHE_MODE,
      });

      if (!response.ok) {
        logger.warn('Failed to fetch wsToken:', response.status);
        return null;
      }

      const data = await response.json();
      if (data.success && data.token) {
        return data.token;
      }

      return null;
    } catch (error) {
      logger.error('Error fetching wsToken:', error);
      return null;
    }
  }, [serverUrl]);

  // Draggable - only the drag handle triggers drag
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
  } = useDraggable({
    id: sessionId,
  });

  // Droppable - the entire panel is a drop target
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: sessionId,
  });

  // Initialize terminal - dynamically import xterm to avoid SSR issues
  useEffect(() => {
    if (!terminalRef.current) return;

    let mounted = true;

    const initTerminal = async () => {
      // Dynamically import xterm modules
      const [{ Terminal }, { FitAddon }, { WebglAddon }, { SearchAddon }, { WebLinksAddon }] =
        await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
          import('@xterm/addon-webgl'),
          import('@xterm/addon-search'),
          import('@xterm/addon-web-links'),
        ]);

      // Also import CSS
      await import('@xterm/xterm/css/xterm.css');

      if (!mounted || !terminalRef.current) return;

      // Get terminal theme matching the app theme
      const terminalTheme = getTerminalTheme(themeRef.current);

      // Get settings from store (read at initialization time)
      const terminalSettings = useAppStore.getState().terminalState;
      const screenReaderEnabled = terminalSettings.screenReaderMode;
      const terminalFontFamily = terminalSettings.fontFamily || DEFAULT_TERMINAL_FONT;
      const terminalScrollback = terminalSettings.scrollbackLines || 5000;
      const terminalLineHeight = terminalSettings.lineHeight || 1.0;

      // Create terminal instance with the current global font size and theme
      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: fontSizeRef.current,
        fontFamily: terminalFontFamily,
        lineHeight: terminalLineHeight,
        letterSpacing: 0,
        theme: terminalTheme,
        allowProposedApi: true,
        screenReaderMode: screenReaderEnabled,
        scrollback: terminalScrollback,
      });

      // Create fit addon
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      // Create search addon
      const searchAddon = new SearchAddon();
      terminal.loadAddon(searchAddon);
      searchAddonRef.current = searchAddon;

      // Create web links addon for clickable URLs with custom handler for Electron
      const webLinksAddon = new WebLinksAddon((_event: MouseEvent, uri: string) => {
        // Use Electron API to open external links in system browser
        const api = getElectronAPI();
        if (api?.openExternalLink) {
          api.openExternalLink(uri).catch((error) => {
            logger.error('Failed to open URL:', error);
            // Fallback to window.open if Electron API fails
            window.open(uri, '_blank', 'noopener,noreferrer');
          });
        } else {
          // Web fallback
          window.open(uri, '_blank', 'noopener,noreferrer');
        }
      });
      terminal.loadAddon(webLinksAddon);

      // Open terminal
      terminal.open(terminalRef.current);

      // Register custom link provider for file paths
      // Detects patterns like /path/to/file.ts:123:45 or ./src/file.js:10
      const filePathLinkProvider = {
        provideLinks: (
          lineNumber: number,
          callback: (
            links:
              | {
                  range: { start: { x: number; y: number }; end: { x: number; y: number } };
                  text: string;
                  activate: (event: MouseEvent, text: string) => void;
                }[]
              | undefined
          ) => void
        ) => {
          const line = terminal.buffer.active.getLine(lineNumber - 1);
          if (!line) {
            callback(undefined);
            return;
          }

          const lineText = line.translateToString(true);
          const links: {
            range: { start: { x: number; y: number }; end: { x: number; y: number } };
            text: string;
            activate: (event: MouseEvent, text: string) => void;
          }[] = [];

          // File path patterns:
          // 1. Absolute Unix: /path/to/file.ext:line:col or /path/to/file.ext:line
          // 2. Home directory: ~/path/to/file.ext:line:col
          // 3. Absolute Windows: C:\path\to\file.ext:line:col (less common in terminal output)
          // 4. Relative: ./path/file.ext:line or src/file.ext:line
          // Common formats from compilers/linters:
          // - ESLint: /path/file.ts:10:5
          // - TypeScript: src/file.ts(10,5)
          // - Go: /path/file.go:10:5
          const filePathRegex =
            /(?:^|[\s'"(])(((?:\/|\.\/|\.\.\/|~\/)[^\s:'"()]+|[a-zA-Z]:\\[^\s:'"()]+|[a-zA-Z0-9_-]+\/[^\s:'"()]+)(?:[:(\s](\d+)(?:[:,)](\d+))?)?)/g;

          let match;
          while ((match = filePathRegex.exec(lineText)) !== null) {
            const fullMatch = match[1];
            const filePath = match[2];
            const lineNum = match[3] ? parseInt(match[3], 10) : undefined;
            const colNum = match[4] ? parseInt(match[4], 10) : undefined;

            // Skip common false positives (URLs, etc.)
            if (
              filePath.startsWith('http://') ||
              filePath.startsWith('https://') ||
              filePath.startsWith('ws://')
            ) {
              continue;
            }

            // Calculate the start position (1-indexed for xterm)
            const startX = match.index + (match[0].length - match[1].length) + 1;
            const endX = startX + fullMatch.length;

            links.push({
              range: {
                start: { x: startX, y: lineNumber },
                end: { x: endX, y: lineNumber },
              },
              text: fullMatch,
              activate: async (event: MouseEvent, text: string) => {
                // Parse the path and line/column from the matched text
                const pathMatch = text.match(/^([^\s:()]+)(?:[:(\s](\d+)(?:[:,)](\d+))?)?/);
                if (!pathMatch) return;

                const clickedPath = pathMatch[1];
                const clickedLine = pathMatch[2] ? parseInt(pathMatch[2], 10) : undefined;
                const clickedCol = pathMatch[3] ? parseInt(pathMatch[3], 10) : undefined;

                // Resolve paths to absolute paths
                let absolutePath = clickedPath;
                const api = getElectronAPI();

                if (clickedPath.startsWith('~/')) {
                  // Home directory path - expand ~ to user's home directory
                  try {
                    const homePath = await api.getPath?.('home');
                    if (homePath) {
                      absolutePath = homePath + clickedPath.slice(1); // Replace ~ with home path
                    }
                  } catch {
                    // If we can't get home path, just use the path as-is
                    logger.warn('Could not resolve home directory path');
                  }
                } else if (!clickedPath.startsWith('/') && !clickedPath.match(/^[a-zA-Z]:\\/)) {
                  // Relative path - resolve against project path
                  const projectPath = useAppStore.getState().currentProject?.path;
                  if (projectPath) {
                    absolutePath = `${projectPath}/${clickedPath}`.replace(/\/+/g, '/');
                  } else {
                    toast.warning('Cannot open relative path', {
                      description:
                        'No project selected. Open a project to click relative file paths.',
                    });
                    return;
                  }
                }

                // Open in editor using VS Code URL scheme
                // Works in both web (via anchor click) and Electron (via shell.openExternal)
                try {
                  const result = await api.openInEditor?.(absolutePath, clickedLine, clickedCol);
                  if (result && !result.success) {
                    toast.error('Failed to open in editor', { description: result.error });
                  }
                } catch (error) {
                  logger.error('Failed to open file:', error);
                  toast.error('Failed to open file', {
                    description: error instanceof Error ? error.message : 'Unknown error',
                  });
                }
              },
            });
          }

          callback(links.length > 0 ? links : undefined);
        },
      };

      linkProviderRef.current = terminal.registerLinkProvider(filePathLinkProvider);

      // Try to load WebGL addon for better performance
      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          webglAddon.dispose();
        });
        terminal.loadAddon(webglAddon);
      } catch {
        logger.warn('WebGL addon not available, falling back to canvas');
      }

      // Fit terminal to container - wait for stable dimensions
      // Use initial delay then multiple RAFs to let react-resizable-panels finish layout
      let fitAttempts = 0;
      const MAX_FIT_ATTEMPTS = 10;
      let lastWidth = 0;
      let lastHeight = 0;

      const attemptFit = () => {
        if (!fitAddon || !terminalRef.current || fitAttempts >= MAX_FIT_ATTEMPTS) return;

        const rect = terminalRef.current.getBoundingClientRect();
        fitAttempts++;

        // Check if dimensions are stable (same as last attempt) and valid
        if (
          rect.width === lastWidth &&
          rect.height === lastHeight &&
          rect.width > 0 &&
          rect.height > 0
        ) {
          try {
            fitAddon.fit();
          } catch (err) {
            logger.error('Initial fit error:', err);
          }
          return;
        }

        // Dimensions still changing or too small, try again
        lastWidth = rect.width;
        lastHeight = rect.height;
        requestAnimationFrame(attemptFit);
      };

      // Initial delay allows complex layouts to settle before attempting fit
      setTimeout(() => requestAnimationFrame(attemptFit), 50);

      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;
      setIsTerminalReady(true);

      // Handle focus - use ref to avoid re-running effect
      // Store disposer to prevent memory leak
      focusHandlerRef.current = terminal.onData(() => {
        onFocusRef.current();
      });

      // Custom key handler to intercept terminal shortcuts
      // Return false to prevent xterm from handling the key
      const SHORTCUT_COOLDOWN_MS = 300; // Prevent rapid firing

      terminal.attachCustomKeyEventHandler((event) => {
        // Only intercept keydown events
        if (event.type !== 'keydown') return true;

        // Use event.code for keyboard-layout-independent key detection
        const code = event.code;

        // Ctrl+Alt+Arrow / Cmd+Alt+Arrow - Navigate between panes directionally
        // Handle this FIRST before any other checks to prevent xterm from capturing it
        // Use explicit check for both Ctrl and Meta to work on all platforms
        if ((event.ctrlKey || event.metaKey) && event.altKey && !event.shiftKey) {
          if (code === 'ArrowRight') {
            event.preventDefault();
            event.stopPropagation();
            onNavigateRightRef.current?.();
            return false;
          } else if (code === 'ArrowLeft') {
            event.preventDefault();
            event.stopPropagation();
            onNavigateLeftRef.current?.();
            return false;
          } else if (code === 'ArrowDown') {
            event.preventDefault();
            event.stopPropagation();
            onNavigateDownRef.current?.();
            return false;
          } else if (code === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            onNavigateUpRef.current?.();
            return false;
          }
        }

        // Check cooldown to prevent rapid terminal creation
        const now = Date.now();
        const canTrigger = now - lastShortcutTimeRef.current > SHORTCUT_COOLDOWN_MS;

        // Get current shortcuts from ref (allows customization)
        const shortcuts = shortcutsRef.current;

        // Split right (default: Alt+D)
        if (matchesShortcutWithCode(event, shortcuts.splitTerminalRight)) {
          event.preventDefault();
          if (canTrigger) {
            lastShortcutTimeRef.current = now;
            onSplitHorizontalRef.current();
          }
          return false;
        }

        // Split down (default: Alt+S)
        if (matchesShortcutWithCode(event, shortcuts.splitTerminalDown)) {
          event.preventDefault();
          if (canTrigger) {
            lastShortcutTimeRef.current = now;
            onSplitVerticalRef.current();
          }
          return false;
        }

        // Close terminal (default: Alt+W)
        if (matchesShortcutWithCode(event, shortcuts.closeTerminal)) {
          event.preventDefault();
          if (canTrigger) {
            lastShortcutTimeRef.current = now;
            onCloseRef.current();
          }
          return false;
        }

        // New terminal tab (default: Alt+T)
        if (matchesShortcutWithCode(event, shortcuts.newTerminalTab)) {
          event.preventDefault();
          if (canTrigger && onNewTabRef.current) {
            lastShortcutTimeRef.current = now;
            onNewTabRef.current();
          }
          return false;
        }

        const modKey = isMacRef.current ? event.metaKey : event.ctrlKey;
        const otherModKey = isMacRef.current ? event.ctrlKey : event.metaKey;

        // Ctrl+Shift+C / Cmd+Shift+C - Always copy (Linux terminal convention)
        if (modKey && !otherModKey && event.shiftKey && !event.altKey && code === 'KeyC') {
          event.preventDefault();
          copySelectionRef.current();
          return false;
        }

        // Ctrl+C / Cmd+C - Copy if text is selected, otherwise send SIGINT
        if (modKey && !otherModKey && !event.shiftKey && !event.altKey && code === 'KeyC') {
          const hasSelection = terminal.hasSelection();
          if (hasSelection) {
            event.preventDefault();
            copySelectionRef.current();
            terminal.clearSelection();
            return false;
          }
          // No selection - let xterm handle it (sends SIGINT)
          return true;
        }

        // Ctrl+V / Cmd+V or Ctrl+Shift+V / Cmd+Shift+V - Paste
        if (modKey && !otherModKey && !event.altKey && code === 'KeyV') {
          event.preventDefault();
          pasteFromClipboardRef.current();
          return false;
        }

        // Ctrl+A / Cmd+A - Select all
        if (modKey && !otherModKey && !event.shiftKey && !event.altKey && code === 'KeyA') {
          event.preventDefault();
          terminal.selectAll();
          return false;
        }

        // Ctrl+Shift+F / Cmd+Shift+F - Toggle search
        if (modKey && !otherModKey && event.shiftKey && !event.altKey && code === 'KeyF') {
          event.preventDefault();
          showSearchRef.current = !showSearchRef.current;
          setShowSearch(showSearchRef.current);
          return false;
        }

        // Let xterm handle all other keys
        return true;
      });
    };

    initTerminal();

    // Cleanup
    return () => {
      mounted = false;

      // Dispose focus handler to prevent memory leak
      if (focusHandlerRef.current) {
        focusHandlerRef.current.dispose();
        focusHandlerRef.current = null;
      }

      // Dispose link provider to prevent memory leak
      if (linkProviderRef.current) {
        linkProviderRef.current.dispose();
        linkProviderRef.current = null;
      }

      // Clear resize debounce timer
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = null;
      }

      // Clear search decorations before disposing to prevent visual artifacts
      if (searchAddonRef.current) {
        searchAddonRef.current.clearDecorations();
        searchAddonRef.current = null;
      }

      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
      fitAddonRef.current = null;
      setIsTerminalReady(false);
    };
  }, []); // No dependencies - only run once on mount

  // Connect WebSocket - wait for terminal to be ready
  useEffect(() => {
    if (!isTerminalReady || !sessionId) return;
    const terminal = xtermRef.current;
    if (!terminal) return;

    const connect = async () => {
      // Build WebSocket URL with auth params
      let url = `${wsUrl}/api/terminal/ws?sessionId=${sessionId}`;

      // Add API key for Electron mode auth
      const apiKey = getApiKey();
      if (apiKey) {
        url += `&apiKey=${encodeURIComponent(apiKey)}`;
      } else {
        // In web mode, fetch a short-lived wsToken for secure authentication
        const wsToken = await fetchWsToken();
        if (wsToken) {
          url += `&wsToken=${encodeURIComponent(wsToken)}`;
        }
        // Cookies are also sent automatically with same-origin WebSocket
      }

      // Add terminal password token if required
      if (authToken) {
        url += `&token=${encodeURIComponent(authToken)}`;
      }

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        logger.info(`WebSocket connected for session ${sessionId}`);

        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;

        // Start heartbeat to keep connection alive (prevents proxy/load balancer timeouts)
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000); // Ping every 30 seconds
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'data':
              terminal.write(msg.data);
              break;
            case 'scrollback':
              // Only process scrollback if there's actual data
              // Don't clear if empty - prevents blank terminal issue
              if (msg.data && msg.data.length > 0) {
                // Clear any stale search decorations before restoring content
                searchAddonRef.current?.clearDecorations();
                // Use reset() which is more reliable than clear() or escape sequences
                terminal.reset();
                terminal.write(msg.data);
                // Mark as already initialized - don't run initial command for restored sessions
                hasRunInitialCommandRef.current = true;
              }
              break;
            case 'connected': {
              logger.info(`Session connected: ${msg.shell} in ${msg.cwd}`);
              // Detect shell type from path
              const shellPath = (msg.shell || '').toLowerCase();
              // Windows shells use backslash paths and include powershell/pwsh/cmd
              const isWindowsShell =
                shellPath.includes('\\') ||
                shellPath.includes('powershell') ||
                shellPath.includes('pwsh') ||
                shellPath.includes('cmd.exe');
              const isPowerShell = shellPath.includes('powershell') || shellPath.includes('pwsh');

              if (msg.shell) {
                // Extract shell name from path (e.g., "/bin/bash" -> "bash", "C:\...\powershell.exe" -> "powershell.exe")
                const name = msg.shell.split(/[/\\]/).pop() || msg.shell;
                setShellName(name);
              }
              // Run initial command if specified and not already run
              // Only run for new terminals (no scrollback received)
              if (
                runCommandOnConnect &&
                !hasRunInitialCommandRef.current &&
                ws.readyState === WebSocket.OPEN
              ) {
                hasRunInitialCommandRef.current = true;
                // Use appropriate line ending for the shell type
                // Windows shells (PowerShell, cmd) expect \r\n, Unix shells expect \n
                const lineEnding = isWindowsShell ? '\r\n' : '\n';
                // PowerShell takes longer to initialize (profile loading, etc.)
                // Use 500ms for PowerShell, 100ms for other shells
                const delay = isPowerShell ? 500 : 100;

                setTimeout(() => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(
                      JSON.stringify({ type: 'input', data: runCommandOnConnect + lineEnding })
                    );
                    onCommandRan?.();
                  }
                }, delay);
              }
              break;
            }
            case 'exit':
              terminal.write(`\r\n\x1b[33m[Process exited with code ${msg.exitCode}]\x1b[0m\r\n`);
              setProcessExitCode(msg.exitCode);
              break;
            case 'pong':
              // Heartbeat response
              break;
          }
        } catch (err) {
          logger.error('Message parse error:', err);
        }
      };

      ws.onclose = (event) => {
        logger.info(`WebSocket closed for session ${sessionId}: ${event.code} ${event.reason}`);
        wsRef.current = null;

        // Clear heartbeat interval
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        if (event.code === 4001) {
          setConnectionStatus('auth_failed');
          toast.error('Terminal authentication expired', {
            description: 'Please unlock the terminal again to reconnect.',
            duration: 5000,
          });
          return;
        }

        // Don't reconnect if closed normally
        if (event.code === 1000 || event.code === 4003) {
          setConnectionStatus('disconnected');
          return;
        }

        if (event.code === 4004) {
          setConnectionStatus('disconnected');
          // Notify parent that this session is no longer valid on the server
          // This allows automatic cleanup of stale sessions (e.g., after server restart)
          if (onSessionInvalidRef.current) {
            onSessionInvalidRef.current();
            toast.info('Terminal session expired', {
              description:
                'The session was automatically removed. Create a new terminal to continue.',
              duration: 5000,
            });
          } else {
            toast.error('Terminal session not found', {
              description: 'The session may have expired. Please create a new terminal.',
              duration: 5000,
            });
          }
          return;
        }

        reconnectAttemptsRef.current++;

        if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
          setConnectionStatus('disconnected');
          toast.error('Terminal disconnected', {
            description: 'Maximum reconnection attempts reached. Click to retry.',
            action: {
              label: 'Retry',
              onClick: () => {
                reconnectAttemptsRef.current = 0;
                setConnectionStatus('reconnecting');
                connect();
              },
            },
            duration: 10000,
          });
          return;
        }

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1);
        setConnectionStatus('reconnecting');

        // Attempt reconnect after exponential delay
        reconnectTimeoutRef.current = setTimeout(() => {
          if (xtermRef.current) {
            logger.info(
              `Attempting reconnect for session ${sessionId} (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
            );
            connect();
          }
        }, delay);
      };

      ws.onerror = (error) => {
        logger.error(`WebSocket error for session ${sessionId}:`, error);
      };
    };

    connect();

    // Handle terminal input
    const dataHandler = terminal.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Cleanup
    return () => {
      dataHandler.dispose();
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId, authToken, wsUrl, isTerminalReady, fetchWsToken]);

  // Handle resize with debouncing
  const handleResize = useCallback(() => {
    // Clear any pending resize
    if (resizeDebounceRef.current) {
      clearTimeout(resizeDebounceRef.current);
    }

    // Debounce resize operations to prevent race conditions
    resizeDebounceRef.current = setTimeout(() => {
      if (!fitAddonRef.current || !xtermRef.current || !terminalRef.current) return;

      const container = terminalRef.current;
      const rect = container.getBoundingClientRect();

      // Only skip if container has no size at all
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      try {
        fitAddonRef.current.fit();
        const { cols, rows } = xtermRef.current;

        // Send resize to server
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      } catch (err) {
        logger.error('Resize error:', err);
      }
    }, RESIZE_DEBOUNCE_MS);
  }, []);

  // Resize observer
  useEffect(() => {
    const container = terminalRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(container);

    // Also handle window resize
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  useEffect(() => {
    if (xtermRef.current && isTerminalReady) {
      xtermRef.current.options.fontSize = fontSize;
      fitAddonRef.current?.fit();
    }
  }, [fontSize, isTerminalReady]);

  useEffect(() => {
    if (xtermRef.current && isTerminalReady) {
      xtermRef.current.options.fontFamily = fontFamily;
      fitAddonRef.current?.fit();
    }
  }, [fontFamily, isTerminalReady]);

  useEffect(() => {
    if (xtermRef.current && isTerminalReady) {
      xtermRef.current.options.lineHeight = lineHeight;
      fitAddonRef.current?.fit();
    }
  }, [lineHeight, isTerminalReady]);

  // Focus terminal when becoming active or when terminal becomes ready
  useEffect(() => {
    if (isActive && isTerminalReady && xtermRef.current && !showSearch) {
      xtermRef.current.focus();
    }
  }, [isActive, isTerminalReady, showSearch]);

  // Focus search input when search bar opens
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [showSearch]);

  // Monitor scroll position to show/hide "Jump to bottom" button
  useEffect(() => {
    if (!isTerminalReady || !terminalRef.current) return;

    // xterm creates a viewport element with class .xterm-viewport
    const viewport = terminalRef.current.querySelector('.xterm-viewport') as HTMLElement | null;
    if (!viewport) return;

    const checkScrollPosition = () => {
      // Check if scrolled to bottom (with small tolerance for rounding)
      const scrollTop = viewport.scrollTop;
      const scrollHeight = viewport.scrollHeight;
      const clientHeight = viewport.clientHeight;
      const isBottom = scrollHeight - scrollTop - clientHeight <= 5;
      setIsAtBottom(isBottom);
    };

    // Initial check
    checkScrollPosition();

    // Listen for scroll events
    viewport.addEventListener('scroll', checkScrollPosition, { passive: true });

    return () => {
      viewport.removeEventListener('scroll', checkScrollPosition);
    };
  }, [isTerminalReady]);

  // Update terminal font size when it changes
  useEffect(() => {
    if (xtermRef.current && isTerminalReady) {
      xtermRef.current.options.fontSize = fontSize;
      // Refit after font size change
      if (fitAddonRef.current && terminalRef.current) {
        const rect = terminalRef.current.getBoundingClientRect();
        // Only fit if container has any size
        if (rect.width > 0 && rect.height > 0) {
          fitAddonRef.current.fit();
          // Notify server of new dimensions
          const { cols, rows } = xtermRef.current;
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
          }
        }
      }
    }
  }, [fontSize, isTerminalReady]);

  // Update terminal theme when app theme changes (including system preference)
  useEffect(() => {
    if (xtermRef.current && isTerminalReady) {
      // Clear any search decorations first to prevent stale color artifacts
      searchAddonRef.current?.clearDecorations();
      const terminalTheme = getTerminalTheme(resolvedTheme);
      xtermRef.current.options.theme = terminalTheme;
    }
  }, [resolvedTheme, isTerminalReady]);

  // Handle keyboard shortcuts for zoom (Ctrl+Plus, Ctrl+Minus, Ctrl+0)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if Ctrl (or Cmd on Mac) is pressed
      if (!e.ctrlKey && !e.metaKey) return;

      // Ctrl/Cmd + Plus (Equal key or NumpadAdd for international keyboard support)
      if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        e.preventDefault();
        e.stopPropagation();
        zoomIn();
        return;
      }

      // Ctrl/Cmd + Minus (Minus key or NumpadSubtract)
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        e.stopPropagation();
        zoomOut();
        return;
      }

      // Ctrl/Cmd + 0 to reset (Digit0 or Numpad0)
      if (e.code === 'Digit0' || e.code === 'Numpad0') {
        e.preventDefault();
        e.stopPropagation();
        resetZoom();
        return;
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut, resetZoom]);

  // Handle mouse wheel zoom (Ctrl+Wheel)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Only zoom if Ctrl (or Cmd on Mac) is pressed
      if (!e.ctrlKey && !e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.deltaY < 0) {
        // Scroll up = zoom in
        zoomIn();
      } else if (e.deltaY > 0) {
        // Scroll down = zoom out
        zoomOut();
      }
    };

    // Use passive: false to allow preventDefault
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [zoomIn, zoomOut]);

  // Context menu actions for keyboard navigation
  const menuActions = ['copy', 'paste', 'selectAll', 'clear'] as const;

  // Keep ref in sync with state for use in event handlers
  useEffect(() => {
    focusedMenuIndexRef.current = focusedMenuIndex;
  }, [focusedMenuIndex]);

  // Close context menu on click outside or scroll, handle keyboard navigation
  useEffect(() => {
    if (!contextMenu) return;

    // Reset focus index and focus menu when opened
    setFocusedMenuIndex(0);
    focusedMenuIndexRef.current = 0;
    requestAnimationFrame(() => {
      const firstButton =
        contextMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
      firstButton?.focus();
    });

    const handleClick = () => closeContextMenu();
    const handleScroll = () => closeContextMenu();
    const handleKeyDown = (e: KeyboardEvent) => {
      const updateFocusIndex = (newIndex: number) => {
        focusedMenuIndexRef.current = newIndex;
        setFocusedMenuIndex(newIndex);
      };

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          closeContextMenu();
          xtermRef.current?.focus();
          break;
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          updateFocusIndex((focusedMenuIndexRef.current + 1) % menuActions.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          updateFocusIndex(
            (focusedMenuIndexRef.current - 1 + menuActions.length) % menuActions.length
          );
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          e.stopPropagation();
          handleContextMenuAction(menuActions[focusedMenuIndexRef.current]);
          break;
        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          closeContextMenu();
          break;
      }
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu, closeContextMenu, handleContextMenuAction]);

  // Focus the correct menu item when navigation changes
  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const buttons = contextMenuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    buttons[focusedMenuIndex]?.focus();
  }, [focusedMenuIndex, contextMenu]);

  // Handle right-click context menu with boundary checking
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Menu dimensions (approximate)
    const menuWidth = 160;
    const menuHeight = 152; // 4 items + separator + padding
    const padding = 8;

    // Calculate position with boundary checks
    let x = e.clientX;
    let y = e.clientY;

    // Check right edge
    if (x + menuWidth + padding > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }

    // Check bottom edge
    if (y + menuHeight + padding > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }

    // Ensure not negative
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    setContextMenu({ x, y });
  }, []);

  // Convert file to base64
  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file as base64'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }, []);

  // Save image to temp folder via Electron API
  const saveImageToTemp = useCallback(
    async (base64Data: string, filename: string, mimeType: string): Promise<string | null> => {
      try {
        const api = getElectronAPI();
        if (!api.saveImageToTemp) {
          // Fallback path when Electron API is not available (browser mode)
          logger.warn('saveImageToTemp not available, returning fallback path');
          return `.automaker/images/${Date.now()}_${filename}`;
        }

        const projectPath = currentProject?.path;
        const result = await api.saveImageToTemp(base64Data, filename, mimeType, projectPath);
        if (result.success && result.path) {
          return result.path;
        }
        logger.error('Failed to save image:', result.error);
        return null;
      } catch (error) {
        logger.error('Error saving image:', error);
        return null;
      }
    },
    [currentProject?.path]
  );

  // Check if drag event contains image files
  const hasImageFiles = useCallback((e: React.DragEvent): boolean => {
    const types = e.dataTransfer.types;
    const items = e.dataTransfer.items;

    // Check if Files type is present
    if (!types.includes('Files')) return false;

    // Check if any item is an image
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && ACCEPTED_IMAGE_TYPES.includes(item.type)) {
        return true;
      }
    }
    return false;
  }, []);

  // Handle image drag over terminal
  const handleImageDragOver = useCallback(
    (e: React.DragEvent) => {
      // Only handle if contains image files
      if (!hasImageFiles(e)) return;

      e.preventDefault();
      e.stopPropagation();
      setIsImageDragOver(true);
    },
    [hasImageFiles]
  );

  // Handle image drag leave
  const handleImageDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Only reset if leaving the actual container (not just moving to a child)
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget && terminalRef.current?.contains(relatedTarget)) {
      return;
    }

    setIsImageDragOver(false);
  }, []);

  // Handle image drop on terminal
  const handleImageDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsImageDragOver(false);

      if (isProcessingImage) return;

      const files = e.dataTransfer.files;
      if (!files.length) return;

      // Filter to only image files
      const imageFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (ACCEPTED_IMAGE_TYPES.includes(file.type)) {
          if (file.size > MAX_IMAGE_SIZE) {
            toast.error(`Image too large: ${file.name}`, {
              description: 'Maximum size is 10MB',
            });
            continue;
          }
          imageFiles.push(file);
        }
      }

      if (imageFiles.length === 0) {
        toast.error('No valid images found', {
          description: 'Drop PNG, JPG, GIF, or WebP images',
        });
        return;
      }

      setIsProcessingImage(true);
      const savedPaths: string[] = [];

      for (const file of imageFiles) {
        try {
          const base64 = await fileToBase64(file);
          const savedPath = await saveImageToTemp(base64, file.name, file.type);
          if (savedPath) {
            savedPaths.push(savedPath);
          } else {
            toast.error(`Failed to save: ${file.name}`);
          }
        } catch (error) {
          logger.error('Error processing image:', error);
          toast.error(`Error processing: ${file.name}`);
        }
      }

      setIsProcessingImage(false);

      if (savedPaths.length === 0) return;

      // Send image paths to terminal as input
      // Format: space-separated paths, each wrapped in quotes if containing spaces
      const formattedPaths = savedPaths.map((p) => (p.includes(' ') ? `"${p}"` : p)).join(' ');

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data: formattedPaths }));
        toast.success(
          savedPaths.length === 1
            ? 'Image path inserted'
            : `${savedPaths.length} image paths inserted`,
          { description: 'Press Enter to send' }
        );
      } else {
        toast.error('Terminal not connected');
      }
    },
    [isProcessingImage, fileToBase64, saveImageToTemp]
  );

  // Combine refs for the container
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      setDropRef(node);
    },
    [setDropRef]
  );

  // Get current terminal theme for xterm styling (resolved for system preference)
  const currentTerminalTheme = getTerminalTheme(resolvedTheme);

  return (
    <div
      ref={setRefs}
      className={cn(
        'flex flex-col h-full relative',
        isActive && 'ring-1 ring-brand-500 ring-inset',
        // Visual feedback when dragging this terminal
        isDragging && 'opacity-50',
        // Visual feedback when hovering over as drop target
        isOver && isDropTarget && 'ring-2 ring-green-500 ring-inset'
      )}
      onClick={onFocus}
      onKeyDownCapture={handleContainerKeyDownCapture}
      tabIndex={0}
      data-terminal-container="true"
    >
      {/* Drop indicator overlay */}
      {isOver && isDropTarget && (
        <div className="absolute inset-0 bg-green-500/10 z-10 pointer-events-none flex items-center justify-center">
          <div className="px-3 py-2 bg-green-500/90 rounded-md text-white text-sm font-medium">
            Drop to swap
          </div>
        </div>
      )}

      {/* Image drop overlay */}
      {isImageDragOver && (
        <div className="absolute inset-0 bg-blue-500/20 z-20 pointer-events-none flex items-center justify-center border-2 border-dashed border-blue-400 rounded">
          <div className="flex flex-col items-center gap-2 px-4 py-3 bg-blue-500/90 rounded-md text-white">
            {isProcessingImage ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm font-medium">Processing...</span>
              </>
            ) : (
              <>
                <ImageIcon className="h-6 w-6" />
                <span className="text-sm font-medium">Drop image for Claude Code</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header bar with drag handle - uses app theme CSS variables */}
      <div className="flex items-center h-7 px-1 shrink-0 bg-card border-b border-border">
        {/* Drag handle */}
        <button
          ref={setDragRef}
          {...dragAttributes}
          {...dragListeners}
          className={cn(
            'p-1 rounded cursor-grab active:cursor-grabbing mr-1 transition-colors text-muted-foreground hover:text-foreground hover:bg-accent',
            isDragging && 'cursor-grabbing'
          )}
          title="Drag to swap terminals"
        >
          <GripHorizontal className="h-3 w-3" />
        </button>

        {/* Terminal icon and label */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Terminal className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="text-xs truncate text-foreground">{shellName}</span>
          {/* Font size indicator - only show when not default */}
          {fontSize !== DEFAULT_FONT_SIZE && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                resetZoom();
              }}
              className="text-[10px] px-1 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
              title="Click to reset zoom (Ctrl+0)"
            >
              {fontSize}px
            </button>
          )}
          {connectionStatus === 'reconnecting' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500 flex items-center gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Reconnecting...
            </span>
          )}
          {connectionStatus === 'disconnected' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">
              Disconnected
            </span>
          )}
          {connectionStatus === 'auth_failed' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">
              Auth Failed
            </span>
          )}
          {processExitCode !== null && (
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1',
                processExitCode === 0
                  ? 'bg-green-500/20 text-green-500'
                  : 'bg-yellow-500/20 text-yellow-500'
              )}
            >
              Exited ({processExitCode})
            </span>
          )}
        </div>

        {/* Zoom and action buttons */}
        <div className="flex items-center gap-0.5">
          {/* Zoom controls */}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              zoomOut();
            }}
            title="Zoom Out (Ctrl+-)"
            disabled={fontSize <= MIN_FONT_SIZE}
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              zoomIn();
            }}
            title="Zoom In (Ctrl++)"
            disabled={fontSize >= MAX_FONT_SIZE}
          >
            <ZoomIn className="h-3 w-3" />
          </Button>

          {/* Settings popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
                title="Terminal Settings"
              >
                <Settings className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-64 p-3"
              align="end"
              side="bottom"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Font Size</Label>
                    <span className="text-xs text-muted-foreground">{fontSize}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[fontSize]}
                      min={MIN_FONT_SIZE}
                      max={MAX_FONT_SIZE}
                      step={1}
                      onValueChange={([value]) => onFontSizeChange(value)}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => resetZoom()}
                      disabled={fontSize === DEFAULT_FONT_SIZE}
                      title="Reset to default"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Run on New Terminal</Label>
                  <Input
                    value={defaultRunScript}
                    onChange={(e) => setTerminalDefaultRunScript(e.target.value)}
                    placeholder="e.g., claude"
                    className="h-7 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Command to run when creating a new terminal
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Font Family</Label>
                  <select
                    value={fontFamily}
                    onChange={(e) => {
                      setTerminalFontFamily(e.target.value);
                      toast.info('Font family changed', {
                        description: 'Restart terminal for changes to take effect',
                      });
                    }}
                    className="w-full h-7 text-xs bg-background border border-input rounded-md px-2"
                  >
                    {TERMINAL_FONT_OPTIONS.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Scrollback</Label>
                    <span className="text-xs text-muted-foreground">
                      {(scrollbackLines / 1000).toFixed(0)}k lines
                    </span>
                  </div>
                  <Slider
                    value={[scrollbackLines]}
                    min={1000}
                    max={100000}
                    step={1000}
                    onValueChange={([value]) => {
                      setTerminalScrollbackLines(value);
                    }}
                    onValueCommit={() => {
                      toast.info('Scrollback changed', {
                        description: 'Restart terminal for changes to take effect',
                      });
                    }}
                    className="flex-1"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Line Height</Label>
                    <span className="text-xs text-muted-foreground">{lineHeight.toFixed(1)}</span>
                  </div>
                  <Slider
                    value={[lineHeight]}
                    min={1.0}
                    max={2.0}
                    step={0.1}
                    onValueChange={([value]) => {
                      setTerminalLineHeight(value);
                    }}
                    onValueCommit={() => {
                      toast.info('Line height changed', {
                        description: 'Restart terminal for changes to take effect',
                      });
                    }}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium">Screen Reader</Label>
                    <p className="text-[10px] text-muted-foreground">Enable accessibility mode</p>
                  </div>
                  <Switch
                    checked={screenReaderMode}
                    onCheckedChange={(checked) => {
                      setTerminalScreenReaderMode(checked);
                      toast.info(checked ? 'Screen reader enabled' : 'Screen reader disabled', {
                        description: 'Restart terminal for changes to take effect',
                      });
                    }}
                  />
                </div>

                <div className="text-[10px] text-muted-foreground border-t pt-2">
                  <p>Zoom: Ctrl++ / Ctrl+- / Ctrl+0</p>
                  <p>Or use Ctrl+scroll wheel</p>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <div className="w-px h-3 mx-0.5 bg-border" />

          {/* Split/close buttons */}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onSplitHorizontal();
            }}
            title="Split Right (Alt+D)"
          >
            <SplitSquareHorizontal className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onSplitVertical();
            }}
            title="Split Down (Alt+S)"
          >
            <SplitSquareVertical className="h-3 w-3" />
          </Button>
          {onToggleMaximize && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMaximize();
              }}
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Close Terminal (Alt+W)"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-1 px-2 py-1 bg-card border-b border-border shrink-0">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              // Auto-search as user types
              if (searchAddonRef.current && e.target.value) {
                searchAddonRef.current.findNext(e.target.value, searchOptions);
              } else if (searchAddonRef.current) {
                searchAddonRef.current.clearDecorations();
              }
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                  searchPrevious();
                } else {
                  searchNext();
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                closeSearch();
              }
            }}
            placeholder="Search..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground shrink-0"
            onClick={searchPrevious}
            disabled={!searchQuery}
            title="Previous Match (Shift+Enter)"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground shrink-0"
            onClick={searchNext}
            disabled={!searchQuery}
            title="Next Match (Enter)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground shrink-0"
            onClick={closeSearch}
            title="Close (Escape)"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Terminal container - uses terminal theme */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-hidden relative"
        style={{ backgroundColor: currentTerminalTheme.background }}
        onContextMenu={handleContextMenu}
        onDragOver={handleImageDragOver}
        onDragLeave={handleImageDragLeave}
        onDrop={handleImageDrop}
      />

      {/* Jump to bottom button - shown when scrolled up */}
      {!isAtBottom && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute bottom-3 right-3 h-7 px-2 gap-1 shadow-md z-10 opacity-90 hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            scrollToBottom();
          }}
          title="Jump to bottom"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          <span className="text-xs">Bottom</span>
        </Button>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          role="menu"
          aria-label="Terminal context menu"
          className="fixed z-50 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            role="menuitem"
            tabIndex={focusedMenuIndex === 0 ? 0 : -1}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground cursor-default outline-none',
              focusedMenuIndex === 0
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent hover:text-accent-foreground'
            )}
            onClick={() => handleContextMenuAction('copy')}
          >
            <Copy className="h-4 w-4" />
            <span className="flex-1 text-left">Copy</span>
            <span className="text-xs text-muted-foreground">{isMac ? '⌘C' : 'Ctrl+C'}</span>
          </button>
          <button
            role="menuitem"
            tabIndex={focusedMenuIndex === 1 ? 0 : -1}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground cursor-default outline-none',
              focusedMenuIndex === 1
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent hover:text-accent-foreground'
            )}
            onClick={() => handleContextMenuAction('paste')}
          >
            <ClipboardPaste className="h-4 w-4" />
            <span className="flex-1 text-left">Paste</span>
            <span className="text-xs text-muted-foreground">{isMac ? '⌘V' : 'Ctrl+V'}</span>
          </button>
          <div role="separator" className="my-1 h-px bg-border" />
          <button
            role="menuitem"
            tabIndex={focusedMenuIndex === 2 ? 0 : -1}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground cursor-default outline-none',
              focusedMenuIndex === 2
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent hover:text-accent-foreground'
            )}
            onClick={() => handleContextMenuAction('selectAll')}
          >
            <CheckSquare className="h-4 w-4" />
            <span className="flex-1 text-left">Select All</span>
            <span className="text-xs text-muted-foreground">{isMac ? '⌘A' : 'Ctrl+A'}</span>
          </button>
          <button
            role="menuitem"
            tabIndex={focusedMenuIndex === 3 ? 0 : -1}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground cursor-default outline-none',
              focusedMenuIndex === 3
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent hover:text-accent-foreground'
            )}
            onClick={() => handleContextMenuAction('clear')}
          >
            <Trash2 className="h-4 w-4" />
            <span className="flex-1 text-left">Clear</span>
          </button>
        </div>
      )}
    </div>
  );
}
