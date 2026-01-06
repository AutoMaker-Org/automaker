/**
 * Skills Section - UI for managing Skills configuration
 *
 * Allows users to enable/disable Skills and select which directories
 * to load Skills from (user ~/.claude/skills/ or project .claude/skills/).
 */

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Zap, Globe, FolderOpen, ExternalLink, Sparkles } from 'lucide-react';
import { useSkillsSettings } from './hooks/use-skills-settings';

export function SkillsSection() {
  const { enabled, sources, updateEnabled, updateSources, isLoading } = useSkillsSettings();

  const toggleSource = (source: 'user' | 'project') => {
    if (sources.includes(source)) {
      updateSources(sources.filter((s: 'user' | 'project') => s !== source));
    } else {
      updateSources([...sources, source]);
    }
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-linear-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border/30">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              Skills
              {enabled && (
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500">
                  {sources.length} source{sources.length !== 1 ? 's' : ''} active
                </span>
              )}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Filesystem-based capabilities Claude invokes autonomously
            </p>
          </div>
        </div>
        <Switch
          id="enable-skills"
          checked={enabled}
          onCheckedChange={updateEnabled}
          disabled={isLoading}
        />
      </div>

      {/* Content */}
      <div className="p-6 space-y-4">
        {/* Sources Selection */}
        {enabled && (
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Load Skills from
            </Label>
            <div className="grid gap-2">
              {/* User Skills Option */}
              <label
                htmlFor="source-user"
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200',
                  sources.includes('user')
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : 'border-border/50 bg-accent/20 hover:bg-accent/30'
                )}
              >
                <Checkbox
                  id="source-user"
                  checked={sources.includes('user')}
                  onCheckedChange={() => toggleSource('user')}
                  disabled={isLoading}
                  className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                />
                <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">User Skills</span>
                  <span className="block text-xs text-muted-foreground mt-0.5 truncate">
                    ~/.claude/skills/ — Available across all projects
                  </span>
                </div>
              </label>

              {/* Project Skills Option */}
              <label
                htmlFor="source-project"
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200',
                  sources.includes('project')
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : 'border-border/50 bg-accent/20 hover:bg-accent/30'
                )}
              >
                <Checkbox
                  id="source-project"
                  checked={sources.includes('project')}
                  onCheckedChange={() => toggleSource('project')}
                  disabled={isLoading}
                  className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                />
                <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <FolderOpen className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">Project Skills</span>
                  <span className="block text-xs text-muted-foreground mt-0.5 truncate">
                    .claude/skills/ — Version-controlled with project
                  </span>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Help Text */}
        {enabled && (
          <div className="rounded-xl border border-border/30 bg-muted/30 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-md bg-brand-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-500" />
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground/80">Auto-Discovery</p>
                <p>
                  Skills are automatically discovered when agents start. Define skills as{' '}
                  <code className="text-xs bg-muted px-1 rounded">SKILL.md</code> files.
                </p>
              </div>
            </div>
            <a
              href="https://code.claude.com/docs/en/skills"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-brand-500 hover:text-brand-400 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Skills documentation
            </a>
          </div>
        )}

        {/* Disabled State Empty Message */}
        {!enabled && (
          <div className="text-center py-6 text-muted-foreground">
            <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Skills are disabled</p>
            <p className="text-xs mt-1">Enable to load filesystem-based capabilities</p>
          </div>
        )}
      </div>
    </div>
  );
}
