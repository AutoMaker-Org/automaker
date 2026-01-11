import { useState, useEffect, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ShellSyntaxEditor } from '@/components/ui/shell-syntax-editor';
import {
  GitBranch,
  Terminal,
  FileCode,
  Save,
  RotateCcw,
  Trash2,
  Loader2,
  PanelBottomClose,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiGet, apiPut, apiDelete } from '@/lib/api-fetch';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';

interface WorktreesSectionProps {
  useWorktrees: boolean;
  onUseWorktreesChange: (value: boolean) => void;
}

interface InitScriptResponse {
  success: boolean;
  exists: boolean;
  content: string;
  path: string;
  error?: string;
}

export function WorktreesSection({ useWorktrees, onUseWorktreesChange }: WorktreesSectionProps) {
  const currentProject = useAppStore((s) => s.currentProject);
  const getShowInitScriptIndicator = useAppStore((s) => s.getShowInitScriptIndicator);
  const setShowInitScriptIndicator = useAppStore((s) => s.setShowInitScriptIndicator);
  const getDefaultDeleteBranch = useAppStore((s) => s.getDefaultDeleteBranch);
  const setDefaultDeleteBranch = useAppStore((s) => s.setDefaultDeleteBranch);
  const getAutoDismissInitScriptIndicator = useAppStore((s) => s.getAutoDismissInitScriptIndicator);
  const setAutoDismissInitScriptIndicator = useAppStore((s) => s.setAutoDismissInitScriptIndicator);
  const [scriptContent, setScriptContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [scriptExists, setScriptExists] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get the current show indicator setting
  const showIndicator = currentProject?.path
    ? getShowInitScriptIndicator(currentProject.path)
    : true;

  // Get the default delete branch setting
  const defaultDeleteBranch = currentProject?.path
    ? getDefaultDeleteBranch(currentProject.path)
    : false;

  // Get the auto-dismiss setting
  const autoDismiss = currentProject?.path
    ? getAutoDismissInitScriptIndicator(currentProject.path)
    : true;

  // Check if there are unsaved changes
  const hasChanges = scriptContent !== originalContent;

  // Load init script content when project changes
  useEffect(() => {
    if (!currentProject?.path) {
      setScriptContent('');
      setOriginalContent('');
      setScriptExists(false);
      setIsLoading(false);
      return;
    }

    const loadInitScript = async () => {
      setIsLoading(true);
      try {
        const response = await apiGet<InitScriptResponse>(
          `/api/worktree/init-script?projectPath=${encodeURIComponent(currentProject.path)}`
        );
        if (response.success) {
          const content = response.content || '';
          setScriptContent(content);
          setOriginalContent(content);
          setScriptExists(response.exists);
        }
      } catch (error) {
        console.error('Failed to load init script:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitScript();
  }, [currentProject?.path]);

  // Save script
  const handleSave = useCallback(async () => {
    if (!currentProject?.path) return;

    setIsSaving(true);
    try {
      const response = await apiPut<{ success: boolean; error?: string }>(
        '/api/worktree/init-script',
        {
          projectPath: currentProject.path,
          content: scriptContent,
        }
      );
      if (response.success) {
        setOriginalContent(scriptContent);
        setScriptExists(true);
        toast.success('Init script saved');
      } else {
        toast.error('Failed to save init script', {
          description: response.error,
        });
      }
    } catch (error) {
      console.error('Failed to save init script:', error);
      toast.error('Failed to save init script');
    } finally {
      setIsSaving(false);
    }
  }, [currentProject?.path, scriptContent]);

  // Reset to original content
  const handleReset = useCallback(() => {
    setScriptContent(originalContent);
  }, [originalContent]);

  // Delete script
  const handleDelete = useCallback(async () => {
    if (!currentProject?.path) return;

    setIsDeleting(true);
    try {
      const response = await apiDelete<{ success: boolean; error?: string }>(
        '/api/worktree/init-script',
        {
          body: { projectPath: currentProject.path },
        }
      );
      if (response.success) {
        setScriptContent('');
        setOriginalContent('');
        setScriptExists(false);
        toast.success('Init script deleted');
      } else {
        toast.error('Failed to delete init script', {
          description: response.error,
        });
      }
    } catch (error) {
      console.error('Failed to delete init script:', error);
      toast.error('Failed to delete init script');
    } finally {
      setIsDeleting(false);
    }
  }, [currentProject?.path]);

  // Handle content change (no auto-save)
  const handleContentChange = useCallback((value: string) => {
    setScriptContent(value);
  }, []);

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
            <GitBranch className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Worktrees</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure git worktree isolation and initialization scripts.
        </p>
      </div>
      <div className="p-6 space-y-5">
        {/* Enable Worktrees Toggle */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="use-worktrees"
            checked={useWorktrees}
            onCheckedChange={(checked) => onUseWorktreesChange(checked === true)}
            className="mt-1"
            data-testid="use-worktrees-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="use-worktrees"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <GitBranch className="w-4 h-4 text-brand-500" />
              Enable Git Worktree Isolation
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Creates isolated git branches for each feature. When disabled, agents work directly in
              the main project directory.
            </p>
          </div>
        </div>

        {/* Show Init Script Indicator Toggle */}
        {currentProject && (
          <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3 mt-4">
            <Checkbox
              id="show-init-script-indicator"
              checked={showIndicator}
              onCheckedChange={(checked) => {
                if (currentProject?.path) {
                  setShowInitScriptIndicator(currentProject.path, checked === true);
                }
              }}
              className="mt-1"
            />
            <div className="space-y-1.5">
              <Label
                htmlFor="show-init-script-indicator"
                className="text-foreground cursor-pointer font-medium flex items-center gap-2"
              >
                <PanelBottomClose className="w-4 h-4 text-brand-500" />
                Show Init Script Indicator
              </Label>
              <p className="text-xs text-muted-foreground/80 leading-relaxed">
                Display a floating panel in the bottom-right corner showing init script execution
                status and output when a worktree is created.
              </p>
            </div>
          </div>
        )}

        {/* Auto-dismiss Init Script Indicator Toggle */}
        {currentProject && showIndicator && (
          <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3 ml-6">
            <Checkbox
              id="auto-dismiss-indicator"
              checked={autoDismiss}
              onCheckedChange={(checked) => {
                if (currentProject?.path) {
                  setAutoDismissInitScriptIndicator(currentProject.path, checked === true);
                }
              }}
              className="mt-1"
            />
            <div className="space-y-1.5">
              <Label
                htmlFor="auto-dismiss-indicator"
                className="text-foreground cursor-pointer font-medium flex items-center gap-2"
              >
                Auto-dismiss After Completion
              </Label>
              <p className="text-xs text-muted-foreground/80 leading-relaxed">
                Automatically hide the indicator 5 seconds after the script completes.
              </p>
            </div>
          </div>
        )}

        {/* Default Delete Branch Toggle */}
        {currentProject && (
          <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
            <Checkbox
              id="default-delete-branch"
              checked={defaultDeleteBranch}
              onCheckedChange={(checked) => {
                if (currentProject?.path) {
                  setDefaultDeleteBranch(currentProject.path, checked === true);
                }
              }}
              className="mt-1"
            />
            <div className="space-y-1.5">
              <Label
                htmlFor="default-delete-branch"
                className="text-foreground cursor-pointer font-medium flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4 text-brand-500" />
                Delete Branch by Default
              </Label>
              <p className="text-xs text-muted-foreground/80 leading-relaxed">
                When deleting a worktree, automatically check the "Also delete the branch" option.
              </p>
            </div>
          </div>
        )}

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Init Script Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-brand-500" />
              <Label className="text-foreground font-medium">Initialization Script</Label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground/80 leading-relaxed">
            Shell commands to run after a worktree is created. Runs once per worktree. Uses Git Bash
            on Windows for cross-platform compatibility.
          </p>

          {currentProject ? (
            <>
              {/* File path indicator */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                <FileCode className="w-3.5 h-3.5" />
                <code className="font-mono">.automaker/worktree-init.sh</code>
                {hasChanges && (
                  <span className="text-amber-500 font-medium">(unsaved changes)</span>
                )}
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <ShellSyntaxEditor
                    value={scriptContent}
                    onChange={handleContentChange}
                    placeholder={`# Example initialization commands
npm install

# Or use pnpm
# pnpm install

# Copy environment file
# cp .env.example .env`}
                    minHeight="200px"
                    maxHeight="500px"
                    data-testid="init-script-editor"
                  />

                  {/* Action buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReset}
                      disabled={!hasChanges || isSaving || isDeleting}
                      className="gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDelete}
                      disabled={!scriptExists || isSaving || isDeleting}
                      className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={!hasChanges || isSaving || isDeleting}
                      className="gap-1.5"
                    >
                      {isSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      Save
                    </Button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground/60 py-4 text-center">
              Select a project to configure the init script.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
