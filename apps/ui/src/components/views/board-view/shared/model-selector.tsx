import { Label } from '@/components/ui/label';
import { Brain, MousePointer2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentModel } from '@/store/app-store';
import { CLAUDE_MODELS, CURSOR_MODELS, ModelOption } from './model-constants';

interface ModelSelectorProps {
  selectedModel: AgentModel;
  onModelSelect: (model: AgentModel) => void;
  testIdPrefix?: string;
  showCursor?: boolean;
}

function ModelGroup({
  label,
  icon: Icon,
  badge,
  badgeColor = 'primary',
  models,
  selectedModel,
  onModelSelect,
  testIdPrefix,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge: string;
  badgeColor?: 'primary' | 'cyan';
  models: ModelOption[];
  selectedModel: AgentModel;
  onModelSelect: (model: AgentModel) => void;
  testIdPrefix: string;
}) {
  const colorClasses = {
    primary: {
      icon: 'text-primary',
      badge: 'border-primary/40 text-primary',
      selected: 'bg-primary text-primary-foreground border-primary',
    },
    cyan: {
      icon: 'text-cyan-500',
      badge: 'border-cyan-500/40 text-cyan-500',
      selected: 'bg-cyan-600 text-white border-cyan-600',
    },
  };

  const colors = colorClasses[badgeColor];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', colors.icon)} />
          {label}
        </Label>
        <span className={cn('text-[11px] px-2 py-0.5 rounded-full border', colors.badge)}>
          {badge}
        </span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {models.map((option) => {
          const isSelected = selectedModel === option.id;
          // Extract short name from label
          const shortName = option.label
            .replace('Claude ', '')
            .replace('Cursor ', '')
            .replace(' 4', '')
            .replace(' Thinking', ' Think');
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onModelSelect(option.id)}
              title={option.description}
              className={cn(
                'flex-1 min-w-[80px] px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                isSelected ? colors.selected : 'bg-background hover:bg-accent border-input'
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

export function ModelSelector({
  selectedModel,
  onModelSelect,
  testIdPrefix = 'model-select',
  showCursor = true,
}: ModelSelectorProps) {
  return (
    <div className="space-y-4">
      {/* Claude Models */}
      <ModelGroup
        label="Claude (SDK)"
        icon={Brain}
        badge="Native"
        badgeColor="primary"
        models={CLAUDE_MODELS}
        selectedModel={selectedModel}
        onModelSelect={onModelSelect}
        testIdPrefix={testIdPrefix}
      />

      {/* Cursor Models */}
      {showCursor && (
        <ModelGroup
          label="Cursor Agent"
          icon={MousePointer2}
          badge="CLI"
          badgeColor="cyan"
          models={CURSOR_MODELS}
          selectedModel={selectedModel}
          onModelSelect={onModelSelect}
          testIdPrefix={testIdPrefix}
        />
      )}
    </div>
  );
}
