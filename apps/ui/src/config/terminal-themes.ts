/**
 * Terminal themes that match the app themes
 * Each theme provides colors for xterm.js terminal emulator
 */

import type { ThemeMode } from '@/store/app-store';
import {
  UI_MONO_FONT_OPTIONS,
  DEFAULT_FONT_VALUE,
  type UIFontOption,
} from '@/config/ui-font-options';

export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground?: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
  // Search highlighting colors - for xterm SearchAddon
  searchMatchBackground: string;
  searchMatchBorder: string;
  searchActiveMatchBackground: string;
  searchActiveMatchBorder: string;
}

/**
 * Terminal font options for user selection
 *
 * Uses the same fonts as UI_MONO_FONT_OPTIONS for consistency across the app.
 * All fonts listed here are bundled with the app via @fontsource packages
 * or are system fonts with appropriate fallbacks.
 */

// Re-export for backwards compatibility
export type TerminalFontOption = UIFontOption;

/**
 * Terminal font options - reuses UI_MONO_FONT_OPTIONS with terminal-specific default
 *
 * The 'default' value means "use the default terminal font" (Menlo/Monaco)
 */
export const TERMINAL_FONT_OPTIONS: readonly UIFontOption[] = UI_MONO_FONT_OPTIONS.map((option) => {
  // Replace the UI default label with terminal-specific default
  if (option.value === DEFAULT_FONT_VALUE) {
    return { value: option.value, label: 'Default (Menlo / Monaco)' };
  }
  return option;
});

/**
 * Default terminal font family
 * Uses the DEFAULT_FONT_VALUE sentinel which maps to Menlo/Monaco
 */
export const DEFAULT_TERMINAL_FONT = DEFAULT_FONT_VALUE;

/**
 * Get the actual font family CSS value for terminal
 * Converts DEFAULT_FONT_VALUE to the actual Menlo/Monaco font stack
 */
export function getTerminalFontFamily(fontValue: string | undefined): string {
  if (!fontValue || fontValue === DEFAULT_FONT_VALUE) {
    return "Menlo, Monaco, 'Courier New', monospace";
  }
  return fontValue;
}

// Dark theme (default)
const darkTheme: TerminalTheme = {
  background: '#0a0a0a',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#0a0a0a',
  selectionBackground: '#264f78',
  black: '#1e1e1e',
  red: '#f44747',
  green: '#6a9955',
  yellow: '#dcdcaa',
  blue: '#569cd6',
  magenta: '#c586c0',
  cyan: '#4ec9b0',
  white: '#d4d4d4',
  brightBlack: '#808080',
  brightRed: '#f44747',
  brightGreen: '#6a9955',
  brightYellow: '#dcdcaa',
  brightBlue: '#569cd6',
  brightMagenta: '#c586c0',
  brightCyan: '#4ec9b0',
  brightWhite: '#ffffff',
  // Search colors - bright yellow for visibility on dark background
  searchMatchBackground: '#6b5300',
  searchMatchBorder: '#e2ac00',
  searchActiveMatchBackground: '#ff8c00',
  searchActiveMatchBorder: '#ffb74d',
};

// Light theme
const lightTheme: TerminalTheme = {
  background: '#ffffff',
  foreground: '#383a42',
  cursor: '#383a42',
  cursorAccent: '#ffffff',
  selectionBackground: '#add6ff',
  black: '#383a42',
  red: '#e45649',
  green: '#50a14f',
  yellow: '#c18401',
  blue: '#4078f2',
  magenta: '#a626a4',
  cyan: '#0184bc',
  white: '#fafafa',
  brightBlack: '#4f525e',
  brightRed: '#e06c75',
  brightGreen: '#98c379',
  brightYellow: '#e5c07b',
  brightBlue: '#61afef',
  brightMagenta: '#c678dd',
  brightCyan: '#56b6c2',
  brightWhite: '#ffffff',
  // Search colors - darker for visibility on light background
  searchMatchBackground: '#fff3b0',
  searchMatchBorder: '#c9a500',
  searchActiveMatchBackground: '#ffcc00',
  searchActiveMatchBorder: '#996600',
};

// Retro / Cyberpunk theme - neon green on black
const retroTheme: TerminalTheme = {
  background: '#000000',
  foreground: '#39ff14',
  cursor: '#39ff14',
  cursorAccent: '#000000',
  selectionBackground: '#39ff14',
  selectionForeground: '#000000',
  black: '#000000',
  red: '#ff0055',
  green: '#39ff14',
  yellow: '#ffff00',
  blue: '#00ffff',
  magenta: '#ff00ff',
  cyan: '#00ffff',
  white: '#39ff14',
  brightBlack: '#555555',
  brightRed: '#ff5555',
  brightGreen: '#55ff55',
  brightYellow: '#ffff55',
  brightBlue: '#55ffff',
  brightMagenta: '#ff55ff',
  brightCyan: '#55ffff',
  brightWhite: '#ffffff',
  // Search colors - magenta/pink for contrast with green text
  searchMatchBackground: '#660066',
  searchMatchBorder: '#ff00ff',
  searchActiveMatchBackground: '#cc00cc',
  searchActiveMatchBorder: '#ff66ff',
};

// Dracula theme
const draculaTheme: TerminalTheme = {
  background: '#282a36',
  foreground: '#f8f8f2',
  cursor: '#f8f8f2',
  cursorAccent: '#282a36',
  selectionBackground: '#44475a',
  black: '#21222c',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#f8f8f2',
  brightBlack: '#6272a4',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#ffffff',
  // Search colors - orange for visibility
  searchMatchBackground: '#8b5a00',
  searchMatchBorder: '#ffb86c',
  searchActiveMatchBackground: '#ff9500',
  searchActiveMatchBorder: '#ffcc80',
};

// Nord theme
const nordTheme: TerminalTheme = {
  background: '#2e3440',
  foreground: '#d8dee9',
  cursor: '#d8dee9',
  cursorAccent: '#2e3440',
  selectionBackground: '#434c5e',
  black: '#3b4252',
  red: '#bf616a',
  green: '#a3be8c',
  yellow: '#ebcb8b',
  blue: '#81a1c1',
  magenta: '#b48ead',
  cyan: '#88c0d0',
  white: '#e5e9f0',
  brightBlack: '#4c566a',
  brightRed: '#bf616a',
  brightGreen: '#a3be8c',
  brightYellow: '#ebcb8b',
  brightBlue: '#81a1c1',
  brightMagenta: '#b48ead',
  brightCyan: '#8fbcbb',
  brightWhite: '#eceff4',
  // Search colors - warm yellow/orange for cold blue theme
  searchMatchBackground: '#5e4a00',
  searchMatchBorder: '#ebcb8b',
  searchActiveMatchBackground: '#d08770',
  searchActiveMatchBorder: '#e8a87a',
};

// Monokai theme
const monokaiTheme: TerminalTheme = {
  background: '#272822',
  foreground: '#f8f8f2',
  cursor: '#f8f8f2',
  cursorAccent: '#272822',
  selectionBackground: '#49483e',
  black: '#272822',
  red: '#f92672',
  green: '#a6e22e',
  yellow: '#f4bf75',
  blue: '#66d9ef',
  magenta: '#ae81ff',
  cyan: '#a1efe4',
  white: '#f8f8f2',
  brightBlack: '#75715e',
  brightRed: '#f92672',
  brightGreen: '#a6e22e',
  brightYellow: '#f4bf75',
  brightBlue: '#66d9ef',
  brightMagenta: '#ae81ff',
  brightCyan: '#a1efe4',
  brightWhite: '#f9f8f5',
  // Search colors - orange/gold for contrast
  searchMatchBackground: '#6b4400',
  searchMatchBorder: '#f4bf75',
  searchActiveMatchBackground: '#e69500',
  searchActiveMatchBorder: '#ffd080',
};

// Tokyo Night theme
const tokyonightTheme: TerminalTheme = {
  background: '#1a1b26',
  foreground: '#a9b1d6',
  cursor: '#c0caf5',
  cursorAccent: '#1a1b26',
  selectionBackground: '#33467c',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5',
  // Search colors - warm orange for cold blue theme
  searchMatchBackground: '#5c4a00',
  searchMatchBorder: '#e0af68',
  searchActiveMatchBackground: '#ff9e64',
  searchActiveMatchBorder: '#ffb380',
};

// Solarized Dark theme (improved contrast for WCAG compliance)
const solarizedTheme: TerminalTheme = {
  background: '#002b36',
  foreground: '#93a1a1', // Changed from #839496 (base0) to #93a1a1 (base1) for better contrast
  cursor: '#93a1a1',
  cursorAccent: '#002b36',
  selectionBackground: '#073642',
  black: '#073642',
  red: '#dc322f',
  green: '#859900',
  yellow: '#b58900',
  blue: '#268bd2',
  magenta: '#d33682',
  cyan: '#2aa198',
  white: '#eee8d5',
  brightBlack: '#002b36',
  brightRed: '#cb4b16',
  brightGreen: '#586e75',
  brightYellow: '#657b83',
  brightBlue: '#839496',
  brightMagenta: '#6c71c4',
  brightCyan: '#93a1a1',
  brightWhite: '#fdf6e3',
  // Search colors - orange (solarized orange) for visibility
  searchMatchBackground: '#5c3d00',
  searchMatchBorder: '#b58900',
  searchActiveMatchBackground: '#cb4b16',
  searchActiveMatchBorder: '#e07040',
};

// Gruvbox Dark theme
const gruvboxTheme: TerminalTheme = {
  background: '#282828',
  foreground: '#ebdbb2',
  cursor: '#ebdbb2',
  cursorAccent: '#282828',
  selectionBackground: '#504945',
  black: '#282828',
  red: '#cc241d',
  green: '#98971a',
  yellow: '#d79921',
  blue: '#458588',
  magenta: '#b16286',
  cyan: '#689d6a',
  white: '#a89984',
  brightBlack: '#928374',
  brightRed: '#fb4934',
  brightGreen: '#b8bb26',
  brightYellow: '#fabd2f',
  brightBlue: '#83a598',
  brightMagenta: '#d3869b',
  brightCyan: '#8ec07c',
  brightWhite: '#ebdbb2',
  // Search colors - bright orange for gruvbox
  searchMatchBackground: '#6b4500',
  searchMatchBorder: '#d79921',
  searchActiveMatchBackground: '#fe8019',
  searchActiveMatchBorder: '#ffaa40',
};

// Catppuccin Mocha theme
const catppuccinTheme: TerminalTheme = {
  background: '#1e1e2e',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  cursorAccent: '#1e1e2e',
  selectionBackground: '#45475a',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#cba6f7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#cba6f7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8',
  // Search colors - peach/orange from catppuccin palette
  searchMatchBackground: '#5c4020',
  searchMatchBorder: '#fab387',
  searchActiveMatchBackground: '#fab387',
  searchActiveMatchBorder: '#fcc8a0',
};

// One Dark theme
const onedarkTheme: TerminalTheme = {
  background: '#282c34',
  foreground: '#abb2bf',
  cursor: '#528bff',
  cursorAccent: '#282c34',
  selectionBackground: '#3e4451',
  black: '#282c34',
  red: '#e06c75',
  green: '#98c379',
  yellow: '#e5c07b',
  blue: '#61afef',
  magenta: '#c678dd',
  cyan: '#56b6c2',
  white: '#abb2bf',
  brightBlack: '#5c6370',
  brightRed: '#e06c75',
  brightGreen: '#98c379',
  brightYellow: '#e5c07b',
  brightBlue: '#61afef',
  brightMagenta: '#c678dd',
  brightCyan: '#56b6c2',
  brightWhite: '#ffffff',
  // Search colors - orange/gold for visibility
  searchMatchBackground: '#5c4500',
  searchMatchBorder: '#e5c07b',
  searchActiveMatchBackground: '#d19a66',
  searchActiveMatchBorder: '#e8b888',
};

// Synthwave '84 theme
const synthwaveTheme: TerminalTheme = {
  background: '#262335',
  foreground: '#ffffff',
  cursor: '#ff7edb',
  cursorAccent: '#262335',
  selectionBackground: '#463465',
  black: '#262335',
  red: '#fe4450',
  green: '#72f1b8',
  yellow: '#fede5d',
  blue: '#03edf9',
  magenta: '#ff7edb',
  cyan: '#03edf9',
  white: '#ffffff',
  brightBlack: '#614d85',
  brightRed: '#fe4450',
  brightGreen: '#72f1b8',
  brightYellow: '#f97e72',
  brightBlue: '#03edf9',
  brightMagenta: '#ff7edb',
  brightCyan: '#03edf9',
  brightWhite: '#ffffff',
  // Search colors - hot pink/magenta for synthwave aesthetic
  searchMatchBackground: '#6b2a7a',
  searchMatchBorder: '#ff7edb',
  searchActiveMatchBackground: '#ff7edb',
  searchActiveMatchBorder: '#ffffff',
};

// Red theme - Dark theme with red accents
const redTheme: TerminalTheme = {
  background: '#1a0a0a',
  foreground: '#c8b0b0',
  cursor: '#ff4444',
  cursorAccent: '#1a0a0a',
  selectionBackground: '#5a2020',
  black: '#2a1010',
  red: '#ff4444',
  green: '#6a9a6a',
  yellow: '#ccaa55',
  blue: '#6688aa',
  magenta: '#aa5588',
  cyan: '#558888',
  white: '#b0a0a0',
  brightBlack: '#6a4040',
  brightRed: '#ff6666',
  brightGreen: '#88bb88',
  brightYellow: '#ddbb66',
  brightBlue: '#88aacc',
  brightMagenta: '#cc77aa',
  brightCyan: '#77aaaa',
  brightWhite: '#d0c0c0',
  // Search colors - orange/gold to contrast with red theme
  searchMatchBackground: '#5a3520',
  searchMatchBorder: '#ccaa55',
  searchActiveMatchBackground: '#ddbb66',
  searchActiveMatchBorder: '#ffdd88',
};

// Cream theme - Warm, soft, easy on the eyes
const creamTheme: TerminalTheme = {
  background: '#f5f3ee',
  foreground: '#5a4a3a',
  cursor: '#9d6b53',
  cursorAccent: '#f5f3ee',
  selectionBackground: '#d4c4b0',
  black: '#5a4a3a',
  red: '#c85a4f',
  green: '#7a9a6a',
  yellow: '#c9a554',
  blue: '#6b8aaa',
  magenta: '#a66a8a',
  cyan: '#5a9a8a',
  white: '#b0a090',
  brightBlack: '#8a7a6a',
  brightRed: '#e07060',
  brightGreen: '#90b080',
  brightYellow: '#e0bb70',
  brightBlue: '#80a0c0',
  brightMagenta: '#c080a0',
  brightCyan: '#70b0a0',
  brightWhite: '#d0c0b0',
  // Search colors - blue for contrast on light cream background
  searchMatchBackground: '#c0d4e8',
  searchMatchBorder: '#6b8aaa',
  searchActiveMatchBackground: '#6b8aaa',
  searchActiveMatchBorder: '#4a6a8a',
};

// Sunset theme - Mellow oranges and soft pastels
const sunsetTheme: TerminalTheme = {
  background: '#1e1a24',
  foreground: '#f2e8dd',
  cursor: '#dd8855',
  cursorAccent: '#1e1a24',
  selectionBackground: '#3a2a40',
  black: '#1e1a24',
  red: '#dd6655',
  green: '#88bb77',
  yellow: '#ddaa66',
  blue: '#6699cc',
  magenta: '#cc7799',
  cyan: '#66ccaa',
  white: '#e8d8c8',
  brightBlack: '#4a3a50',
  brightRed: '#ee8866',
  brightGreen: '#99cc88',
  brightYellow: '#eebb77',
  brightBlue: '#88aadd',
  brightMagenta: '#dd88aa',
  brightCyan: '#88ddbb',
  brightWhite: '#f5e8dd',
  // Search colors - orange for warm sunset theme
  searchMatchBackground: '#5a3a30',
  searchMatchBorder: '#ddaa66',
  searchActiveMatchBackground: '#eebb77',
  searchActiveMatchBorder: '#ffdd99',
};

// Gray theme - Modern, minimal gray scheme inspired by Cursor
const grayTheme: TerminalTheme = {
  background: '#2a2d32',
  foreground: '#d0d0d5',
  cursor: '#8fa0c0',
  cursorAccent: '#2a2d32',
  selectionBackground: '#3a3f48',
  black: '#2a2d32',
  red: '#d87070',
  green: '#78b088',
  yellow: '#d0b060',
  blue: '#7090c0',
  magenta: '#a880b0',
  cyan: '#60a0b0',
  white: '#b0b0b8',
  brightBlack: '#606068',
  brightRed: '#e88888',
  brightGreen: '#90c8a0',
  brightYellow: '#e0c878',
  brightBlue: '#90b0d8',
  brightMagenta: '#c098c8',
  brightCyan: '#80b8c8',
  brightWhite: '#e0e0e8',
  // Search colors - blue for modern feel
  searchMatchBackground: '#3a4a60',
  searchMatchBorder: '#7090c0',
  searchActiveMatchBackground: '#90b0d8',
  searchActiveMatchBorder: '#b0d0f0',
};

// Theme mapping
const terminalThemes: Record<ThemeMode, TerminalTheme> = {
  // Special
  system: darkTheme, // Will be resolved at runtime
  // Dark themes
  dark: darkTheme,
  retro: retroTheme,
  dracula: draculaTheme,
  nord: nordTheme,
  monokai: monokaiTheme,
  tokyonight: tokyonightTheme,
  solarized: solarizedTheme,
  gruvbox: gruvboxTheme,
  catppuccin: catppuccinTheme,
  onedark: onedarkTheme,
  synthwave: synthwaveTheme,
  red: redTheme,
  sunset: sunsetTheme,
  gray: grayTheme,
  forest: gruvboxTheme, // Green-ish theme, gruvbox is close
  ocean: nordTheme, // Blue-ish theme, nord is close
  ember: monokaiTheme, // Warm orange theme, monokai is close
  'ayu-dark': darkTheme, // Deep dark with warm accents
  'ayu-mirage': darkTheme, // Soft dark with golden accents
  matcha: nordTheme, // Calming blue-gray with sage green
  // Light themes
  light: lightTheme,
  cream: creamTheme,
  solarizedlight: lightTheme, // TODO: Create dedicated solarized light terminal theme
  github: lightTheme, // TODO: Create dedicated github terminal theme
  paper: lightTheme,
  rose: lightTheme,
  mint: lightTheme,
  lavender: lightTheme,
  sand: creamTheme, // Warm tones like cream
  sky: lightTheme,
  peach: creamTheme, // Warm tones like cream
  snow: lightTheme,
  sepia: creamTheme, // Warm tones like cream
  gruvboxlight: creamTheme, // Warm light theme
  nordlight: lightTheme, // Cool light theme
  blossom: lightTheme,
  'ayu-light': lightTheme, // Clean light with orange accents
  onelight: lightTheme, // Atom One Light - blue accent
  bluloco: lightTheme, // Bluloco - cyan-blue accent
  feather: lightTheme, // Feather - orange accent
};

/**
 * Get terminal theme for the given app theme
 * For "system" theme, it checks the user's system preference
 */
export function getTerminalTheme(theme: ThemeMode): TerminalTheme {
  if (theme === 'system') {
    // Check system preference
    if (typeof window !== 'undefined') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? darkTheme : lightTheme;
    }
    return darkTheme; // Default to dark for SSR
  }
  return terminalThemes[theme] || darkTheme;
}

export default terminalThemes;
