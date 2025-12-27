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
  auth?: {
    authenticated: boolean;
    method: string;
    hasApiKey?: boolean;
    apiKeyValid?: boolean;
    hasEnvApiKey?: boolean;
  };
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
