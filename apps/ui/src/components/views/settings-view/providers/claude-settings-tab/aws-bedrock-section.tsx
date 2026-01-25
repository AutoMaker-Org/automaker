import { useState, useEffect } from 'react';
import { CloudCog, Eye, EyeOff, Save, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';

const AWS_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
];

export function AwsBedrockSection() {
  const { setBedrockConfigured } = useAppStore();

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [region, setRegion] = useState('us-east-1');

  // UI state
  const [showAccessKey, setShowAccessKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showSessionToken, setShowSessionToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load existing credentials
  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    try {
      const api = getElectronAPI();
      if (!api?.settings?.getCredentials) return;

      const response = await api.settings.getCredentials();
      if (response.success && response.credentials?.awsBedrock) {
        const bedrock = response.credentials.awsBedrock;
        setEnabled(bedrock.enabled);
        setRegion(bedrock.region || 'us-east-1');
        setIsConfigured(bedrock.configured);

        // Don't load actual keys for security - just show they're configured
        setAccessKeyId('');
        setSecretAccessKey('');
        setSessionToken('');
      }
    } catch (error) {
      console.error('Failed to load Bedrock credentials:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    // Validation
    if (enabled) {
      if (!accessKeyId || !secretAccessKey) {
        toast.error('Access Key ID and Secret Access Key are required when enabled');
        return;
      }
      if (!region) {
        toast.error('AWS Region is required when enabled');
        return;
      }
    }

    setIsSaving(true);
    try {
      const api = getElectronAPI();
      if (!api?.settings?.updateCredentials) {
        toast.error('Settings API not available');
        return;
      }

      const result = await api.settings.updateCredentials({
        awsBedrock: {
          enabled,
          accessKeyId: accessKeyId || undefined,
          secretAccessKey: secretAccessKey || undefined,
          sessionToken: sessionToken || undefined,
          region,
        },
      });

      if (result.success) {
        toast.success('AWS Bedrock credentials saved');
        setIsConfigured(enabled && !!accessKeyId && !!secretAccessKey);

        // Refresh Bedrock status in app-store
        const statusResponse = await api.settings.getBedrockStatus();
        if (statusResponse.success) {
          setBedrockConfigured(statusResponse.bedrockConfigured);
        }

        // Clear input fields after save (security)
        setAccessKeyId('');
        setSecretAccessKey('');
        setSessionToken('');
        await loadCredentials();
      } else {
        toast.error(result.error || 'Failed to save credentials');
      }
    } catch (error) {
      console.error('Failed to save AWS Bedrock credentials:', error);
      toast.error('Failed to save AWS Bedrock credentials');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-zinc-800 rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-zinc-800 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <CloudCog className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h3 className="font-medium text-zinc-100">AWS Bedrock</h3>
            <p className="text-sm text-zinc-400 mt-1">
              Use Claude models via AWS Bedrock for enterprise deployments
            </p>
          </div>
        </div>

        {/* Status Indicator */}
        {isConfigured && enabled && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-400">Configured</span>
          </div>
        )}
      </div>

      {/* Security Warning */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-400/90">
          Credentials are stored unencrypted in credentials.json. Only use on trusted systems.
        </p>
      </div>

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <label className="text-sm font-medium text-zinc-200">Enable AWS Bedrock</label>
          <p className="text-xs text-zinc-500 mt-0.5">
            Use Bedrock instead of direct Anthropic API
          </p>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-blue-500' : 'bg-zinc-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Configuration Form (shown when enabled) */}
      {enabled && (
        <div className="space-y-4 pt-2 border-t border-zinc-800">
          {/* AWS Region */}
          <div>
            <label className="block text-sm font-medium text-zinc-200 mb-2">AWS Region</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {AWS_REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* AWS Access Key ID */}
          <div>
            <label className="block text-sm font-medium text-zinc-200 mb-2">
              AWS Access Key ID <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showAccessKey ? 'text' : 'password'}
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                placeholder={isConfigured ? '(configured)' : 'AKIA...'}
                className="w-full px-3 py-2 pr-10 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowAccessKey(!showAccessKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {showAccessKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* AWS Secret Access Key */}
          <div>
            <label className="block text-sm font-medium text-zinc-200 mb-2">
              AWS Secret Access Key <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showSecretKey ? 'text' : 'password'}
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                placeholder={isConfigured ? '(configured)' : 'wJal...'}
                className="w-full px-3 py-2 pr-10 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* AWS Session Token (Optional) */}
          <div>
            <label className="block text-sm font-medium text-zinc-200 mb-2">
              AWS Session Token <span className="text-xs text-zinc-500">(optional)</span>
            </label>
            <div className="relative">
              <input
                type={showSessionToken ? 'text' : 'password'}
                value={sessionToken}
                onChange={(e) => setSessionToken(e.target.value)}
                placeholder={isConfigured ? '(configured)' : 'For temporary credentials'}
                className="w-full px-3 py-2 pr-10 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowSessionToken(!showSessionToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {showSessionToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* IAM Permissions Note */}
          <div className="p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
            <p className="text-xs text-zinc-400">
              <span className="font-medium text-zinc-300">IAM Permissions Required:</span> Your AWS
              credentials need bedrock:InvokeModel permission for the Claude models you want to use.
            </p>
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="pt-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save AWS Bedrock Credentials'}
        </button>
      </div>
    </div>
  );
}
