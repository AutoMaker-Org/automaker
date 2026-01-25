import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { useAppStore } from '@/store/app-store';
import { getTerminalTheme, getTerminalFontFamily } from '@/config/terminal-themes';

// Types for dynamically imported xterm modules
type XTerminal = InstanceType<typeof import('@xterm/xterm').Terminal>;
type XFitAddon = InstanceType<typeof import('@xterm/addon-fit').FitAddon>;

export interface XtermLogViewerRef {
  /** Append content to the log viewer */
  append: (content: string) => void;
  /** Clear all content */
  clear: () => void;
  /** Scroll to the bottom */
  scrollToBottom: () => void;
  /** Write content (replaces all content) */
  write: (content: string) => void;
}

export interface XtermLogViewerProps {
  /** Initial content to display */
  initialContent?: string;
  /** Font size in pixels (uses terminal settings if not provided) */
  fontSize?: number;
  /** Whether to auto-scroll to bottom when new content is added (default: true) */
  autoScroll?: boolean;
  /** Custom class name for the container */
  className?: string;
  /** Minimum height for the container */
  minHeight?: number;
  /** Callback when user scrolls away from bottom */
  onScrollAwayFromBottom?: () => void;
  /** Callback when user scrolls to bottom */
  onScrollToBottom?: () => void;
}

/**
 * A read-only terminal log viewer using xterm.js for perfect ANSI color rendering.
 * Use this component when you need to display terminal output with ANSI escape codes.
 */
export const XtermLogViewer = forwardRef<XtermLogViewerRef, XtermLogViewerProps>(
  (
    {
      initialContent,
      fontSize,
      autoScroll = true,
      className,
      minHeight = 300,
      onScrollAwayFromBottom,
      onScrollToBottom,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerminal | null>(null);
    const fitAddonRef = useRef<XFitAddon | null>(null);
    const [isReady, setIsReady] = useState(false);
    const autoScrollRef = useRef(autoScroll);
    const pendingContentRef = useRef<string[]>([]);

    // Get theme and font settings from store
    const getEffectiveTheme = useAppStore((state) => state.getEffectiveTheme);
    const effectiveTheme = getEffectiveTheme();
    const terminalFontFamily = useAppStore((state) => state.terminalState.fontFamily);
    const terminalFontSize = useAppStore((state) => state.terminalState.defaultFontSize);

    // Use prop if provided, otherwise use store value, fallback to 13
    const effectiveFontSize = fontSize ?? terminalFontSize ?? 13;

    // Track system dark mode for "system" theme
    const [systemIsDark, setSystemIsDark] = useState(() => {
      if (typeof window !== 'undefined') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      return true;
    });

    useEffect(() => {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    const resolvedTheme =
      effectiveTheme === 'system' ? (systemIsDark ? 'dark' : 'light') : effectiveTheme;

    // Update autoScroll ref when prop changes
    useEffect(() => {
      autoScrollRef.current = autoScroll;
    }, [autoScroll]);

    // Initialize xterm
    useEffect(() => {
      if (!containerRef.current) return;

      let mounted = true;

      const initTerminal = async () => {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
        ]);
        await import('@xterm/xterm/css/xterm.css');

        if (!mounted || !containerRef.current) return;

        const terminalTheme = getTerminalTheme(resolvedTheme);

        // Get font settings from store at initialization time
        const terminalState = useAppStore.getState().terminalState;
        const fontFamily = getTerminalFontFamily(terminalState.fontFamily);
        const initFontSize = fontSize ?? terminalState.defaultFontSize ?? 13;

        const terminal = new Terminal({
          cursorBlink: false,
          cursorStyle: 'underline',
          cursorInactiveStyle: 'none',
          fontSize: initFontSize,
          fontFamily,
          lineHeight: 1.2,
          theme: terminalTheme,
          disableStdin: true, // Read-only mode
          scrollback: 10000,
          convertEol: true,
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);

        terminal.open(containerRef.current);

        // Try to load WebGL addon for better performance
        try {
          const { WebglAddon } = await import('@xterm/addon-webgl');
          const webglAddon = new WebglAddon();
          webglAddon.onContextLoss(() => webglAddon.dispose());
          terminal.loadAddon(webglAddon);
        } catch {
          // WebGL not available, continue with canvas renderer
        }

        // Wait for layout to stabilize then fit
        requestAnimationFrame(() => {
          if (mounted && containerRef.current) {
            try {
              fitAddon.fit();
            } catch {
              // Ignore fit errors during initialization
            }
          }
        });

        xtermRef.current = terminal;
        fitAddonRef.current = fitAddon;
        setIsReady(true);

        // Write initial content if provided
        if (initialContent) {
          terminal.write(initialContent);
        }

        // Write any pending content that was queued before terminal was ready
        if (pendingContentRef.current.length > 0) {
          pendingContentRef.current.forEach((content) => terminal.write(content));
          pendingContentRef.current = [];
        }
      };

      initTerminal();

      return () => {
        mounted = false;
        if (xtermRef.current) {
          xtermRef.current.dispose();
          xtermRef.current = null;
        }
        fitAddonRef.current = null;
        setIsReady(false);
      };
    }, []); // Only run once on mount

    // Update theme when it changes
    useEffect(() => {
      if (xtermRef.current && isReady) {
        const terminalTheme = getTerminalTheme(resolvedTheme);
        xtermRef.current.options.theme = terminalTheme;
      }
    }, [resolvedTheme, isReady]);

    // Update font size when it changes
    useEffect(() => {
      if (xtermRef.current && isReady) {
        xtermRef.current.options.fontSize = effectiveFontSize;
        fitAddonRef.current?.fit();
      }
    }, [effectiveFontSize, isReady]);

    // Update font family when it changes
    useEffect(() => {
      if (xtermRef.current && isReady) {
        xtermRef.current.options.fontFamily = getTerminalFontFamily(terminalFontFamily);
        fitAddonRef.current?.fit();
      }
    }, [terminalFontFamily, isReady]);

    // Handle resize
    useEffect(() => {
      if (!containerRef.current || !isReady) return;

      const handleResize = () => {
        if (fitAddonRef.current && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            try {
              fitAddonRef.current.fit();
            } catch {
              // Ignore fit errors
            }
          }
        }
      };

      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(containerRef.current);
      window.addEventListener('resize', handleResize);

      return () => {
        resizeObserver.disconnect();
        window.removeEventListener('resize', handleResize);
      };
    }, [isReady]);

    // Monitor scroll position
    useEffect(() => {
      if (!isReady || !containerRef.current) return;

      const viewport = containerRef.current.querySelector('.xterm-viewport') as HTMLElement | null;
      if (!viewport) return;

      const checkScroll = () => {
        const { scrollTop, scrollHeight, clientHeight } = viewport;
        const isAtBottom = scrollHeight - scrollTop - clientHeight <= 10;

        if (isAtBottom) {
          autoScrollRef.current = true;
          onScrollToBottom?.();
        } else {
          autoScrollRef.current = false;
          onScrollAwayFromBottom?.();
        }
      };

      viewport.addEventListener('scroll', checkScroll, { passive: true });
      return () => viewport.removeEventListener('scroll', checkScroll);
    }, [isReady, onScrollAwayFromBottom, onScrollToBottom]);

    // Expose methods via ref
    const append = useCallback((content: string) => {
      if (xtermRef.current) {
        xtermRef.current.write(content);
        if (autoScrollRef.current) {
          xtermRef.current.scrollToBottom();
        }
      } else {
        // Queue content if terminal isn't ready yet
        pendingContentRef.current.push(content);
      }
    }, []);

    const clear = useCallback(() => {
      if (xtermRef.current) {
        xtermRef.current.clear();
      }
    }, []);

    const scrollToBottom = useCallback(() => {
      if (xtermRef.current) {
        xtermRef.current.scrollToBottom();
        autoScrollRef.current = true;
      }
    }, []);

    const write = useCallback((content: string) => {
      if (xtermRef.current) {
        xtermRef.current.reset();
        xtermRef.current.write(content);
        if (autoScrollRef.current) {
          xtermRef.current.scrollToBottom();
        }
      } else {
        pendingContentRef.current = [content];
      }
    }, []);

    useImperativeHandle(ref, () => ({
      append,
      clear,
      scrollToBottom,
      write,
    }));

    const terminalTheme = getTerminalTheme(resolvedTheme);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          minHeight,
          backgroundColor: terminalTheme.background,
        }}
      />
    );
  }
);

XtermLogViewer.displayName = 'XtermLogViewer';
