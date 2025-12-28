import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import {
  CheckCircle2,
  Loader2,
  Key,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  XCircle,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTokenSave } from '../hooks';

interface ZaiSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

type VerificationStatus = 'idle' | 'verifying' | 'verified' | 'error';

export function ZaiSetupStep({ onNext, onBack, onSkip }: ZaiSetupStepProps) {
  const { setApiKeys, apiKeys } = useAppStore();

  const [apiKey, setApiKey] = useState('');

  // API Key Verification state
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('idle');
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [isDeletingApiKey, setIsDeletingApiKey] = useState(false);

  // Delete API Key
  const deleteApiKey = useCallback(async () => {
    setIsDeletingApiKey(true);
    try {
      const api = getElectronAPI();
      if (!api.setup?.deleteApiKey) {
        toast.error('Delete API not available');
        return;
      }
      const result = await api.setup.deleteApiKey('zai');
      if (result.success) {
        setApiKey('');
        setApiKeys({ ...apiKeys, zai: '' });
        setVerificationStatus('idle');
        setVerificationError(null);
        toast.success('API key deleted successfully');
      } else {
        toast.error(result.error || 'Failed to delete API key');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete API key');
    } finally {
      setIsDeletingApiKey(false);
    }
  }, [apiKeys, setApiKeys]);

  // Save API Key state
  const { isSaving, saveToken } = useTokenSave({
    provider: 'zai',
    onSuccess: () => {
      setApiKeys({ ...apiKeys, zai: apiKey });
      toast.success('Z.ai API key saved successfully!');
    },
  });

  // Validate API key format
  const isValidApiKey = (key: string): boolean => {
    const trimmed = key.trim();
    return trimmed.length >= 20; // Z.ai API keys are typically 20+ characters
  };

  // Verify Zai API Key
  const verifyApiKey = useCallback(async () => {
    if (!apiKey || !isValidApiKey(apiKey)) {
      setVerificationStatus('error');
      setVerificationError('Please enter a valid API key (at least 20 characters).');
      return;
    }

    setVerificationStatus('verifying');
    setVerificationError(null);

    try {
      const api = getElectronAPI();
      if (!api.setup?.verifyZaiAuth) {
        setVerificationStatus('error');
        setVerificationError('Verification API not available');
        return;
      }

      const result = await api.setup.verifyZaiAuth(apiKey);

      if (result.success && result.authenticated) {
        setVerificationStatus('verified');
        setVerificationError(null);
        toast.success('Z.ai API key verified successfully!');
      } else {
        setVerificationStatus('error');
        setVerificationError(result.error || 'Authentication failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Verification failed';
      setVerificationStatus('error');
      setVerificationError(errorMessage);
    }
  }, [apiKey]);

  // Handle save and verify
  const handleSaveAndVerify = async () => {
    const saved = await saveToken(apiKey);
    if (!saved) {
      return;
    }
    await verifyApiKey();
  };

  // Check if user is ready to proceed
  const hasApiKey = !!apiKeys.zai;
  const isVerified = verificationStatus === 'verified';
  const isReady = hasApiKey && isVerified;

  // Get status badge
  const getStatusBadge = () => {
    if (verificationStatus === 'verified') {
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Verified
        </div>
      );
    }
    if (verificationStatus === 'error') {
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
          <XCircle className="w-3.5 h-3.5" />
          Error
        </div>
      );
    }
    if (verificationStatus === 'verifying') {
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Verifying...
        </div>
      );
    }
    if (hasApiKey) {
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
          <AlertCircle className="w-3.5 h-3.5" />
          Unverified
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted/50 text-muted-foreground border border-border/50">
        Not Set
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
          <Key className="w-8 h-8 text-blue-500" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Z.ai API Key Setup</h2>
        <p className="text-muted-foreground">
          Configure your Z.ai (GLM) API key for code generation
        </p>
      </div>

      {/* API Key Input Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Z.ai API Key</CardTitle>
              <CardDescription>Get your API key from the ZhipuAI developer console</CardDescription>
            </div>
            {getStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* API Key Input */}
          <div className="space-y-2">
            <Label htmlFor="zai-key" className="text-foreground">
              API Key
            </Label>
            <Input
              id="zai-key"
              type="password"
              placeholder="Your Z.ai API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="bg-input border-border text-foreground"
              data-testid="zai-api-key-input"
            />
            <p className="text-xs text-muted-foreground">
              Don&apos;t have an API key?{' '}
              <a
                href="https://open.bigmodel.cn/usercenter/apikeys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-500 hover:underline"
              >
                Get one from open.bigmodel.cn
                <ExternalLink className="w-3 h-3 inline ml-1" />
              </a>
            </p>
          </div>

          {/* Save Button */}
          <Button
            onClick={handleSaveAndVerify}
            disabled={isSaving || !apiKey.trim()}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white"
            data-testid="save-zai-key-button"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Key className="w-4 h-4 mr-2" />
                Save & Verify API Key
              </>
            )}
          </Button>

          {/* Verification Status Messages */}
          {verificationStatus === 'verifying' && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <div>
                <p className="font-medium text-foreground">Verifying API key...</p>
                <p className="text-sm text-muted-foreground">Testing connection to Z.ai API</p>
              </div>
            </div>
          )}

          {verificationStatus === 'verified' && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium text-foreground">API Key verified!</p>
                <p className="text-sm text-muted-foreground">
                  Your Z.ai API key is working correctly.
                </p>
              </div>
            </div>
          )}

          {verificationStatus === 'error' && verificationError && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <XCircle className="w-5 h-5 text-red-500 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Verification failed</p>
                <p className="text-sm text-red-400 mt-1">{verificationError}</p>
              </div>
            </div>
          )}

          {/* Verify Button (if key is saved but not verified) */}
          {hasApiKey && verificationStatus !== 'verified' && verificationStatus !== 'verifying' && (
            <div className="flex gap-2">
              <Button
                onClick={verifyApiKey}
                variant="outline"
                className="flex-1"
                data-testid="verify-zai-button"
              >
                Verify API Key
              </Button>
              <Button
                onClick={deleteApiKey}
                variant="outline"
                disabled={isDeletingApiKey}
                className="px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                data-testid="delete-zai-key-button"
              >
                {isDeletingApiKey ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          )}

          {/* Delete button for verified key */}
          {hasApiKey && verificationStatus === 'verified' && (
            <Button
              onClick={deleteApiKey}
              variant="outline"
              disabled={isDeletingApiKey}
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              data-testid="delete-verified-zai-key-button"
            >
              {isDeletingApiKey ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete API Key
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack} className="text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
            Skip for now
          </Button>
          <Button
            onClick={onNext}
            disabled={!isReady}
            className="bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="zai-next-button"
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
