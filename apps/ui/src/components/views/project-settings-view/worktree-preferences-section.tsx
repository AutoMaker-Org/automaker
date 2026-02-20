import { useState, useEffect, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShellSyntaxEditor } from '@/components/ui/shell-syntax-editor';
import {
  GitBranch,
  Terminal,
  FileCode,
  Save,
  RotateCcw,
  Trash2,
  PanelBottomClose,
  Copy,
  Plus,
  FolderOpen,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { apiGet, apiPut, apiDelete } from '@/lib/api-fetch';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { Project } from '@/lib/electron';
import { ProjectFileSelectorDialog } from '@/components/dialogs/project-file-selector-dialog';

// Stable empty array reference to prevent unnecessary re-renders when no copy files are set
const EMPTY_FILES: string[] = [];

interface WorktreePreferencesSectionProps {
  project: Project;
}

interface InitScriptResponse {
  success: boolean;
  exists: boolean;
  content: string;
  path: string;
  error?: string;
}

export function WorktreePreferencesSection({ project }: WorktreePreferencesSectionProps) {
  // Use direct store subscriptions (not getter functions) so the component
  // properly re-renders when these values change in the store.
  const globalUseWorktrees = useAppStore((s) => s.useWorktrees);
  const projectUseWorktrees = useAppStore((s) => s.useWorktreesByProject[project.path]);
  const setProjectUseWorktrees = useAppStore((s) => s.setProjectUseWorktrees);
  const showIndicator = useAppStore(
    (s) => s.showInitScriptIndicatorByProject[project.path] ?? true
  );
  const setShowInitScriptIndicator = useAppStore((s) => s.setShowInitScriptIndicator);
  const defaultDeleteBranch = useAppStore(
    (s) => s.defaultDeleteBranchByProject[project.path] ?? false
  );
  const setDefaultDeleteBranch = useAppStore((s) => s.setDefaultDeleteBranch);
  const autoDismiss = useAppStore(
    (s) => s.autoDismissInitScriptIndicatorByProject[project.path] ?? true
  );
  const setAutoDismissInitScriptIndicator = useAppStore((s) => s.setAutoDismissInitScriptIndicator);
  // Use a stable empty array reference to prevent new array on every render when
  // worktreeCopyFilesByProject[project.path] is undefined (not yet loaded).
  const copyFilesFromStore = useAppStore((s) => s.worktreeCopyFilesByProject[project.path]);
  const copyFiles = copyFilesFromStore ?? EMPTY_FILES;
  const setWorktreeCopyFiles = useAppStore((s) => s.setWorktreeCopyFiles);

  // Get effective worktrees setting (project override or global fallback)
  const effectiveUseWorktrees = projectUseWorktrees ?? globalUseWorktrees;

  const [scriptContent, setScriptContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [scriptExists, setScriptExists] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Copy files state
  const [newCopyFilePath, setNewCopyFilePath] = useState('');
  const [fileSelectorOpen, setFileSelectorOpen] = useState(false);

  // Check if there are unsaved changes
  const hasChanges = scriptContent !== originalContent;

  // Load project settings (including useWorktrees) when project changes
  useEffect(() => {
    let isCancelled = false;
    const currentPath = project.path;

    const loadProjectSettings = async () => {
      try {
        const httpClient = getHttpApiClient();
        const response = await httpClient.settings.getProject(currentPath);

        // Avoid updating state if component unmounted or project changed
        if (isCancelled) return;

        if (response.success && response.settings) {
          // Sync useWorktrees to store if it has a value
          if (response.settings.useWorktrees !== undefined) {
            setProjectUseWorktrees(currentPath, response.settings.useWorktrees);
          }
          // Also sync other settings to store
          if (response.settings.showInitScriptIndicator !== undefined) {
            setShowInitScriptIndicator(currentPath, response.settings.showInitScriptIndicator);
          }
          if (response.settings.defaultDeleteBranchWithWorktree !== undefined) {
            setDefaultDeleteBranch(currentPath, response.settings.defaultDeleteBranchWithWorktree);
          }
          if (response.settings.autoDismissInitScriptIndicator !== undefined) {
            setAutoDismissInitScriptIndicator(
              currentPath,
              response.settings.autoDismissInitScriptIndicator
            );
          }
          if (response.settings.worktreeCopyFiles !== undefined) {
            setWorktreeCopyFiles(currentPath, response.settings.worktreeCopyFiles);
          }
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to load project settings:', error);
        }
      }
    };

    loadProjectSettings();

    return () => {
      isCancelled = true;
    };
  }, [
    project.path,
    setProjectUseWorktrees,
    setShowInitScriptIndicator,
    setDefaultDeleteBranch,
    setAutoDismissInitScriptIndicator,
    setWorktreeCopyFiles,
  ]);

  // Load init script content when project changes
  useEffect(() => {
    let isCancelled = false;
    const currentPath = project.path;

    const loadInitScript = async () => {
      setIsLoading(true);
      try {
        const response = await apiGet<InitScriptResponse>(
          `/api/worktree/init-script?projectPath=${encodeURIComponent(currentPath)}`
        );

        // Avoid updating state if component unmounted or project changed
        if (isCancelled) return;

        if (response.success) {
          const content = response.content || '';
          setScriptContent(content);
          setOriginalContent(content);
          setScriptExists(response.exists);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to load init script:', error);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadInitScript();

    return () => {
      isCancelled = true;
    };
  }, [project.path]);

  // Save script
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const response = await apiPut<{ success: boolean; error?: string }>(
        '/api/worktree/init-script',
        {
          projectPath: project.path,
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
  }, [project.path, scriptContent]);

  // Reset to original content
  const handleReset = useCallback(() => {
    setScriptContent(originalContent);
  }, [originalContent]);

  // Delete script
  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const response = await apiDelete<{ success: boolean; error?: string }>(
        '/api/worktree/init-script',
        {
          body: { projectPath: project.path },
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
  }, [project.path]);

  // Handle content change (no auto-save)
  const handleContentChange = useCallback((value: string) => {
    setScriptContent(value);
  }, []);

  // Add a new file path to copy list
  const handleAddCopyFile = useCallback(async () => {
    const trimmed = newCopyFilePath.trim();
    if (!trimmed) return;

    // Normalize: remove leading ./ or /
    const normalized = trimmed.replace(/^\.\//, '').replace(/^\//, '');
    if (!normalized) return;

    // Check for duplicates
    if (copyFiles.includes(normalized)) {
      toast.error('File already in list', {
        description: `"${normalized}" is already configured for copying.`,
      });
      return;
    }

    const prevFiles = copyFiles;
    const updatedFiles = [...copyFiles, normalized];
    setWorktreeCopyFiles(project.path, updatedFiles);
    setNewCopyFilePath('');

    // Persist to server
    try {
      const httpClient = getHttpApiClient();
      await httpClient.settings.updateProject(project.path, {
        worktreeCopyFiles: updatedFiles,
      });
      toast.success('Copy file added', {
        description: `"${normalized}" will be copied to new worktrees.`,
      });
    } catch (error) {
      // Rollback optimistic update on failure
      setWorktreeCopyFiles(project.path, prevFiles);
      setNewCopyFilePath(normalized);
      console.error('Failed to persist worktreeCopyFiles:', error);
      toast.error('Failed to save copy files setting');
    }
  }, [project.path, newCopyFilePath, copyFiles, setWorktreeCopyFiles]);

  // Remove a file path from copy list
  const handleRemoveCopyFile = useCallback(
    async (filePath: string) => {
      const prevFiles = copyFiles;
      const updatedFiles = copyFiles.filter((f) => f !== filePath);
      setWorktreeCopyFiles(project.path, updatedFiles);

      // Persist to server
      try {
        const httpClient = getHttpApiClient();
        await httpClient.settings.updateProject(project.path, {
          worktreeCopyFiles: updatedFiles,
        });
        toast.success('Copy file removed');
      } catch (error) {
        // Rollback optimistic update on failure
        setWorktreeCopyFiles(project.path, prevFiles);
        console.error('Failed to persist worktreeCopyFiles:', error);
        toast.error('Failed to save copy files setting');
      }
    },
    [project.path, copyFiles, setWorktreeCopyFiles]
  );

  // Handle files selected from the file selector dialog
  const handleFileSelectorSelect = useCallback(
    async (paths: string[]) => {
      // Filter out duplicates
      const newPaths = paths.filter((p) => !copyFiles.includes(p));
      if (newPaths.length === 0) {
        toast.info('All selected files are already in the list');
        return;
      }

      const prevFiles = copyFiles;
      const updatedFiles = [...copyFiles, ...newPaths];
      setWorktreeCopyFiles(project.path, updatedFiles);

      // Persist to server
      try {
        const httpClient = getHttpApiClient();
        await httpClient.settings.updateProject(project.path, {
          worktreeCopyFiles: updatedFiles,
        });
        toast.success(`${newPaths.length} ${newPaths.length === 1 ? 'file' : 'files'} added`, {
          description: newPaths.map((p) => `"${p}"`).join(', '),
        });
      } catch (error) {
        // Rollback optimistic update on failure
        setWorktreeCopyFiles(project.path, prevFiles);
        console.error('Failed to persist worktreeCopyFiles:', error);
        toast.error('Failed to save copy files setting');
      }
    },
    [project.path, copyFiles, setWorktreeCopyFiles]
  );

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
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Worktree Preferences
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure worktree behavior for this project.
        </p>
      </div>
      <div className="p-6 space-y-5">
        {/* Enable Git Worktree Isolation Toggle */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="project-use-worktrees"
            checked={effectiveUseWorktrees}
            onCheckedChange={async (checked) => {
              const value = checked === true;
              setProjectUseWorktrees(project.path, value);
              try {
                const httpClient = getHttpApiClient();
                await httpClient.settings.updateProject(project.path, {
                  useWorktrees: value,
                });
              } catch (error) {
                console.error('Failed to persist useWorktrees:', error);
              }
            }}
            className="mt-1"
            data-testid="project-use-worktrees-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="project-use-worktrees"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <GitBranch className="w-4 h-4 text-brand-500" />
              Enable Git Worktree Isolation
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Creates isolated git branches for each feature in this project. When disabled, agents
              work directly in the main project directory.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Show Init Script Indicator Toggle */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="show-init-script-indicator"
            checked={showIndicator}
            onCheckedChange={async (checked) => {
              const value = checked === true;
              setShowInitScriptIndicator(project.path, value);
              // Persist to server
              try {
                const httpClient = getHttpApiClient();
                await httpClient.settings.updateProject(project.path, {
                  showInitScriptIndicator: value,
                });
              } catch (error) {
                console.error('Failed to persist showInitScriptIndicator:', error);
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

        {/* Auto-dismiss Init Script Indicator Toggle */}
        {showIndicator && (
          <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3 ml-6">
            <Checkbox
              id="auto-dismiss-indicator"
              checked={autoDismiss}
              onCheckedChange={async (checked) => {
                const value = checked === true;
                setAutoDismissInitScriptIndicator(project.path, value);
                // Persist to server
                try {
                  const httpClient = getHttpApiClient();
                  await httpClient.settings.updateProject(project.path, {
                    autoDismissInitScriptIndicator: value,
                  });
                } catch (error) {
                  console.error('Failed to persist autoDismissInitScriptIndicator:', error);
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
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="default-delete-branch"
            checked={defaultDeleteBranch}
            onCheckedChange={async (checked) => {
              const value = checked === true;
              setDefaultDeleteBranch(project.path, value);
              // Persist to server
              try {
                const httpClient = getHttpApiClient();
                await httpClient.settings.updateProject(project.path, {
                  defaultDeleteBranch: value,
                });
              } catch (error) {
                console.error('Failed to persist defaultDeleteBranch:', error);
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

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Copy Files Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Copy className="w-4 h-4 text-brand-500" />
            <Label className="text-foreground font-medium">Copy Files to Worktrees</Label>
          </div>
          <p className="text-xs text-muted-foreground/80 leading-relaxed">
            Specify files or directories (relative to project root) to automatically copy into new
            worktrees. Useful for untracked files like{' '}
            <code className="font-mono text-foreground/60">.env</code>,{' '}
            <code className="font-mono text-foreground/60">.env.local</code>, or local config files
            that aren&apos;t committed to git.
          </p>

          {/* Current file list */}
          {copyFiles.length > 0 && (
            <div className="space-y-1.5">
              {copyFiles.map((filePath) => (
                <div
                  key={filePath}
                  className="flex items-center gap-2 group/item px-3 py-1.5 rounded-lg bg-accent/20 hover:bg-accent/40 transition-colors"
                >
                  <FileCode className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                  <code className="font-mono text-sm text-foreground/80 flex-1 truncate">
                    {filePath}
                  </code>
                  <button
                    onClick={() => handleRemoveCopyFile(filePath)}
                    className="p-0.5 rounded text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive transition-all flex-shrink-0"
                    title={`Remove ${filePath}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new file input */}
          <div className="flex items-center gap-2">
            <Input
              value={newCopyFilePath}
              onChange={(e) => setNewCopyFilePath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCopyFile();
                }
              }}
              placeholder=".env, config/local.json, etc."
              className="flex-1 h-8 text-sm font-mono"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddCopyFile}
              disabled={!newCopyFilePath.trim()}
              className="gap-1.5 h-8"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFileSelectorOpen(true)}
              className="gap-1.5 h-8"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Browse
            </Button>
          </div>

          {/* File selector dialog */}
          <ProjectFileSelectorDialog
            open={fileSelectorOpen}
            onOpenChange={setFileSelectorOpen}
            onSelect={handleFileSelectorSelect}
            projectPath={project.path}
            existingFiles={copyFiles}
          />
        </div>

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

          {/* File path indicator */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
            <FileCode className="w-3.5 h-3.5" />
            <code className="font-mono">.automaker/worktree-init.sh</code>
            {hasChanges && <span className="text-amber-500 font-medium">(unsaved changes)</span>}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="md" />
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
                  {isDeleting ? <Spinner size="xs" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving || isDeleting}
                  className="gap-1.5"
                >
                  {isSaving ? <Spinner size="xs" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
