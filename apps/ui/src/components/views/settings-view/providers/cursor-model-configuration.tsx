import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CursorModelId, CursorModelConfig } from '@automaker/types';
import { CURSOR_MODEL_MAP } from '@automaker/types';

interface CursorModelConfigurationProps {
  enabledCursorModels: CursorModelId[];
  cursorDefaultModel: CursorModelId;
  isSaving: boolean;
  onDefaultModelChange: (model: CursorModelId) => void;
  onModelToggle: (model: CursorModelId, enabled: boolean) => void;
}

export function CursorModelConfiguration({
  enabledCursorModels,
  cursorDefaultModel,
  isSaving,
  onDefaultModelChange,
  onModelToggle,
}: CursorModelConfigurationProps) {
  // All available models from the model map
  const availableModels: CursorModelConfig[] = Object.values(CURSOR_MODEL_MAP);

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <Terminal className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Model Configuration
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure which Cursor models are available in the feature modal
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* Default Model */}
        <div className="space-y-2">
          <Label>Default Model</Label>
          <Select
            value={cursorDefaultModel}
            onValueChange={(v) => onDefaultModelChange(v as CursorModelId)}
            disabled={isSaving}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {enabledCursorModels.map((modelId) => {
                const model = CURSOR_MODEL_MAP[modelId];
                if (!model) return null;
                return (
                  <SelectItem key={modelId} value={modelId}>
                    <div className="flex items-center gap-2">
                      <span>{model.label}</span>
                      {model.hasThinking && (
                        <Badge variant="outline" className="text-xs">
                          Thinking
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Enabled Models */}
        <div className="space-y-3">
          <Label>Available Models</Label>
          <div className="grid gap-3">
            {availableModels.map((model) => {
              const isEnabled = enabledCursorModels.includes(model.id);
              // With canonical IDs, 'auto' becomes 'cursor-auto'
              const isAuto = model.id === 'cursor-auto';

              return (
                <div
                  key={model.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-card/50 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={isEnabled}
                      onCheckedChange={(checked) => onModelToggle(model.id, !!checked)}
                      disabled={isSaving || isAuto}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{model.label}</span>
                        {model.hasThinking && (
                          <Badge variant="outline" className="text-xs">
                            Thinking
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{model.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
