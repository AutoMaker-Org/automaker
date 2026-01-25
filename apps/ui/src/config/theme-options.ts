import {
  type LucideIcon,
  Atom,
  Cat,
  Cherry,
  CloudSun,
  Coffee,
  Eclipse,
  Feather,
  Flame,
  Flower2,
  Ghost,
  Github,
  Heart,
  Leaf,
  Moon,
  Palmtree,
  Radio,
  Scroll,
  Snowflake,
  Sparkles,
  Square,
  Sun,
  Sunrise,
  Terminal,
  Trees,
  Waves,
  Wind,
} from 'lucide-react';

// Theme value type - all available themes
export type Theme =
  // Dark themes (16)
  | 'dark'
  | 'retro'
  | 'dracula'
  | 'nord'
  | 'monokai'
  | 'tokyonight'
  | 'solarized'
  | 'gruvbox'
  | 'catppuccin'
  | 'onedark'
  | 'synthwave'
  | 'red'
  | 'sunset'
  | 'gray'
  | 'forest'
  | 'ocean'
  | 'ember'
  | 'ayu-dark'
  | 'ayu-mirage'
  | 'matcha'
  // Light themes
  | 'light'
  | 'cream'
  | 'solarizedlight'
  | 'github'
  | 'paper'
  | 'rose'
  | 'mint'
  | 'lavender'
  | 'sand'
  | 'sky'
  | 'peach'
  | 'snow'
  | 'sepia'
  | 'gruvboxlight'
  | 'nordlight'
  | 'blossom'
  | 'ayu-light'
  | 'onelight'
  | 'bluloco'
  | 'feather';

export interface ThemeOption {
  value: Theme;
  label: string;
  Icon: LucideIcon;
  testId: string;
  isDark: boolean;
  color: string; // Primary/brand color for icon display
}

// All theme options with dark/light categorization (alphabetically sorted, Dark/Light first)
export const themeOptions: ReadonlyArray<ThemeOption> = [
  // Dark themes (20) - alphabetical, Dark first
  {
    value: 'dark',
    label: 'Dark',
    Icon: Moon,
    testId: 'dark-mode-button',
    isDark: true,
    color: '#3b82f6',
  },
  {
    value: 'ayu-dark',
    label: 'Ayu Dark',
    Icon: Moon,
    testId: 'ayu-dark-mode-button',
    isDark: true,
    color: '#E6B450',
  },
  {
    value: 'ayu-mirage',
    label: 'Ayu Mirage',
    Icon: Sparkles,
    testId: 'ayu-mirage-mode-button',
    isDark: true,
    color: '#FFCC66',
  },
  {
    value: 'catppuccin',
    label: 'Catppuccin',
    Icon: Cat,
    testId: 'catppuccin-mode-button',
    isDark: true,
    color: '#cba6f7',
  },
  {
    value: 'dracula',
    label: 'Dracula',
    Icon: Ghost,
    testId: 'dracula-mode-button',
    isDark: true,
    color: '#bd93f9',
  },
  {
    value: 'ember',
    label: 'Ember',
    Icon: Sunrise,
    testId: 'ember-mode-button',
    isDark: true,
    color: '#fd971f',
  },
  {
    value: 'forest',
    label: 'Forest',
    Icon: Leaf,
    testId: 'forest-mode-button',
    isDark: true,
    color: '#22c55e',
  },
  {
    value: 'gray',
    label: 'Gray',
    Icon: Square,
    testId: 'gray-mode-button',
    isDark: true,
    color: '#6b7280',
  },
  {
    value: 'gruvbox',
    label: 'Gruvbox',
    Icon: Trees,
    testId: 'gruvbox-mode-button',
    isDark: true,
    color: '#fe8019',
  },
  {
    value: 'matcha',
    label: 'Matcha',
    Icon: Leaf,
    testId: 'matcha-mode-button',
    isDark: true,
    color: '#A4B07E',
  },
  {
    value: 'monokai',
    label: 'Monokai',
    Icon: Flame,
    testId: 'monokai-mode-button',
    isDark: true,
    color: '#f92672',
  },
  {
    value: 'nord',
    label: 'Nord',
    Icon: Snowflake,
    testId: 'nord-mode-button',
    isDark: true,
    color: '#88c0d0',
  },
  {
    value: 'ocean',
    label: 'Ocean',
    Icon: Waves,
    testId: 'ocean-mode-button',
    isDark: true,
    color: '#06b6d4',
  },
  {
    value: 'onedark',
    label: 'One Dark',
    Icon: Atom,
    testId: 'onedark-mode-button',
    isDark: true,
    color: '#61afef',
  },
  {
    value: 'red',
    label: 'Red',
    Icon: Heart,
    testId: 'red-mode-button',
    isDark: true,
    color: '#ef4444',
  },
  {
    value: 'retro',
    label: 'Retro',
    Icon: Terminal,
    testId: 'retro-mode-button',
    isDark: true,
    color: '#22c55e',
  },
  {
    value: 'solarized',
    label: 'Solarized Dark',
    Icon: Eclipse,
    testId: 'solarized-mode-button',
    isDark: true,
    color: '#268bd2',
  },
  {
    value: 'sunset',
    label: 'Sunset',
    Icon: CloudSun,
    testId: 'sunset-mode-button',
    isDark: true,
    color: '#f97316',
  },
  {
    value: 'synthwave',
    label: 'Synthwave',
    Icon: Radio,
    testId: 'synthwave-mode-button',
    isDark: true,
    color: '#ff7edb',
  },
  {
    value: 'tokyonight',
    label: 'Tokyo Night',
    Icon: Sparkles,
    testId: 'tokyonight-mode-button',
    isDark: true,
    color: '#bb9af7',
  },
  // Light themes (20) - alphabetical, Light first
  {
    value: 'light',
    label: 'Light',
    Icon: Sun,
    testId: 'light-mode-button',
    isDark: false,
    color: '#3b82f6',
  },
  {
    value: 'ayu-light',
    label: 'Ayu Light',
    Icon: Sun,
    testId: 'ayu-light-mode-button',
    isDark: false,
    color: '#F29718',
  },
  {
    value: 'blossom',
    label: 'Blossom',
    Icon: Cherry,
    testId: 'blossom-mode-button',
    isDark: false,
    color: '#ec4899',
  },
  {
    value: 'bluloco',
    label: 'Bluloco',
    Icon: Waves,
    testId: 'bluloco-mode-button',
    isDark: false,
    color: '#0099e1',
  },
  {
    value: 'cream',
    label: 'Cream',
    Icon: Coffee,
    testId: 'cream-mode-button',
    isDark: false,
    color: '#b45309',
  },
  {
    value: 'feather',
    label: 'Feather',
    Icon: Feather,
    testId: 'feather-mode-button',
    isDark: false,
    color: '#FF7B2E',
  },
  {
    value: 'github',
    label: 'GitHub',
    Icon: Github,
    testId: 'github-mode-button',
    isDark: false,
    color: '#0969da',
  },
  {
    value: 'gruvboxlight',
    label: 'Gruvbox Light',
    Icon: Trees,
    testId: 'gruvboxlight-mode-button',
    isDark: false,
    color: '#d65d0e',
  },
  {
    value: 'lavender',
    label: 'Lavender',
    Icon: Feather,
    testId: 'lavender-mode-button',
    isDark: false,
    color: '#8b5cf6',
  },
  {
    value: 'mint',
    label: 'Mint',
    Icon: Wind,
    testId: 'mint-mode-button',
    isDark: false,
    color: '#0d9488',
  },
  {
    value: 'nordlight',
    label: 'Nord Light',
    Icon: Snowflake,
    testId: 'nordlight-mode-button',
    isDark: false,
    color: '#5e81ac',
  },
  {
    value: 'onelight',
    label: 'One Light',
    Icon: Atom,
    testId: 'onelight-mode-button',
    isDark: false,
    color: '#526FFF',
  },
  {
    value: 'paper',
    label: 'Paper',
    Icon: Scroll,
    testId: 'paper-mode-button',
    isDark: false,
    color: '#374151',
  },
  {
    value: 'peach',
    label: 'Peach',
    Icon: Cherry,
    testId: 'peach-mode-button',
    isDark: false,
    color: '#ea580c',
  },
  {
    value: 'rose',
    label: 'Rose',
    Icon: Flower2,
    testId: 'rose-mode-button',
    isDark: false,
    color: '#e11d48',
  },
  {
    value: 'sand',
    label: 'Sand',
    Icon: Palmtree,
    testId: 'sand-mode-button',
    isDark: false,
    color: '#d97706',
  },
  {
    value: 'sepia',
    label: 'Sepia',
    Icon: Coffee,
    testId: 'sepia-mode-button',
    isDark: false,
    color: '#92400e',
  },
  {
    value: 'sky',
    label: 'Sky',
    Icon: Sun,
    testId: 'sky-mode-button',
    isDark: false,
    color: '#0284c7',
  },
  {
    value: 'snow',
    label: 'Snow',
    Icon: Snowflake,
    testId: 'snow-mode-button',
    isDark: false,
    color: '#3b82f6',
  },
  {
    value: 'solarizedlight',
    label: 'Solarized Light',
    Icon: Sunrise,
    testId: 'solarizedlight-mode-button',
    isDark: false,
    color: '#268bd2',
  },
];

// Helper: Get only dark themes
export const darkThemes = themeOptions.filter((t) => t.isDark);

// Helper: Get only light themes
export const lightThemes = themeOptions.filter((t) => !t.isDark);
