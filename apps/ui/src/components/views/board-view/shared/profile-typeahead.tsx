import * as React from 'react';
import { Check, ChevronsUpDown, UserCircle, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import type { AIProfile } from '@automaker/types';
import { CURSOR_MODEL_MAP, profileHasThinking, getCodexModelLabel } from '@automaker/types';
import { PROVIDER_ICON_COMPONENTS } from '@/components/ui/provider-icon';

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
  if (profile.provider === 'opencode') {
    // Extract a short label from the opencode model
    const modelId = profile.opencodeModel || '';
    if (modelId.includes('/')) {
      const parts = modelId.split('/');
      return parts[parts.length - 1].split('.')[0] || modelId;
    }
    return modelId;
  }
  // Claude
  return profile.model || 'sonnet';
}

/**
 * Get display string for a profile's thinking configuration
 */
function getProfileThinkingDisplay(profile: AIProfile): string | null {
  if (profile.provider === 'cursor' || profile.provider === 'codex') {
    return profileHasThinking(profile) ? 'thinking' : null;
  }
  // Claude
  return profile.thinkingLevel && profile.thinkingLevel !== 'none' ? profile.thinkingLevel : null;
}

interface ProfileTypeaheadProps {
  profiles: AIProfile[];
  selectedProfileId?: string;
  onSelect: (profile: AIProfile) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  showManageLink?: boolean;
  onManageLinkClick?: () => void;
  testIdPrefix?: string;
}

export function ProfileTypeahead({
  profiles,
  selectedProfileId,
  onSelect,
  placeholder = 'Select profile...',
  className,
  disabled = false,
  showManageLink = false,
  onManageLinkClick,
  testIdPrefix = 'profile-typeahead',
}: ProfileTypeaheadProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const [triggerWidth, setTriggerWidth] = React.useState<number>(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const selectedProfile = React.useMemo(
    () => profiles.find((p) => p.id === selectedProfileId),
    [profiles, selectedProfileId]
  );

  // Update trigger width when component mounts or value changes
  React.useEffect(() => {
    if (triggerRef.current) {
      const updateWidth = () => {
        setTriggerWidth(triggerRef.current?.offsetWidth || 0);
      };
      updateWidth();
      const resizeObserver = new ResizeObserver(updateWidth);
      resizeObserver.observe(triggerRef.current);
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [selectedProfileId]);

  // Filter profiles based on input
  const filteredProfiles = React.useMemo(() => {
    if (!inputValue) return profiles;
    const lower = inputValue.toLowerCase();
    return profiles.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        p.description?.toLowerCase().includes(lower) ||
        p.provider.toLowerCase().includes(lower)
    );
  }, [profiles, inputValue]);

  const handleSelect = (profile: AIProfile) => {
    onSelect(profile);
    setInputValue('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between h-9', className)}
          data-testid={`${testIdPrefix}-trigger`}
        >
          <span className="flex items-center gap-2 truncate">
            {selectedProfile ? (
              <>
                {(() => {
                  const ProviderIcon = PROVIDER_ICON_COMPONENTS[selectedProfile.provider];
                  return ProviderIcon ? (
                    <ProviderIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <UserCircle className="w-4 h-4 shrink-0 text-muted-foreground" />
                  );
                })()}
                <span className="truncate">{selectedProfile.name}</span>
              </>
            ) : (
              <>
                <UserCircle className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">{placeholder}</span>
              </>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: Math.max(triggerWidth, 280) }}
        data-testid={`${testIdPrefix}-content`}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search profiles..."
            className="h-9"
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No profile found.</CommandEmpty>
            <CommandGroup>
              {filteredProfiles.map((profile) => {
                const ProviderIcon = PROVIDER_ICON_COMPONENTS[profile.provider];
                const isSelected = profile.id === selectedProfileId;
                const modelDisplay = getProfileModelDisplay(profile);
                const thinkingDisplay = getProfileThinkingDisplay(profile);

                return (
                  <CommandItem
                    key={profile.id}
                    value={profile.id}
                    onSelect={() => handleSelect(profile)}
                    className="flex items-center gap-2 py-2"
                    data-testid={`${testIdPrefix}-option-${profile.id}`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {ProviderIcon ? (
                        <ProviderIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <UserCircle className="w-4 h-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-sm font-medium truncate">{profile.name}</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {modelDisplay}
                          {thinkingDisplay && (
                            <span className="text-amber-500"> + {thinkingDisplay}</span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {profile.isBuiltIn && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Built-in
                        </Badge>
                      )}
                      <Check className={cn('h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {showManageLink && onManageLinkClick && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setOpen(false);
                      onManageLinkClick();
                    }}
                    className="text-muted-foreground"
                    data-testid={`${testIdPrefix}-manage-link`}
                  >
                    <Settings2 className="w-4 h-4 mr-2" />
                    Manage AI Profiles
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
