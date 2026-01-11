// Shared TypeScript types for settings view components
// Theme type is now imported from the central theme-options config
export { type Theme } from '@/config/theme-options';

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

export type KanbanDetailLevel = 'minimal' | 'standard' | 'detailed';

export interface Project {
  id: string;
  name: string;
  path: string;
  theme?: string;
}

export interface ApiKeys {
  anthropic: string;
  google: string;
  openai: string;
}

// Single provider endpoint configuration
export interface CustomEndpointConfig {
  provider: 'zhipu' | 'minimax' | 'manual';
  baseUrl: string;
  apiKey: string;
  model: string;
}

// Per-provider endpoint configurations (stores separate API keys for each provider)
export interface CustomEndpointConfigs {
  zhipu?: {
    apiKey: string;
    model?: string; // Optional default model override
  };
  minimax?: {
    apiKey: string;
    model?: string;
  };
  manual?: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  // Currently selected provider (for settings UI)
  selectedProvider?: 'zhipu' | 'minimax' | 'manual';
}
