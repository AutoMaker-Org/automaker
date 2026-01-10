import { useState, useEffect, useCallback } from 'react';
import { FileText, Loader2, Save } from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function SpecPanel() {
  const { currentProject } = useAppStore();
  const [specContent, setSpecContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const hasChanges = specContent !== originalContent;

  const loadSpec = useCallback(async () => {
    if (!currentProject?.path) return;

    setLoading(true);
    try {
      const api = getElectronAPI();
      if (api.spec?.read) {
        const result = await api.spec.read(currentProject.path);
        if (result.success && result.content !== undefined) {
          setSpecContent(result.content);
          setOriginalContent(result.content);
        }
      }
    } catch (error) {
      console.error('Error loading spec:', error);
    } finally {
      setLoading(false);
    }
  }, [currentProject?.path]);

  useEffect(() => {
    loadSpec();
  }, [loadSpec]);

  const handleSave = useCallback(async () => {
    if (!currentProject?.path || !hasChanges) return;

    setSaving(true);
    try {
      const api = getElectronAPI();
      if (api.spec?.write) {
        const result = await api.spec.write(currentProject.path, specContent);
        if (result.success) {
          setOriginalContent(specContent);
          toast.success('Spec saved');
        } else {
          toast.error('Failed to save spec');
        }
      }
    } catch (error) {
      toast.error('Failed to save spec');
    } finally {
      setSaving(false);
    }
  }, [currentProject?.path, specContent, hasChanges]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">App Specification</span>
          {hasChanges && <span className="text-[10px] text-amber-500">Unsaved changes</span>}
        </div>
        {hasChanges && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Save className="h-3 w-3 mr-1" />
            )}
            Save
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-2 overflow-hidden">
        {specContent ? (
          <Textarea
            value={specContent}
            onChange={(e) => setSpecContent(e.target.value)}
            className={cn(
              'h-full w-full resize-none font-mono text-xs',
              'bg-muted/30 border-0 focus-visible:ring-1'
            )}
            placeholder="Enter your app specification..."
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-xs text-muted-foreground">No spec file found</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
