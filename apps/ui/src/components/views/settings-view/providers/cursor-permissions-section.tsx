import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Shield, ShieldCheck, ShieldAlert, ChevronDown, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CursorStatus } from '../hooks/use-cursor-status';
import type { PermissionsData } from '../hooks/use-cursor-permissions';

interface CursorPermissionsSectionProps {
  status: CursorStatus | null;
  permissions: PermissionsData | null;
  isLoadingPermissions: boolean;
  isSavingPermissions: boolean;
  copiedConfig: boolean;
  currentProject?: { path: string } | null;
  onApplyProfile: (
    profileId: 'strict' | 'development',
    scope: 'global' | 'project'
  ) => Promise<void>;
  onCopyConfig: (profileId: 'strict' | 'development') => Promise<void>;
  onLoadPermissions: () => Promise<void>;
}

export function CursorPermissionsSection({
  status,
  permissions,
  isLoadingPermissions,
  isSavingPermissions,
  copiedConfig,
  currentProject,
  onApplyProfile,
  onCopyConfig,
  onLoadPermissions,
}: CursorPermissionsSectionProps) {
  const [permissionsExpanded, setPermissionsExpanded] = useState(false);

  // Load permissions when section is expanded
  useEffect(() => {
    if (permissionsExpanded && status?.installed && !permissions) {
      onLoadPermissions();
    }
  }, [permissionsExpanded, status?.installed, permissions, onLoadPermissions]);

  if (!status?.installed) {
    return null;
  }

  return (
    <Collapsible open={permissionsExpanded} onOpenChange={setPermissionsExpanded}>
      <div
        className={cn(
          'rounded-2xl overflow-hidden',
          'border border-border/50',
          'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm shadow-black/5'
        )}
      >
        <CollapsibleTrigger className="w-full">
          <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/20">
                <Shield className="w-5 h-5 text-amber-500" />
              </div>
              <div className="text-left">
                <h2 className="text-lg font-semibold text-foreground tracking-tight">
                  CLI Permissions
                </h2>
                <p className="text-sm text-muted-foreground/80">Configure what Cursor CLI can do</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {permissions?.activeProfile && (
                <Badge
                  variant="outline"
                  className={cn(
                    permissions.activeProfile === 'strict'
                      ? 'border-green-500/50 text-green-500'
                      : permissions.activeProfile === 'development'
                        ? 'border-blue-500/50 text-blue-500'
                        : 'border-amber-500/50 text-amber-500'
                  )}
                >
                  {permissions.activeProfile === 'strict' && (
                    <ShieldCheck className="w-3 h-3 mr-1" />
                  )}
                  {permissions.activeProfile === 'development' && (
                    <ShieldAlert className="w-3 h-3 mr-1" />
                  )}
                  {permissions.activeProfile}
                </Badge>
              )}
              <ChevronDown
                className={cn(
                  'w-5 h-5 text-muted-foreground transition-transform',
                  permissionsExpanded && 'rotate-180'
                )}
              />
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-6 space-y-6">
            {/* Security Warning */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-400/90">
                <span className="font-medium">Security Notice</span>
                <p className="text-xs text-amber-400/70 mt-1">
                  Cursor CLI can execute shell commands based on its permission config. For
                  overnight automation, consider using the Strict profile to limit what commands can
                  run.
                </p>
              </div>
            </div>

            {isLoadingPermissions ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
              </div>
            ) : (
              <>
                {/* Permission Profiles */}
                <div className="space-y-3">
                  <Label>Permission Profiles</Label>
                  <div className="grid gap-3">
                    {permissions?.availableProfiles.map((profile) => (
                      <div
                        key={profile.id}
                        className={cn(
                          'p-4 rounded-xl border transition-colors',
                          permissions.activeProfile === profile.id
                            ? 'border-brand-500/50 bg-brand-500/5'
                            : 'border-border/50 bg-card/50 hover:bg-accent/30'
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {profile.id === 'strict' ? (
                                <ShieldCheck className="w-4 h-4 text-green-500" />
                              ) : (
                                <ShieldAlert className="w-4 h-4 text-blue-500" />
                              )}
                              <span className="font-medium">{profile.name}</span>
                              {permissions.activeProfile === profile.id && (
                                <Badge variant="secondary" className="text-xs">
                                  Active
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">
                              {profile.description}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="text-green-500">
                                {profile.permissions.allow.length} allowed
                              </span>
                              <span className="text-muted-foreground/50">|</span>
                              <span className="text-red-500">
                                {profile.permissions.deny.length} denied
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              variant={
                                permissions.activeProfile === profile.id ? 'secondary' : 'default'
                              }
                              disabled={
                                isSavingPermissions || permissions.activeProfile === profile.id
                              }
                              onClick={() =>
                                onApplyProfile(profile.id as 'strict' | 'development', 'global')
                              }
                            >
                              Apply Globally
                            </Button>
                            {currentProject && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isSavingPermissions}
                                onClick={() =>
                                  onApplyProfile(profile.id as 'strict' | 'development', 'project')
                                }
                              >
                                Apply to Project
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Config File Location */}
                <div className="space-y-3">
                  <Label>Config File Locations</Label>
                  <div className="p-4 rounded-xl border border-border/50 bg-card/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Global Config</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          ~/.cursor/cli-config.json
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => onCopyConfig('development')}>
                        {copiedConfig ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <div className="border-t border-border/30 pt-2">
                      <p className="text-sm font-medium">Project Config</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        &lt;project&gt;/.cursor/cli.json
                      </p>
                      {permissions?.hasProjectConfig && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          Project override active
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Documentation Link */}
                <div className="text-xs text-muted-foreground">
                  Learn more about{' '}
                  <a
                    href="https://cursor.com/docs/cli/reference/permissions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-500 hover:underline"
                  >
                    Cursor CLI permissions
                  </a>
                </div>
              </>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
