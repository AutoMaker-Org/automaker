// Shared TypeScript types for settings view components

export interface CliStatus {
  success: boolean;
  status?: string;
  method?: string;
  version?: string;
  path?: string;
  hasApiKey?: boolean;
  recommendation?: string;
  installCommands?: {
    macos?: string;
    windows?: string;
    linux?: string;
    npm?: string;
  };
  error?: string;
}

export type Theme =
  | "dark"
  | "light"
  | "retro"
  | "dracula"
  | "nord"
  | "monokai"
  | "tokyonight"
  | "solarized"
  | "gruvbox"
  | "catppuccin"
  | "onedark"
  | "synthwave";

export type KanbanDetailLevel = "minimal" | "standard" | "detailed";

export interface Project {
  id: string;
  name: string;
  path: string;
  theme?: Theme;
}

export interface ApiKeys {
  anthropic: string;
  google: string;
  openai: string;
}
