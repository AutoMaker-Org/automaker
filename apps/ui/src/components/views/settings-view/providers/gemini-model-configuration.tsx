import type { GeminiModelId } from '@automaker/types';
import { GeminiIcon } from '@/components/ui/provider-icon';
import { GEMINI_MODEL_MAP } from '@automaker/types';
import { BaseModelConfiguration, type BaseModelInfo } from './shared/base-model-configuration';

interface GeminiModelConfigurationProps {
  enabledGeminiModels: GeminiModelId[];
  geminiDefaultModel: GeminiModelId;
  isSaving: boolean;
  onDefaultModelChange: (model: GeminiModelId) => void;
  onModelToggle: (model: GeminiModelId, enabled: boolean) => void;
}

interface GeminiModelInfo extends BaseModelInfo<GeminiModelId> {
  supportsThinking: boolean;
}

// Build model info from the GEMINI_MODEL_MAP
const GEMINI_MODELS: GeminiModelInfo[] = Object.entries(GEMINI_MODEL_MAP).map(([id, config]) => ({
  id: id as GeminiModelId,
  label: config.label,
  description: config.description,
  supportsThinking: config.supportsThinking,
}));

export function GeminiModelConfiguration({
  enabledGeminiModels,
  geminiDefaultModel,
  isSaving,
  onDefaultModelChange,
  onModelToggle,
}: GeminiModelConfigurationProps) {
  return (
    <BaseModelConfiguration<GeminiModelId>
      providerName="Gemini"
      icon={<GeminiIcon className="w-5 h-5 text-blue-500" />}
      iconGradient="from-blue-500/20 to-blue-600/10"
      iconBorder="border-blue-500/20"
      models={GEMINI_MODELS}
      enabledModels={enabledGeminiModels}
      defaultModel={geminiDefaultModel}
      isSaving={isSaving}
      onDefaultModelChange={onDefaultModelChange}
      onModelToggle={onModelToggle}
      getFeatureBadge={(model) => {
        const geminiModel = model as GeminiModelInfo;
        return geminiModel.supportsThinking ? { show: true, label: 'Thinking' } : null;
      }}
    />
  );
}
