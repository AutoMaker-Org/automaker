import type { AgentModel, ModelProvider } from '@automaker/types';

// Helper to determine provider from model
export function getProviderFromModel(model: AgentModel): ModelProvider {
  if (
    model === 'glm' ||
    model === 'glm-4.6v' ||
    model === 'glm-4.6' ||
    model === 'glm-4.7' ||
    model === 'glm-4.5-air'
  ) {
    return 'zai';
  }
  return 'claude';
}
