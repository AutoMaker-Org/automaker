import { useState, useEffect } from 'react';
import { Copy, Check, AlertCircle, Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { JsonSyntaxEditor } from '@/components/ui/json-syntax-editor';
import { apiGet, apiPut } from '@/lib/api-fetch';
import { toast } from 'sonner';
import type { GlobalSettings } from '@automaker/types';

interface ImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SettingsResponse {
  success: boolean;
  settings: GlobalSettings;
}

export function ImportExportDialog({ open, onOpenChange }: ImportExportDialogProps) {
  const [jsonValue, setJsonValue] = useState('');
  const [originalValue, setOriginalValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Load current settings when dialog opens
  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await apiGet<SettingsResponse>('/api/settings/global');
      if (response.success) {
        const formatted = JSON.stringify(response.settings, null, 2);
        setJsonValue(formatted);
        setOriginalValue(formatted);
        setParseError(null);
      }
    } catch (error) {
      toast.error('Failed to load settings');
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Validate JSON on change
  const handleJsonChange = (value: string) => {
    setJsonValue(value);
    try {
      JSON.parse(value);
      setParseError(null);
    } catch {
      setParseError('Invalid JSON syntax');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonValue);
      setCopied(true);
      toast.success('Settings copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleSave = async () => {
    if (parseError) {
      toast.error('Please fix JSON syntax errors before saving');
      return;
    }

    setIsSaving(true);
    try {
      const settings = JSON.parse(jsonValue);
      const response = await apiPut<SettingsResponse>('/api/settings/global', settings);
      if (response.success) {
        const formatted = JSON.stringify(response.settings, null, 2);
        setJsonValue(formatted);
        setOriginalValue(formatted);
        toast.success('Settings saved successfully', {
          description: 'Your changes have been applied. Some settings may require a refresh.',
        });
        onOpenChange(false);
      }
    } catch (error) {
      toast.error('Failed to save settings');
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setJsonValue(originalValue);
    setParseError(null);
  };

  const hasChanges = jsonValue !== originalValue;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import / Export Settings</DialogTitle>
          <DialogDescription>
            Copy your settings to transfer to another machine, or paste settings from another
            installation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 min-h-0 mt-4">
          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={isLoading || !!parseError}
                className="gap-2"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={loadSettings}
                disabled={isLoading}
                className="gap-2"
              >
                Refresh
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Button variant="ghost" size="sm" onClick={handleReset} disabled={isSaving}>
                  Discard
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                disabled={isLoading || isSaving || !hasChanges || !!parseError}
                className="gap-2"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>

          {/* Error Message */}
          {parseError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* JSON Editor */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Loading settings...
              </div>
            ) : (
              <JsonSyntaxEditor
                value={jsonValue}
                onChange={handleJsonChange}
                placeholder="Loading settings..."
                minHeight="350px"
                maxHeight="450px"
                data-testid="settings-json-editor"
              />
            )}
          </div>

          {/* Help Text */}
          <p className="text-xs text-muted-foreground">
            To import settings, paste the JSON content into the editor and click "Save Changes".
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
