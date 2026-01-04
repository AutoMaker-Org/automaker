import type { AgentModel, ModelProvider } from '@/store/app-store';
import {
  CLAUDE_MODELS,
  CURSOR_MODELS,
  OPENCODE_MODELS,
  CODEX_MODELS,
} from '@/components/views/board-view/shared/model-constants';

// Helper to determine provider from model
export function getProviderFromModel(model: AgentModel): ModelProvider {
  if (CODEX_MODELS.some((option) => option.id === model)) {
    return 'codex';
  }
  if (OPENCODE_MODELS.some((option) => option.id === model)) {
    return 'opencode';
  }
  if (CURSOR_MODELS.some((option) => option.id === model)) {
    return 'cursor';
  }
  if (CLAUDE_MODELS.some((option) => option.id === model)) {
    return 'claude';
  }
  return 'claude';
}
