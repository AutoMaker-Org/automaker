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
  const [maskedKey, setMaskedKey] = useState<string>('');
  const [testResult, setTestResult] = useState<{
    success: boolean;
    user?: string;
    organization?: string;
    error?: string;
  } | null>(null);

  // Load masked key on mount when key is configured
  useEffect(() => {
    const loadMaskedKey = async () => {
      if (apiKeys.linear) {
        const api = getElectronAPI();
        try {
          const result = await api.settings?.getCredentials?.();
          if (result?.success && result.credentials?.linear.masked) {
            setMaskedKey(result.credentials.linear.masked);
          }
        } catch {
          // Ignore errors
        }
      }
    };
    loadMaskedKey();
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
          apiKeys: { linear: linearKey },
        });

        if (!saveResult?.success) {
          setTestResult({ success: false, error: 'Failed to save API key' });
          setTesting(false);
          return;
        }

        // Update store with new configured status
        if (saveResult.credentials) {
          setApiKeys({ linear: saveResult.credentials.linear.configured });
          setMaskedKey(saveResult.credentials.linear.masked);
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
        // Clear input after successful test
        setLinearKey('');
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
  }, [linearKey, setApiKeys]);

  const handleSave = useCallback(async () => {
    const api = getElectronAPI();
    if (!api.settings?.updateCredentials) {
      toast.error('Settings API not available');
      return;
    }

    setSaving(true);
    try {
      const result = await api.settings.updateCredentials({
        apiKeys: { linear: linearKey },
      });

      if (result.success && result.credentials) {
        setApiKeys({ linear: result.credentials.linear.configured });
        setMaskedKey(result.credentials.linear.masked);
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
  }, [linearKey, setApiKeys]);

  const handleDelete = useCallback(async () => {
    const api = getElectronAPI();
    if (!api.settings?.updateCredentials) {
      toast.error('Settings API not available');
      return;
    }

    try {
      const result = await api.settings.updateCredentials({
        apiKeys: { linear: '' },
      });

      if (result.success && result.credentials) {
        setApiKeys({ linear: result.credentials.linear.configured });
        setMaskedKey('');
        setLinearKey('');
        setTestResult(null);
        toast.success('Linear API key deleted');
      } else {
        toast.error(result.error || 'Failed to delete API key');
      }
    } catch {
      toast.error('Failed to delete API key');
    }
  }, [setApiKeys]);

  const hasStoredKey = apiKeys.linear;

  return (
    <div className="space-y-6">
      {/* API Key Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-medium">Linear Integration</h3>
        </div>

        <p className="text-sm text-muted-foreground">
          Connect to Linear to import issues and sync task status. Get your API key from{' '}
          <a
            href="https://linear.app/settings/api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Linear Settings
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>

        <div className="space-y-2">
          <Label htmlFor="linear-key">API Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="linear-key"
                type={showKey ? 'text' : 'password'}
                value={linearKey}
                onChange={(e) => setLinearKey(e.target.value)}
                placeholder={hasStoredKey ? maskedKey || '••••••••' : 'lin_api_...'}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing || (!linearKey && !hasStoredKey)}
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
            </Button>
            <Button onClick={handleSave} disabled={saving || !linearKey}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>

          {/* Connection Status */}
          {testResult && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-md p-3 text-sm',
                testResult.success
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400'
              )}
            >
              {testResult.success ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Connected to Linear</p>
                    {testResult.user && <p>User: {testResult.user}</p>}
                    {testResult.organization && <p>Organization: {testResult.organization}</p>}
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <p>{testResult.error || 'Connection failed'}</p>
                </>
              )}
            </div>
          )}

          {/* Stored Key Indicator */}
          {hasStoredKey && !testResult && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                API key configured {maskedKey && `(${maskedKey})`}
              </p>
              <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
                Delete Key
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Auto-Validation Settings */}
      {hasStoredKey && (
        <div className="space-y-4 pt-4 border-t border-border/50">
          <div>
            <h3 className="text-sm font-medium text-foreground mb-1">Auto-Validation</h3>
            <p className="text-xs text-muted-foreground">
              Automatically validate Linear issues when the view is opened
            </p>
          </div>

          <div className="space-y-3">
            {/* My Issues Only */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-validate-mine" className="text-sm font-normal">
                  Only my issues
                </Label>
                <p className="text-xs text-muted-foreground">
                  Only auto-validate issues assigned to me
                </p>
              </div>
              <Switch
                id="auto-validate-mine"
                checked={linearSettings.autoValidateMyIssuesOnly}
                onCheckedChange={(checked) =>
                  setLinearSettings({ autoValidateMyIssuesOnly: checked })
                }
              />
            </div>

            {/* Label Filter */}
            <div className="space-y-1.5">
              <Label htmlFor="auto-validate-label" className="text-sm font-normal">
                Label filter (optional)
              </Label>
              <Input
                id="auto-validate-label"
                type="text"
                value={linearSettings.autoValidateLabelFilter}
                onChange={(e) => setLinearSettings({ autoValidateLabelFilter: e.target.value })}
                placeholder="e.g., automaker, ready-for-ai"
                className="h-8"
              />
              <p className="text-xs text-muted-foreground">
                Only auto-validate issues with this label (leave empty for all)
              </p>
            </div>

            {/* State Types */}
            <div className="space-y-2">
              <Label className="text-sm font-normal">Issue states to auto-validate</Label>
              <div className="flex flex-wrap gap-4">
                {(['backlog', 'unstarted', 'started'] as const).map((state) => (
                  <div key={state} className="flex items-center space-x-2">
                    <Checkbox
                      id={`state-${state}`}
                      checked={linearSettings.autoValidateStateTypes.includes(state)}
                      onCheckedChange={(checked) => {
                        const newStates = checked
                          ? [...linearSettings.autoValidateStateTypes, state]
                          : linearSettings.autoValidateStateTypes.filter((s) => s !== state);
                        setLinearSettings({ autoValidateStateTypes: newStates });
                      }}
                    />
                    <Label htmlFor={`state-${state}`} className="text-sm font-normal capitalize">
                      {state}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Linear Workflow Integration */}
      {hasStoredKey && (
        <div className="space-y-4 pt-4 border-t border-border/50">
          <div>
            <h3 className="text-sm font-medium text-foreground mb-1">Workflow Integration</h3>
            <p className="text-xs text-muted-foreground">
              Automatically update Linear issue status based on Automaker actions
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="update-status-on-validation" className="text-sm font-normal">
                Update Status on Validation Start
              </Label>
              <p className="text-xs text-muted-foreground">
                Move issues to &quot;In Progress&quot; when validation starts
              </p>
            </div>
            <Switch
              id="update-status-on-validation"
              checked={linearSettings.updateStatusOnValidationStart}
              onCheckedChange={(checked) =>
                setLinearSettings({ updateStatusOnValidationStart: checked })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
