import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn, modelSupportsThinking } from '@/lib/utils';
import { DialogFooter } from '@/components/ui/dialog';
import { Brain } from 'lucide-react';
import { toast } from 'sonner';
import type { AIProfile, AgentModel, ThinkingLevel } from '@/store/app-store';
import { ALL_MODELS, THINKING_LEVELS, ICON_OPTIONS } from '../constants';
import { getProviderFromModel } from '../utils';

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
  const [formData, setFormData] = useState({
    name: profile.name || '',
    description: profile.description || '',
    model: profile.model || ('opus' as AgentModel),
    thinkingLevel: profile.thinkingLevel || ('none' as ThinkingLevel),
    icon: profile.icon || 'Brain',
  });

  const provider = getProviderFromModel(formData.model);
  const supportsThinking = modelSupportsThinking(formData.model);

  const handleModelChange = (model: AgentModel) => {
    setFormData({
      ...formData,
      model,
    });
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a profile name');
      return;
    }

    onSave({
      name: formData.name.trim(),
      description: formData.description.trim(),
      model: formData.model,
      thinkingLevel: supportsThinking ? formData.thinkingLevel : 'none',
      provider,
      isBuiltIn: false,
      icon: formData.icon,
    });
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

        {/* Model Selection */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            Model
          </Label>
          <div className="flex gap-2 flex-wrap">
            {ALL_MODELS.map(({ id, label }) => (
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

        {/* Thinking Level */}
        {supportsThinking && (
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
