import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Bot, Cloud, Server, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Project } from '@/lib/electron';

interface ProjectClaudeSectionProps {
  project: Project;
}

export function ProjectClaudeSection({ project }: ProjectClaudeSectionProps) {
  const {
    claudeApiProfiles,
    activeClaudeApiProfileId: globalActiveProfileId,
    disabledProviders,
    setProjectClaudeApiProfile,
  } = useAppStore();
  const { claudeAuthStatus } = useSetupStore();

  // Get project-level override from project
  const projectActiveProfileId = project.activeClaudeApiProfileId;

  // Determine effective value for display
  // undefined = use global, null = explicit direct, string = specific profile
  const selectValue =
    projectActiveProfileId === undefined
      ? 'global'
      : projectActiveProfileId === null
        ? 'direct'
        : projectActiveProfileId;

  // Check if Claude is available
  const isClaudeDisabled = disabledProviders.includes('claude');
  const hasProfiles = claudeApiProfiles.length > 0;
  const isClaudeAuthenticated = claudeAuthStatus?.authenticated;

  // Get global profile name for display
  const globalProfile = globalActiveProfileId
    ? claudeApiProfiles.find((p) => p.id === globalActiveProfileId)
    : null;
  const globalProfileName = globalProfile?.name || 'Direct Anthropic API';

  const handleChange = (value: string) => {
    // 'global' -> undefined (use global)
    // 'direct' -> null (explicit direct)
    // profile id -> string (specific profile)
    const newValue = value === 'global' ? undefined : value === 'direct' ? null : value;
    setProjectClaudeApiProfile(project.id, newValue);
  };

  // Don't render if Claude is disabled or not available
  if (isClaudeDisabled || (!hasProfiles && !isClaudeAuthenticated)) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">Claude not configured</p>
        <p className="text-xs mt-1">
          Enable Claude and configure providers in global settings to use per-project overrides.
        </p>
      </div>
    );
  }

  // Get the display text for current selection
  const getDisplayText = () => {
    if (selectValue === 'global') {
      return `Using global setting: ${globalProfileName}`;
    }
    if (selectValue === 'direct') {
      return 'Using direct Anthropic API (API key or Claude Max plan)';
    }
    const selectedProfile = claudeApiProfiles.find((p) => p.id === selectValue);
    return `Using ${selectedProfile?.name || 'custom'} endpoint`;
  };

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
            <Bot className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Claude Provider</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Override the Claude provider for this project only.
        </p>
      </div>

      <div className="p-6 space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Active Provider for This Project</Label>
          <Select value={selectValue} onValueChange={handleChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <span>Use Global Setting</span>
                  <span className="text-xs text-muted-foreground ml-1">({globalProfileName})</span>
                </div>
              </SelectItem>
              <SelectItem value="direct">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-brand-500" />
                  <span>Direct Anthropic API</span>
                </div>
              </SelectItem>
              {claudeApiProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-muted-foreground" />
                    <span>{profile.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{getDisplayText()}</p>
        </div>

        {/* Info about what this affects */}
        <div className="text-xs text-muted-foreground/70 pt-2 border-t border-border/30">
          <p>This setting affects all Claude operations for this project including:</p>
          <ul className="list-disc list-inside mt-1 space-y-0.5">
            <li>Agent chat and feature implementation</li>
            <li>Code analysis and suggestions</li>
            <li>Commit message generation</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
