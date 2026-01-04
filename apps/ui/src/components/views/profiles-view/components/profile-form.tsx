import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn, modelSupportsThinking } from '@/lib/utils';
import { DialogFooter } from '@/components/ui/dialog';
import { Brain, Bot, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import type {
  AIProfile,
  ModelAlias,
  ThinkingLevel,
  ModelProvider,
  CursorModelId,
} from '@automaker/types';
import { CURSOR_MODEL_MAP, cursorModelHasThinking } from '@automaker/types';
import { useAppStore } from '@/store/app-store';
import { CLAUDE_MODELS, THINKING_LEVELS, ICON_OPTIONS } from '../constants';

interface ProfileFormProps {
  profile: Partial<AIProfile>;
  onSave: (profile: Omit<AIProfile, 'id'>) => void;
  onCancel: () => void;
  isEditing: boolean;
  hotkeyActive: boolean;
}

export function ProfileForm({
  profile,
  onSave,
  onCancel,
  isEditing,
  hotkeyActive,
}: ProfileFormProps) {
  const { enabledCursorModels } = useAppStore();

  const [formData, setFormData] = useState({
    name: profile.name || '',
    description: profile.description || '',
    provider: (profile.provider || 'claude') as ModelProvider,
    // Claude-specific
    model: profile.model || ('sonnet' as ModelAlias),
    thinkingLevel: profile.thinkingLevel || ('none' as ThinkingLevel),
    // Cursor-specific
    cursorModel: profile.cursorModel || ('auto' as CursorModelId),
    icon: profile.icon || 'Brain',
  });

  const supportsThinking = formData.provider === 'claude' && modelSupportsThinking(formData.model);

  const handleProviderChange = (provider: ModelProvider) => {
    setFormData({
      ...formData,
      provider,
      // Reset to defaults when switching providers
      model: provider === 'claude' ? 'sonnet' : formData.model,
      thinkingLevel: provider === 'claude' ? 'none' : formData.thinkingLevel,
      cursorModel: provider === 'cursor' ? 'auto' : formData.cursorModel,
    });
  };

  const handleModelChange = (model: ModelAlias) => {
    setFormData({
      ...formData,
      model,
    });
  };

  const handleCursorModelChange = (cursorModel: CursorModelId) => {
    setFormData({
      ...formData,
      cursorModel,
    });
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a profile name');
      return;
    }

    const baseProfile = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      provider: formData.provider,
      isBuiltIn: false,
      icon: formData.icon,
    };

    if (formData.provider === 'cursor') {
      onSave({
        ...baseProfile,
        cursorModel: formData.cursorModel,
      });
    } else {
      onSave({
        ...baseProfile,
        model: formData.model,
        thinkingLevel: supportsThinking ? formData.thinkingLevel : 'none',
      });
    }
  };

  return (
    <>
      <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-3 -mr-3 pl-1">
        {/* Name */}
        <div className="mt-2 space-y-2">
          <Label htmlFor="profile-name">Profile Name</Label>
          <Input
            id="profile-name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Heavy Task, Quick Fix"
            data-testid="profile-name-input"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="profile-description">Description</Label>
          <Textarea
            id="profile-description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Describe when to use this profile..."
            rows={2}
            data-testid="profile-description-input"
          />
        </div>

        {/* Icon Selection */}
        <div className="space-y-2">
          <Label>Icon</Label>
          <div className="flex gap-2 flex-wrap">
            {ICON_OPTIONS.map(({ name, icon: Icon }) => (
              <button
                key={name}
                type="button"
                onClick={() => setFormData({ ...formData, icon: name })}
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center border transition-colors',
                  formData.icon === name
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                )}
                data-testid={`icon-select-${name}`}
              >
                <Icon className="w-5 h-5" />
              </button>
            ))}
          </div>
        </div>

        {/* Provider Selection */}
        <div className="space-y-2">
          <Label>AI Provider</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleProviderChange('claude')}
              className={cn(
                'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2',
                formData.provider === 'claude'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-accent border-border'
              )}
              data-testid="provider-select-claude"
            >
              <Bot className="w-4 h-4" />
              Claude
            </button>
            <button
              type="button"
              onClick={() => handleProviderChange('cursor')}
              className={cn(
                'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2',
                formData.provider === 'cursor'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-accent border-border'
              )}
              data-testid="provider-select-cursor"
            >
              <Terminal className="w-4 h-4" />
              Cursor CLI
            </button>
          </div>
        </div>

        {/* Claude Model Selection */}
        {formData.provider === 'claude' && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              Model
            </Label>
            <div className="flex gap-2 flex-wrap">
              {CLAUDE_MODELS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleModelChange(id)}
                  className={cn(
                    'flex-1 min-w-[100px] px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                    formData.model === id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-accent border-border'
                  )}
                  data-testid={`model-select-${id}`}
                >
                  {label.replace('Claude ', '')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cursor Model Selection */}
        {formData.provider === 'cursor' && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" />
              Cursor Model
            </Label>
            <div className="flex flex-col gap-2">
              {enabledCursorModels.length === 0 ? (
                <div className="text-sm text-muted-foreground p-3 border border-dashed rounded-md text-center">
                  No Cursor models enabled. Enable models in Settings → AI Providers.
                </div>
              ) : (
                Object.entries(CURSOR_MODEL_MAP)
                  .filter(([id]) => enabledCursorModels.includes(id as CursorModelId))
                  .map(([id, config]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleCursorModelChange(id as CursorModelId)}
                      className={cn(
                        'w-full px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-between',
                        formData.cursorModel === id
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-accent border-border'
                      )}
                      data-testid={`cursor-model-select-${id}`}
                    >
                      <span>{config.label}</span>
                      <div className="flex gap-1">
                        {config.hasThinking && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              formData.cursorModel === id
                                ? 'border-primary-foreground/50 text-primary-foreground'
                                : 'border-amber-500/50 text-amber-600 dark:text-amber-400'
                            )}
                          >
                            Thinking
                          </Badge>
                        )}
                        <Badge
                          variant={config.tier === 'free' ? 'default' : 'secondary'}
                          className={cn(
                            'text-xs',
                            formData.cursorModel === id && 'bg-primary-foreground/20'
                          )}
                        >
                          {config.tier}
                        </Badge>
                      </div>
                    </button>
                  ))
              )}
            </div>
            {formData.cursorModel && cursorModelHasThinking(formData.cursorModel) && (
              <p className="text-xs text-muted-foreground">
                This model has built-in extended thinking capabilities.
              </p>
            )}
          </div>
        )}

        {/* Claude Thinking Level */}
        {formData.provider === 'claude' && supportsThinking && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-amber-500" />
              Thinking Level
            </Label>
            <div className="flex gap-2 flex-wrap">
              {THINKING_LEVELS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, thinkingLevel: id });
                    if (id === 'ultrathink') {
                      toast.warning('Ultrathink uses extensive reasoning', {
                        description:
                          'Best for complex architecture, migrations, or deep debugging (~$0.48/task).',
                        duration: 4000,
                      });
                    }
                  }}
                  className={cn(
                    'flex-1 min-w-[70px] px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                    formData.thinkingLevel === id
                      ? 'bg-amber-500 text-white border-amber-400'
                      : 'bg-background hover:bg-accent border-border'
                  )}
                  data-testid={`thinking-select-${id}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Higher levels give more time to reason through complex problems.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <DialogFooter className="pt-4 border-t border-border mt-4 shrink-0">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <HotkeyButton
          onClick={handleSubmit}
          hotkey={{ key: 'Enter', cmdCtrl: true }}
          hotkeyActive={hotkeyActive}
          data-testid="save-profile-button"
        >
          {isEditing ? 'Save Changes' : 'Create Profile'}
        </HotkeyButton>
      </DialogFooter>
    </>
  );
}
