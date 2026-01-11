import { useState, useCallback, useEffect } from 'react';
import { Link2, Eye, EyeOff, CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function LinearSettings() {
  const { apiKeys, setApiKeys, linearSettings, setLinearSettings } = useAppStore();
  const [linearKey, setLinearKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    user?: string;
    organization?: string;
    error?: string;
  } | null>(null);

  // Initialize from stored key
  useEffect(() => {
    if (apiKeys.linear) {
      // Show masked value if we have a stored key
      setLinearKey('');
    }
  }, [apiKeys.linear]);

  const handleTest = useCallback(async () => {
    const api = getElectronAPI();
    if (!api.linear) {
      setTestResult({ success: false, error: 'Linear API not available' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      // First save the key if changed
      if (linearKey) {
        const saveResult = await api.settings?.updateCredentials?.({
          apiKeys: {
            ...apiKeys,
            linear: linearKey,
          },
        });

        if (!saveResult?.success) {
          setTestResult({ success: false, error: 'Failed to save API key' });
          setTesting(false);
          return;
        }
      }

      // Then test connection
      const result = await api.linear.checkConnection();

      if (result.connected) {
        setTestResult({
          success: true,
          user: result.user?.name,
          organization: result.organization?.name,
        });
        setApiKeys({ ...apiKeys, linear: linearKey || apiKeys.linear });
      } else {
        setTestResult({ success: false, error: result.error });
      }
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  }, [linearKey, apiKeys, setApiKeys]);

  const handleSave = useCallback(async () => {
    const api = getElectronAPI();
    if (!api.settings?.updateCredentials) {
      toast.error('Settings API not available');
      return;
    }

    setSaving(true);
    try {
      const result = await api.settings.updateCredentials({
        apiKeys: {
          ...apiKeys,
          linear: linearKey,
        },
      });

      if (result.success) {
        setApiKeys({ ...apiKeys, linear: linearKey });
        toast.success('Linear API key saved');
        setLinearKey('');
      } else {
        toast.error(result.error || 'Failed to save API key');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save API key');
    } finally {
      setSaving(false);
    }
  }, [linearKey, apiKeys, setApiKeys]);

  const handleDelete = useCallback(async () => {
    const api = getElectronAPI();
    if (!api.settings?.updateCredentials) {
      toast.error('Settings API not available');
      return;
    }

    try {
      const result = await api.settings.updateCredentials({
        apiKeys: {
          ...apiKeys,
          linear: '',
        },
      });

      if (result.success) {
        setApiKeys({ ...apiKeys, linear: '' });
        setLinearKey('');
        setTestResult(null);
        toast.success('Linear API key deleted');
      } else {
        toast.error(result.error || 'Failed to delete API key');
      }
    } catch {
      toast.error('Failed to delete API key');
    }
  }, [apiKeys, setApiKeys]);

  const hasStoredKey = !!apiKeys.linear;

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
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center border border-indigo-500/20">
            <Link2 className="w-5 h-5 text-indigo-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Linear Integration
          </h2>
          {hasStoredKey && <CheckCircle2 className="w-5 h-5 text-green-500" />}
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Connect to Linear to import issues as features to your Kanban board.
        </p>
      </div>

      <div className="p-6 space-y-4">
        {/* API Key Input */}
        <div className="space-y-2">
          <Label htmlFor="linear-key">Linear API Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="linear-key"
                type={showKey ? 'text' : 'password'}
                placeholder={hasStoredKey ? '••••••••••••••••' : 'lin_api_...'}
                value={linearKey}
                onChange={(e) => setLinearKey(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <Button
              onClick={handleTest}
              disabled={(!linearKey && !hasStoredKey) || testing}
              variant="outline"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test Connection'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Get your API key from{' '}
            <a
              href="https://linear.app/settings/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              linear.app/settings/api
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>

        {/* Test Result */}
        {testResult && (
          <div
            className={cn(
              'flex items-start gap-2 p-3 rounded-lg',
              testResult.success ? 'bg-green-500/10' : 'bg-red-500/10'
            )}
          >
            {testResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            )}
            <div className="text-sm">
              {testResult.success ? (
                <>
                  <p className="font-medium text-green-500">Connected successfully!</p>
                  <p className="text-muted-foreground">
                    Signed in as {testResult.user} ({testResult.organization})
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-red-500">Connection failed</p>
                  <p className="text-muted-foreground">{testResult.error}</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          {linearKey && (
            <Button
              onClick={handleSave}
              disabled={saving || !linearKey}
              className={cn(
                'min-w-[100px]',
                'bg-gradient-to-r from-indigo-500 to-indigo-600',
                'hover:from-indigo-600 hover:to-indigo-600',
                'text-white font-medium border-0'
              )}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Key'}
            </Button>
          )}

          {hasStoredKey && (
            <Button
              onClick={handleDelete}
              variant="outline"
              className="border-red-500/30 text-red-500 hover:bg-red-500/10"
            >
              Delete Key
            </Button>
          )}
        </div>

        {/* Connection Status - always show when key is configured */}
        {hasStoredKey && !testResult && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
            <span className="text-sm font-medium text-green-600">Linear API key is configured</span>
          </div>
        )}

        {/* Auto-Validate Filters Section */}
        {hasStoredKey && (
          <div className="space-y-4 pt-4 border-t border-border/50">
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">Auto-Validate Filters</h3>
              <p className="text-xs text-muted-foreground">
                Configure which issues should be automatically validated when Auto-Validate is
                enabled.
              </p>
            </div>

            {/* My Issues Only Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-validate-my-issues" className="text-sm font-normal">
                  My Issues Only
                </Label>
                <p className="text-xs text-muted-foreground">Only validate issues assigned to me</p>
              </div>
              <Switch
                id="auto-validate-my-issues"
                checked={linearSettings.autoValidateMyIssuesOnly}
                onCheckedChange={(checked) =>
                  setLinearSettings({ autoValidateMyIssuesOnly: checked })
                }
              />
            </div>

            {/* Label Filter */}
            <div className="space-y-2">
              <Label htmlFor="auto-validate-label" className="text-sm font-normal">
                Label Filter
              </Label>
              <Input
                id="auto-validate-label"
                placeholder="e.g., bug, feature, urgent"
                value={linearSettings.autoValidateLabelFilter}
                onChange={(e) => setLinearSettings({ autoValidateLabelFilter: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Only validate issues with labels containing this text (leave empty for all)
              </p>
            </div>

            {/* State Types Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-normal">State Types</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Only validate issues in these states (leave all unchecked for all states)
              </p>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="state-backlog"
                    checked={linearSettings.autoValidateStateTypes.includes('backlog')}
                    onCheckedChange={(checked) => {
                      const current = linearSettings.autoValidateStateTypes;
                      const updated = checked
                        ? [...current, 'backlog' as const]
                        : current.filter((s) => s !== 'backlog');
                      setLinearSettings({ autoValidateStateTypes: updated });
                    }}
                  />
                  <Label htmlFor="state-backlog" className="text-sm font-normal cursor-pointer">
                    Backlog
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="state-unstarted"
                    checked={linearSettings.autoValidateStateTypes.includes('unstarted')}
                    onCheckedChange={(checked) => {
                      const current = linearSettings.autoValidateStateTypes;
                      const updated = checked
                        ? [...current, 'unstarted' as const]
                        : current.filter((s) => s !== 'unstarted');
                      setLinearSettings({ autoValidateStateTypes: updated });
                    }}
                  />
                  <Label htmlFor="state-unstarted" className="text-sm font-normal cursor-pointer">
                    Unstarted
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="state-started"
                    checked={linearSettings.autoValidateStateTypes.includes('started')}
                    onCheckedChange={(checked) => {
                      const current = linearSettings.autoValidateStateTypes;
                      const updated = checked
                        ? [...current, 'started' as const]
                        : current.filter((s) => s !== 'started');
                      setLinearSettings({ autoValidateStateTypes: updated });
                    }}
                  />
                  <Label htmlFor="state-started" className="text-sm font-normal cursor-pointer">
                    In Progress
                  </Label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
