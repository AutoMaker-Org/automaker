import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Brain, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModelAlias, ThinkingLevel, AIProfile, CursorModelId } from '@automaker/types';
import {
  CURSOR_MODEL_MAP,
  profileHasThinking,
  PROVIDER_PREFIXES,
  getCodexModelLabel,
} from '@automaker/types';
import { PROFILE_ICONS } from './model-constants';

/**
 * Get display string for a profile's model configuration
 */
function getProfileModelDisplay(profile: AIProfile): string {
  if (profile.provider === 'cursor') {
    const cursorModel = profile.cursorModel || 'auto';
    const modelConfig = CURSOR_MODEL_MAP[cursorModel];
    return modelConfig?.label || cursorModel;
  }
  if (profile.provider === 'codex') {
    return getCodexModelLabel(profile.codexModel || 'codex-gpt-5.2-codex');
  }
  // Claude
  return profile.model || 'sonnet';
}

/**
 * Get display string for a profile's thinking configuration
 */
function getProfileThinkingDisplay(profile: AIProfile): string | null {
  if (profile.provider === 'cursor') {
    // For Cursor, thinking is embedded in the model
    return profileHasThinking(profile) ? 'thinking' : null;
  }
  if (profile.provider === 'codex') {
    // For Codex, thinking is embedded in the model
    return profileHasThinking(profile) ? 'thinking' : null;
  }
  // Claude
  return profile.thinkingLevel && profile.thinkingLevel !== 'none' ? profile.thinkingLevel : null;
}

interface ProfileSelectProps {
  profiles: AIProfile[];
  selectedModel: ModelAlias | CursorModelId;
  selectedThinkingLevel: ThinkingLevel;
  selectedCursorModel?: string; // For detecting cursor profile selection
  onSelect: (profile: AIProfile) => void;
  testIdPrefix?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * ProfileSelect - Compact dropdown selector for AI profiles
 *
 * A lightweight alternative to ProfileQuickSelect for contexts where
 * space is limited (e.g., mass edit, bulk operations).
 *
 * Shows icon + profile name in dropdown, with model details below.
 *
 * @example
 * ```tsx
 * <ProfileSelect
 *   profiles={aiProfiles}
 *   selectedModel={model}
 *   selectedThinkingLevel={thinkingLevel}
 *   selectedCursorModel={isCurrentModelCursor ? model : undefined}
 *   onSelect={handleProfileSelect}
 *   testIdPrefix="mass-edit-profile"
 * />
 * ```
 */
export function ProfileSelect({
  profiles,
  selectedModel,
  selectedThinkingLevel,
  selectedCursorModel,
  onSelect,
  testIdPrefix = 'profile-select',
  className,
  disabled = false,
}: ProfileSelectProps) {
  if (profiles.length === 0) {
    return null;
  }

  // Check if a profile is selected
  const isProfileSelected = (profile: AIProfile): boolean => {
    if (profile.provider === 'cursor') {
      // For cursor profiles, check if cursor model matches
      const profileCursorModel = `${PROVIDER_PREFIXES.cursor}${profile.cursorModel || 'auto'}`;
      return selectedCursorModel === profileCursorModel;
    }
    // For Claude profiles
    return selectedModel === profile.model && selectedThinkingLevel === profile.thinkingLevel;
  };

  const selectedProfile = profiles.find(isProfileSelected);

  return (
    <div className={cn('space-y-2', className)}>
      <Select
        value={selectedProfile?.id || 'none'}
        onValueChange={(value: string) => {
          if (value !== 'none') {
            const profile = profiles.find((p) => p.id === value);
            if (profile) {
              onSelect(profile);
            }
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger className="h-9" data-testid={`${testIdPrefix}-select-trigger`}>
          <SelectValue>
            {selectedProfile ? (
              <div className="flex items-center gap-2">
                {selectedProfile.provider === 'cursor' ? (
                  <Terminal className="h-4 w-4 text-amber-500" />
                ) : (
                  (() => {
                    const IconComponent = selectedProfile.icon
                      ? PROFILE_ICONS[selectedProfile.icon]
                      : Brain;
                    return <IconComponent className="h-4 w-4 text-primary" />;
                  })()
                )}
                <span>{selectedProfile.name}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">Select a profile...</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" className="text-muted-foreground">
            No profile selected
          </SelectItem>
          {profiles.map((profile) => {
            const isCursorProfile = profile.provider === 'cursor';
            const IconComponent = profile.icon ? PROFILE_ICONS[profile.icon] : Brain;

            return (
              <SelectItem
                key={profile.id}
                value={profile.id}
                data-testid={`${testIdPrefix}-option-${profile.id}`}
              >
                <div className="flex items-center gap-2">
                  {isCursorProfile ? (
                    <Terminal className="h-3.5 w-3.5 text-amber-500" />
                  ) : (
                    <IconComponent className="h-3.5 w-3.5 text-primary" />
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm">{profile.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {getProfileModelDisplay(profile)}
                      {getProfileThinkingDisplay(profile) &&
                        ` + ${getProfileThinkingDisplay(profile)}`}
                    </span>
                  </div>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {selectedProfile && (
        <p className="text-xs text-muted-foreground">
          {getProfileModelDisplay(selectedProfile)}
          {getProfileThinkingDisplay(selectedProfile) &&
            ` + ${getProfileThinkingDisplay(selectedProfile)}`}
        </p>
      )}
    </div>
  );
}
