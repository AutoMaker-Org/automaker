import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  FolderPlus,
  FolderOpen,
  Rocket,
  ExternalLink,
  Check,
  Loader2,
  Link,
  Folder,
} from 'lucide-react';
import { starterTemplates, type StarterTemplate } from '@/lib/templates';
import { getElectronAPI } from '@/lib/electron';
import { cn } from '@/lib/utils';
import { useFileBrowser } from '@/contexts/file-browser-context';
import { getDefaultWorkspaceDirectory, saveLastProjectDirectory } from '@/lib/workspace-config';

interface ValidationErrors {
  projectName?: boolean;
  workspaceDir?: boolean;
  templateSelection?: boolean;
  customUrl?: boolean;
}

interface NewProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateBlankProject: (projectName: string, parentDir: string) => Promise<void>;
  onCreateFromTemplate: (
    template: StarterTemplate,
    projectName: string,
    parentDir: string
  ) => Promise<void>;
  onCreateFromCustomUrl: (repoUrl: string, projectName: string, parentDir: string) => Promise<void>;
  isCreating: boolean;
}

export function NewProjectModal({
  open,
  onOpenChange,
  onCreateBlankProject,
  onCreateFromTemplate,
  onCreateFromCustomUrl,
  isCreating,
}: NewProjectModalProps) {
  const [activeTab, setActiveTab] = useState<'blank' | 'template'>('blank');
  const [projectName, setProjectName] = useState('');
  const [workspaceDir, setWorkspaceDir] = useState<string>('');
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<StarterTemplate | null>(null);
  const [useCustomUrl, setUseCustomUrl] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const { openFileBrowser } = useFileBrowser();

  // Fetch workspace directory when modal opens
  useEffect(() => {
    if (open) {
      setIsLoadingWorkspace(true);
      getDefaultWorkspaceDirectory()
        .then((defaultDir) => {
          if (defaultDir) {
            setWorkspaceDir(defaultDir);
          }
        })
        .catch((error) => {
          console.error('Failed to get default workspace directory:', error);
        })
        .finally(() => {
          setIsLoadingWorkspace(false);
        });
    }
  }, [open]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setProjectName('');
      setSelectedTemplate(null);
      setUseCustomUrl(false);
      setCustomUrl('');
      setActiveTab('blank');
      setErrors({});
    }
  }, [open]);

  // Clear specific errors when user fixes them
  useEffect(() => {
    if (projectName && errors.projectName) {
      setErrors((prev) => ({ ...prev, projectName: false }));
    }
  }, [projectName, errors.projectName]);

  useEffect(() => {
    if ((selectedTemplate || (useCustomUrl && customUrl)) && errors.templateSelection) {
      setErrors((prev) => ({ ...prev, templateSelection: false }));
    }
  }, [selectedTemplate, useCustomUrl, customUrl, errors.templateSelection]);

  useEffect(() => {
    if (customUrl && errors.customUrl) {
      setErrors((prev) => ({ ...prev, customUrl: false }));
    }
  }, [customUrl, errors.customUrl]);

  const validateAndCreate = async () => {
    const newErrors: ValidationErrors = {};

    // Check project name
    if (!projectName.trim()) {
      newErrors.projectName = true;
    }

    // Check workspace dir
    if (!workspaceDir) {
      newErrors.workspaceDir = true;
    }

    // Check template selection (only for template tab)
    if (activeTab === 'template') {
      if (useCustomUrl) {
        if (!customUrl.trim()) {
          newErrors.customUrl = true;
        }
      } else if (!selectedTemplate) {
        newErrors.templateSelection = true;
      }
    }

    // If there are errors, show them and don't proceed
    if (Object.values(newErrors).some(Boolean)) {
      setErrors(newErrors);
      return;
    }

    // Clear errors and proceed
    setErrors({});

    if (activeTab === 'blank') {
      await onCreateBlankProject(projectName, workspaceDir);
    } else if (useCustomUrl && customUrl) {
      await onCreateFromCustomUrl(customUrl, projectName, workspaceDir);
    } else if (selectedTemplate) {
      await onCreateFromTemplate(selectedTemplate, projectName, workspaceDir);
    }
  };

  const handleOpenRepo = (url: string) => {
    const api = getElectronAPI();
    api.openExternalLink(url);
  };

  const handleSelectTemplate = (template: StarterTemplate) => {
    setSelectedTemplate(template);
    setUseCustomUrl(false);
    setCustomUrl('');
  };

  const handleToggleCustomUrl = () => {
    setUseCustomUrl(!useCustomUrl);
    if (!useCustomUrl) {
      setSelectedTemplate(null);
    }
  };

  const handleBrowseDirectory = async () => {
    const selectedPath = await openFileBrowser({
      title: 'Select Base Project Directory',
      description: 'Choose the parent directory where your project will be created',
      initialPath: workspaceDir || undefined,
    });
    if (selectedPath) {
      setWorkspaceDir(selectedPath);
      // Save to localStorage for next time
      saveLastProjectDirectory(selectedPath);
      // Clear any workspace error when a valid directory is selected
      if (errors.workspaceDir) {
        setErrors((prev) => ({ ...prev, workspaceDir: false }));
      }
    }
  };

  // Use platform-specific path separator
  const pathSep =
    typeof window !== 'undefined' && (window as any).electronAPI
      ? navigator.platform.indexOf('Win') !== -1
        ? '\\'
        : '/'
      : '/';
  const projectPath = workspaceDir && projectName ? `${workspaceDir}${pathSep}${projectName}` : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card border-border max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        data-testid="new-project-modal"
      >
        <DialogHeader className="pb-2">
          <DialogTitle className="text-foreground">Create New Project</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Start with a blank project or choose from a starter template.
          </DialogDescription>
        </DialogHeader>

        {/* Project Name Input - Always visible at top */}
        <div className="space-y-3 pb-4 border-b border-border">
          <div className="space-y-2">
            <Label
              htmlFor="project-name"
              className={cn('text-foreground', errors.projectName && 'text-red-500')}
            >
              Project Name {errors.projectName && <span className="text-red-500">*</span>}
            </Label>
            <Input
              id="project-name"
              placeholder="my-awesome-project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className={cn(
                'bg-input text-foreground placeholder:text-muted-foreground',
                errors.projectName
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-border'
              )}
              data-testid="project-name-input"
              autoFocus
            />
            {errors.projectName && <p className="text-xs text-red-500">Project name is required</p>}
          </div>

          {/* Workspace Directory Display */}
          <div
            className={cn(
              'flex items-start gap-2 text-sm',
              errors.workspaceDir ? 'text-red-500' : 'text-muted-foreground'
            )}
          >
            <Folder className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1 min-w-0 flex flex-col gap-1">
              {isLoadingWorkspace ? (
                'Loading workspace...'
              ) : workspaceDir ? (
                <>
                  <span>Will be created at:</span>
                  <code
                    className="text-xs bg-muted px-1.5 py-0.5 rounded truncate block max-w-full"
                    title={projectPath || workspaceDir}
                  >
                    {projectPath || workspaceDir}
                  </code>
                </>
              ) : null}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBrowseDirectory}
              disabled={isLoadingWorkspace}
              className="shrink-0 h-7 px-2 text-xs"
              data-testid="browse-directory-button"
            >
              <FolderOpen className="w-3.5 h-3.5 mr-1" />
              Browse
            </Button>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'blank' | 'template')}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="w-full justify-start">
            <TabsTrigger value="blank" className="gap-2">
              <FolderPlus className="w-4 h-4" />
              Blank Project
            </TabsTrigger>
            <TabsTrigger value="template" className="gap-2">
              <Rocket className="w-4 h-4" />
              Starter Kit
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto py-4">
            <TabsContent value="blank" className="mt-0">
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <p className="text-sm text-muted-foreground">
                  Create an empty project with the standard .automaker directory structure. Perfect
                  for starting from scratch or importing an existing codebase.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="template" className="mt-0">
              <div className="space-y-4">
                {/* Error message for template selection */}
                {errors.templateSelection && (
                  <p className="text-sm text-red-500">
                    Please select a template or enter a custom GitHub URL
                  </p>
                )}

                {/* Preset Templates */}
                <div
                  className={cn(
                    'space-y-3 rounded-lg p-1 -m-1',
                    errors.templateSelection && 'ring-2 ring-red-500/50'
                  )}
                >
                  {starterTemplates.map((template) => (
                    <div
                      key={template.id}
                      className={cn(
                        'p-4 rounded-lg border cursor-pointer transition-all',
                        selectedTemplate?.id === template.id && !useCustomUrl
                          ? 'border-brand-500 bg-brand-500/10'
                          : 'border-border bg-muted/30 hover:border-border-glass hover:bg-muted/50'
                      )}
                      onClick={() => handleSelectTemplate(template)}
                      data-testid={`template-${template.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-foreground">{template.name}</h4>
                            {selectedTemplate?.id === template.id && !useCustomUrl && (
                              <Check className="w-4 h-4 text-brand-500" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            {template.description}
                          </p>

                          {/* Tech Stack */}
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {template.techStack.slice(0, 6).map((tech) => (
                              <Badge key={tech} variant="secondary" className="text-xs">
                                {tech}
                              </Badge>
                            ))}
                            {template.techStack.length > 6 && (
                              <Badge variant="secondary" className="text-xs">
                                +{template.techStack.length - 6} more
                              </Badge>
                            )}
                          </div>

                          {/* Key Features */}
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Features: </span>
                            {template.features.slice(0, 3).join(' · ')}
                            {template.features.length > 3 &&
                              ` · +${template.features.length - 3} more`}
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenRepo(template.repoUrl);
                          }}
                        >
                          <ExternalLink className="w-4 h-4 mr-1" />
                          View
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Custom URL Option */}
                  <div
                    className={cn(
                      'p-4 rounded-lg border cursor-pointer transition-all',
                      useCustomUrl
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-border bg-muted/30 hover:border-border-glass hover:bg-muted/50'
                    )}
                    onClick={handleToggleCustomUrl}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Link className="w-4 h-4 text-muted-foreground" />
                      <h4 className="font-medium text-foreground">Custom GitHub URL</h4>
                      {useCustomUrl && <Check className="w-4 h-4 text-brand-500" />}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Clone any public GitHub repository as a starting point.
                    </p>

                    {useCustomUrl && (
                      <div onClick={(e) => e.stopPropagation()} className="space-y-1">
                        <Input
                          placeholder="https://github.com/username/repository"
                          value={customUrl}
                          onChange={(e) => setCustomUrl(e.target.value)}
                          className={cn(
                            'bg-input text-foreground placeholder:text-muted-foreground',
                            errors.customUrl
                              ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                              : 'border-border'
                          )}
                          data-testid="custom-url-input"
                        />
                        {errors.customUrl && (
                          <p className="text-xs text-red-500">GitHub URL is required</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="border-t border-border pt-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            Cancel
          </Button>
          <HotkeyButton
            onClick={validateAndCreate}
            disabled={isCreating}
            className="bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-600 text-white border-0"
            hotkey={{ key: 'Enter', cmdCtrl: true }}
            hotkeyActive={open}
            data-testid="confirm-create-project"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {activeTab === 'template' ? 'Cloning...' : 'Creating...'}
              </>
            ) : (
              <>Create Project</>
            )}
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
