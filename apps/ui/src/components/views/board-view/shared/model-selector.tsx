import { Label } from '@/components/ui/label';
import { Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentModel, useAppStore } from '@/store/app-store';
import { getFilteredModels, ModelOption } from './model-constants';

interface ModelSelectorProps {
  selectedModel: AgentModel;
  onModelSelect: (model: AgentModel) => void;
  testIdPrefix?: string;
}

export function ModelSelector({
  selectedModel,
  onModelSelect,
  testIdPrefix = 'model-select',
}: ModelSelectorProps) {
  const enabledProviders = useAppStore((state) => state.enabledProviders);
  const filteredModels = getFilteredModels(enabledProviders);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          AI Model
        </Label>
        <span className="text-[11px] px-2 py-0.5 rounded-full border border-primary/40 text-primary">
          Native
        </span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {filteredModels.map((option) => {
          const isSelected = selectedModel === option.id;
          const shortName = option.label.replace('Claude ', '').replace('GLM-', 'GLM ');
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onModelSelect(option.id)}
              title={option.description}
              className={cn(
                'flex-1 min-w-[80px] px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                isSelected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-accent border-input'
              )}
              data-testid={`${testIdPrefix}-${option.id}`}
            >
              {shortName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
