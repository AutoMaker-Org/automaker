import type { ModelProvider } from '@automaker/types';
import { CLAUDE_MODELS, CURSOR_MODELS, type ModelOption } from './model-constants';

export interface ProviderConfig {
  id: ModelProvider;
  name: string;
  badge: string;
  badgeColor: 'primary' | 'cyan';
  models: ModelOption[];
  description?: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'claude',
    name: 'Claude (SDK)',
    badge: 'Native',
    badgeColor: 'primary',
    models: CLAUDE_MODELS,
    description: 'Native SDK integration with Claude models',
  },
  {
    id: 'cursor',
    name: 'Cursor Agent',
    badge: 'CLI',
    badgeColor: 'cyan',
    models: CURSOR_MODELS,
    description: 'CLI-based Cursor Agent integration',
  },
];
