import type { AgentModel } from '@automaker/types';

export function autoSwitchModelIfDisabled(
  currentModel: AgentModel | null | undefined,
  enabledProviders: { claude: boolean; zai: boolean }
): AgentModel {
  // If no model selected, default to sonnet
  if (!currentModel) return 'sonnet';

  // Get all models from model-constants
  const CLAUDE_MODELS: Array<{ id: AgentModel; badge?: string }> = [
    { id: 'haiku', badge: 'Speed' },
    { id: 'sonnet', badge: 'Balanced' },
    { id: 'opus', badge: 'Premium' },
  ];

  const ZAI_MODELS: Array<{ id: AgentModel; badge?: string }> = [
    { id: 'glm-4.7', badge: 'Premium' },
    { id: 'glm-4.6v', badge: 'Vision' },
    { id: 'glm-4.6', badge: 'Balanced' },
    { id: 'glm-4.5-air', badge: 'Speed' },
  ];

  const ALL_MODELS_INFO = [...CLAUDE_MODELS, ...ZAI_MODELS];

  // Get provider of current model
  const currentModelInfo = ALL_MODELS_INFO.find((m) => m.id === currentModel);
  if (!currentModelInfo) return 'sonnet';

  // Check if model provider is enabled
  const isClaudeModel = CLAUDE_MODELS.some((m) => m.id === currentModel);
  const isZaiModel = ZAI_MODELS.some((m) => m.id === currentModel);

  const providerEnabled = isClaudeModel ? enabledProviders.claude : enabledProviders.zai;

  // If provider is enabled, keep current model
  if (providerEnabled) return currentModel;

  // Find equivalent model from enabled provider
  const equivalentModel = ALL_MODELS_INFO.find(
    (m) =>
      // Different provider
      (isClaudeModel ? ZAI_MODELS : CLAUDE_MODELS).includes(m) &&
      // Same badge tier
      m.badge === currentModelInfo.badge &&
      // Provider is enabled
      (isClaudeModel ? enabledProviders.zai : enabledProviders.claude)
  );

  // If equivalent model found, use it
  if (equivalentModel) return equivalentModel.id;

  // Fallback to any enabled provider model
  const fallbackModel = ALL_MODELS_INFO.find((m) => {
    const modelIsClaude = CLAUDE_MODELS.some((cm) => cm.id === m.id);
    return modelIsClaude ? enabledProviders.claude : enabledProviders.zai;
  });

  if (fallbackModel) return fallbackModel.id;

  // Ultimate fallback
  return 'sonnet';
}
