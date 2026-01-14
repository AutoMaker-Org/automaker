import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface AnsiOutputProps {
  text: string;
  className?: string;
}

// ANSI color codes to CSS color mappings
const ANSI_COLORS: Record<number, string> = {
  // Standard colors
  30: '#6b7280', // Black (use gray for visibility on dark bg)
  31: '#ef4444', // Red
  32: '#22c55e', // Green
  33: '#eab308', // Yellow
  34: '#3b82f6', // Blue
  35: '#a855f7', // Magenta
  36: '#06b6d4', // Cyan
  37: '#d1d5db', // White
  // Bright colors
  90: '#9ca3af', // Bright Black (Gray)
  91: '#f87171', // Bright Red
  92: '#4ade80', // Bright Green
  93: '#facc15', // Bright Yellow
  94: '#60a5fa', // Bright Blue
  95: '#c084fc', // Bright Magenta
  96: '#22d3ee', // Bright Cyan
  97: '#ffffff', // Bright White
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: 'transparent',
  41: '#ef4444',
  42: '#22c55e',
  43: '#eab308',
  44: '#3b82f6',
  45: '#a855f7',
  46: '#06b6d4',
  47: '#f3f4f6',
  // Bright backgrounds
  100: '#374151',
  101: '#f87171',
  102: '#4ade80',
  103: '#facc15',
  104: '#60a5fa',
  105: '#c084fc',
  106: '#22d3ee',
  107: '#ffffff',
};

interface TextSegment {
  text: string;
  style: {
    color?: string;
    backgroundColor?: string;
    fontWeight?: string;
    fontStyle?: string;
    textDecoration?: string;
  };
}

/**
 * Strip hyperlink escape sequences (OSC 8)
 * Format: ESC]8;;url ESC\ text ESC]8;; ESC\
 */
function stripHyperlinks(text: string): string {
  // Remove OSC 8 hyperlink sequences
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

/**
 * Strip other OSC sequences (title, etc.)
 */
function stripOtherOSC(text: string): string {
  // Remove OSC sequences (ESC ] ... BEL or ESC ] ... ST)
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

function parseAnsi(text: string): TextSegment[] {
  // Pre-process: strip hyperlinks and other OSC sequences
  let processedText = stripHyperlinks(text);
  processedText = stripOtherOSC(processedText);

  const segments: TextSegment[] = [];

  // Match ANSI escape sequences: ESC[...m (SGR - Select Graphic Rendition)
  // Also handle ESC[K (erase line) and other CSI sequences by stripping them
  // The ESC character can be \x1b, \033, \u001b
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /\x1b\[([0-9;]*)([a-zA-Z])/g;

  let currentStyle: TextSegment['style'] = {};
  let lastIndex = 0;
  let match;

  while ((match = ansiRegex.exec(processedText)) !== null) {
    // Add text before this escape sequence
    if (match.index > lastIndex) {
      const content = processedText.slice(lastIndex, match.index);
      if (content) {
        segments.push({ text: content, style: { ...currentStyle } });
      }
    }

    const params = match[1];
    const command = match[2];

    // Only process 'm' command (SGR - graphics/color)
    // Ignore other commands like K (erase), H (cursor), J (clear), etc.
    if (command === 'm') {
      // Parse the escape sequence codes
      const codes = params ? params.split(';').map((c) => parseInt(c, 10) || 0) : [0];

      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];

        if (code === 0) {
          // Reset all attributes
          currentStyle = {};
        } else if (code === 1) {
          // Bold
          currentStyle.fontWeight = 'bold';
        } else if (code === 2) {
          // Dim/faint
          currentStyle.color = 'var(--muted-foreground)';
        } else if (code === 3) {
          // Italic
          currentStyle.fontStyle = 'italic';
        } else if (code === 4) {
          // Underline
          currentStyle.textDecoration = 'underline';
        } else if (code === 22) {
          // Normal intensity (not bold, not dim)
          currentStyle.fontWeight = undefined;
        } else if (code === 23) {
          // Not italic
          currentStyle.fontStyle = undefined;
        } else if (code === 24) {
          // Not underlined
          currentStyle.textDecoration = undefined;
        } else if (code === 38) {
          // Extended foreground color
          if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
            // 256 color mode: 38;5;n
            const colorIndex = codes[i + 2];
            currentStyle.color = get256Color(colorIndex);
            i += 2;
          } else if (codes[i + 1] === 2 && codes[i + 4] !== undefined) {
            // RGB mode: 38;2;r;g;b
            const r = codes[i + 2];
            const g = codes[i + 3];
            const b = codes[i + 4];
            currentStyle.color = `rgb(${r}, ${g}, ${b})`;
            i += 4;
          }
        } else if (code === 48) {
          // Extended background color
          if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
            // 256 color mode: 48;5;n
            const colorIndex = codes[i + 2];
            currentStyle.backgroundColor = get256Color(colorIndex);
            i += 2;
          } else if (codes[i + 1] === 2 && codes[i + 4] !== undefined) {
            // RGB mode: 48;2;r;g;b
            const r = codes[i + 2];
            const g = codes[i + 3];
            const b = codes[i + 4];
            currentStyle.backgroundColor = `rgb(${r}, ${g}, ${b})`;
            i += 4;
          }
        } else if (ANSI_COLORS[code]) {
          // Standard foreground color (30-37, 90-97)
          currentStyle.color = ANSI_COLORS[code];
        } else if (ANSI_BG_COLORS[code]) {
          // Standard background color (40-47, 100-107)
          currentStyle.backgroundColor = ANSI_BG_COLORS[code];
        } else if (code === 39) {
          // Default foreground
          currentStyle.color = undefined;
        } else if (code === 49) {
          // Default background
          currentStyle.backgroundColor = undefined;
        }
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last escape sequence
  if (lastIndex < processedText.length) {
    const content = processedText.slice(lastIndex);
    if (content) {
      segments.push({ text: content, style: { ...currentStyle } });
    }
  }

  // If no segments were created (no ANSI codes), return the whole text
  if (segments.length === 0 && processedText) {
    segments.push({ text: processedText, style: {} });
  }

  return segments;
}

/**
 * Convert 256-color palette index to CSS color
 */
function get256Color(index: number): string {
  // 0-15: Standard colors
  if (index < 16) {
    const standardColors = [
      '#000000',
      '#cd0000',
      '#00cd00',
      '#cdcd00',
      '#0000ee',
      '#cd00cd',
      '#00cdcd',
      '#e5e5e5',
      '#7f7f7f',
      '#ff0000',
      '#00ff00',
      '#ffff00',
      '#5c5cff',
      '#ff00ff',
      '#00ffff',
      '#ffffff',
    ];
    return standardColors[index];
  }

  // 16-231: 6x6x6 color cube
  if (index < 232) {
    const n = index - 16;
    const b = n % 6;
    const g = Math.floor(n / 6) % 6;
    const r = Math.floor(n / 36);
    const toHex = (v: number) => (v === 0 ? 0 : 55 + v * 40);
    return `rgb(${toHex(r)}, ${toHex(g)}, ${toHex(b)})`;
  }

  // 232-255: Grayscale
  const gray = 8 + (index - 232) * 10;
  return `rgb(${gray}, ${gray}, ${gray})`;
}

export function AnsiOutput({ text, className }: AnsiOutputProps) {
  const segments = useMemo(() => parseAnsi(text), [text]);

  return (
    <pre
      className={cn(
        'font-mono text-xs whitespace-pre-wrap break-words text-muted-foreground',
        className
      )}
    >
      {segments.map((segment, index) => (
        <span
          key={index}
          style={{
            color: segment.style.color,
            backgroundColor: segment.style.backgroundColor,
            fontWeight: segment.style.fontWeight,
            fontStyle: segment.style.fontStyle,
            textDecoration: segment.style.textDecoration,
          }}
        >
          {segment.text}
        </span>
      ))}
    </pre>
  );
}
