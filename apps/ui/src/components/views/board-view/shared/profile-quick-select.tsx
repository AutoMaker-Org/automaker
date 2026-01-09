import { Label } from '@/components/ui/label';
import { Brain, UserCircle, Terminal } from 'lucide-react';
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

interface ProfileQuickSelectProps {
  profiles: AIProfile[];
  selectedModel: ModelAlias | CursorModelId;
  selectedThinkingLevel: ThinkingLevel;
  selectedCursorModel?: string; // For detecting cursor profile selection
  onSelect: (profile: AIProfile) => void; // Changed to pass full profile
  testIdPrefix?: string;
  showManageLink?: boolean;
  onManageLinkClick?: () => void;
}

export function ProfileQuickSelect({
  profiles,
  selectedModel,
  selectedThinkingLevel,
  selectedCursorModel,
  onSelect,
  testIdPrefix = 'profile-quick-select',
  showManageLink = false,
  onManageLinkClick,
}: ProfileQuickSelectProps) {
  // Show both Claude and Cursor profiles
  const allProfiles = profiles;

  if (allProfiles.length === 0) {
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <UserCircle className="w-4 h-4 text-brand-500" />
          Quick Select Profile
        </Label>
        <span className="text-[11px] px-2 py-0.5 rounded-full border border-brand-500/40 text-brand-500">
          Presets
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {allProfiles.slice(0, 6).map((profile) => {
          const IconComponent = profile.icon ? PROFILE_ICONS[profile.icon] : Brain;
          const isSelected = isProfileSelected(profile);
          const isCursorProfile = profile.provider === 'cursor';

          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => onSelect(profile)}
              className={cn(
                'flex items-center gap-2 p-2 rounded-lg border text-left transition-all',
                isSelected
                  ? 'bg-brand-500/10 border-brand-500 text-foreground'
                  : 'bg-background hover:bg-accent border-input'
              )}
              data-testid={`${testIdPrefix}-${profile.id}`}
            >
              <div
                className={cn(
                  'w-7 h-7 rounded flex items-center justify-center shrink-0',
                  isCursorProfile ? 'bg-amber-500/10' : 'bg-primary/10'
                )}
              >
                {isCursorProfile ? (
                  <Terminal className="w-4 h-4 text-amber-500" />
                ) : (
                  IconComponent && <IconComponent className="w-4 h-4 text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{profile.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {getProfileModelDisplay(profile)}
                  {getProfileThinkingDisplay(profile) && ` + ${getProfileThinkingDisplay(profile)}`}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Or customize below.
        {showManageLink && onManageLinkClick && (
          <>
            {' '}
            Manage profiles in{' '}
            <button
              type="button"
              onClick={onManageLinkClick}
              className="text-brand-500 hover:underline"
            >
              AI Profiles
            </button>
          </>
        )}
      </p>
    </div>
  );
}
