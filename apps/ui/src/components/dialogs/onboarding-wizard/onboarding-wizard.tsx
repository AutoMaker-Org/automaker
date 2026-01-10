import { useState, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useAppStore, type ThemeMode } from '@/store/app-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  FolderOpen,
  FileText,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
} from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { initializeProject, hasAutomakerDir, hasAppSpec } from '@/lib/project-init';
import { toast } from 'sonner';

type OnboardingStep = 'select-folder' | 'project-name' | 'app-spec' | 'complete';
type OnboardingMode = 'new' | 'existing';

interface OnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: OnboardingMode;
  initialPath?: string;
}

export function OnboardingWizard({ open, onOpenChange, mode, initialPath }: OnboardingWizardProps) {
  const navigate = useNavigate();
  const {
    upsertAndSetCurrentProject,
    theme: globalTheme,
    trashedProjects,
    setSpecCreatingForProject,
  } = useAppStore();

  const [step, setStep] = useState<OnboardingStep>(initialPath ? 'project-name' : 'select-folder');
  const [projectPath, setProjectPath] = useState(initialPath || '');
  const [projectName, setProjectName] = useState('');
  const [projectOverview, setProjectOverview] = useState('');
  const [generateFeatures, setGenerateFeatures] = useState(true);
  const [featureCount, setFeatureCount] = useState(5);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSelectFolder = useCallback(async () => {
    const api = getElectronAPI();
    const result = await api.openDirectory();

    if (!result.canceled && result.filePaths[0]) {
      const path = result.filePaths[0];
      const name = path.split(/[/\\]/).filter(Boolean).pop() || 'Untitled Project';

      setProjectPath(path);
      setProjectName(name);

      // Check if it's an existing automaker project
      const hadAutomakerDir = await hasAutomakerDir(path);
      const specExists = await hasAppSpec(path);

      if (hadAutomakerDir && specExists) {
        // Existing project with spec - skip to complete
        try {
          const initResult = await initializeProject(path);
          if (initResult.success) {
            const trashedProject = trashedProjects.find((p) => p.path === path);
            const effectiveTheme = (trashedProject?.theme as ThemeMode | undefined) || globalTheme;
            upsertAndSetCurrentProject(path, name, effectiveTheme);
            toast.success('Project opened', { description: `Opened ${name}` });
            onOpenChange(false);
            navigate({ to: '/board' });
          }
        } catch (error) {
          toast.error('Failed to open project');
        }
      } else {
        setStep('project-name');
      }
    }
  }, [trashedProjects, globalTheme, upsertAndSetCurrentProject, onOpenChange, navigate]);

  const handleNext = useCallback(() => {
    if (step === 'project-name') {
      setStep('app-spec');
    }
  }, [step]);

  const handleBack = useCallback(() => {
    if (step === 'app-spec') {
      setStep('project-name');
    } else if (step === 'project-name') {
      setStep('select-folder');
    }
  }, [step]);

  const handleSkipSpec = useCallback(async () => {
    setIsProcessing(true);
    try {
      const initResult = await initializeProject(projectPath);
      if (!initResult.success) {
        toast.error('Failed to initialize project');
        return;
      }

      const trashedProject = trashedProjects.find((p) => p.path === projectPath);
      const effectiveTheme = (trashedProject?.theme as ThemeMode | undefined) || globalTheme;
      upsertAndSetCurrentProject(projectPath, projectName, effectiveTheme);

      toast.success('Project created', { description: `Created ${projectName}` });
      onOpenChange(false);
      navigate({ to: '/board' });
    } finally {
      setIsProcessing(false);
    }
  }, [
    projectPath,
    projectName,
    trashedProjects,
    globalTheme,
    upsertAndSetCurrentProject,
    onOpenChange,
    navigate,
  ]);

  const handleGenerateSpec = useCallback(async () => {
    setIsProcessing(true);
    try {
      const initResult = await initializeProject(projectPath);
      if (!initResult.success) {
        toast.error('Failed to initialize project');
        return;
      }

      const trashedProject = trashedProjects.find((p) => p.path === projectPath);
      const effectiveTheme = (trashedProject?.theme as ThemeMode | undefined) || globalTheme;
      upsertAndSetCurrentProject(projectPath, projectName, effectiveTheme);

      // Start spec generation in background
      setSpecCreatingForProject(projectPath);

      onOpenChange(false);
      navigate({ to: '/board' });

      // Use the spec regeneration API
      const api = getElectronAPI();
      if (api.specRegeneration && projectOverview.trim()) {
        const result = await api.specRegeneration.create(
          projectPath,
          projectOverview.trim(),
          generateFeatures,
          true, // analyzeProject
          generateFeatures ? featureCount : undefined
        );

        if (!result.success) {
          setSpecCreatingForProject(null);
          toast.error('Failed to create specification', {
            description: result.error,
          });
        } else {
          toast.info('Generating app specification...', {
            description: "This may take a minute. You'll be notified when complete.",
          });
        }
      } else {
        toast.success('Project created', { description: `Created ${projectName}` });
        setSpecCreatingForProject(null);
      }
    } catch (error) {
      setSpecCreatingForProject(null);
      toast.error('Failed to create project', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [
    projectPath,
    projectName,
    projectOverview,
    generateFeatures,
    featureCount,
    trashedProjects,
    globalTheme,
    upsertAndSetCurrentProject,
    setSpecCreatingForProject,
    onOpenChange,
    navigate,
  ]);

  const renderStep = () => {
    switch (step) {
      case 'select-folder':
        return (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-4">
                <FolderOpen className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">Select Root Directory</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Select the root directory of your project. This can be an empty directory for a new
                project or an existing codebase.
              </p>
            </div>
            <Button onClick={handleSelectFolder} className="w-full" size="lg">
              <FolderOpen className="h-4 w-4 mr-2" />
              Browse Folders
            </Button>
          </div>
        );

      case 'project-name':
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My Awesome Project"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Location</Label>
              <p className="text-sm bg-muted/50 rounded-md p-2 font-mono truncate">{projectPath}</p>
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleNext} disabled={!projectName.trim()}>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      case 'app-spec':
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="project-overview">
                Project Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="project-overview"
                value={projectOverview}
                onChange={(e) => setProjectOverview(e.target.value)}
                placeholder="Describe your project in a few sentences. This helps the AI understand what you're building."
                rows={4}
              />
            </div>

            <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="generate-features" className="font-medium">
                    Generate initial features
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    AI will suggest features based on your project
                  </p>
                </div>
                <Switch
                  id="generate-features"
                  checked={generateFeatures}
                  onCheckedChange={setGenerateFeatures}
                />
              </div>

              {generateFeatures && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Number of features</Label>
                    <span className="text-sm font-medium">{featureCount}</span>
                  </div>
                  <Slider
                    value={[featureCount]}
                    onValueChange={([val]) => setFeatureCount(val)}
                    min={1}
                    max={15}
                    step={1}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={handleBack} disabled={isProcessing}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleSkipSpec} disabled={isProcessing}>
                  Skip for now
                </Button>
                <Button onClick={handleGenerateSpec} disabled={isProcessing}>
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {isProcessing ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'select-folder':
        return 'Create New Project';
      case 'project-name':
        return 'Name Your Project';
      case 'app-spec':
        return 'Project Setup';
      default:
        return '';
    }
  };

  const getStepDescription = () => {
    switch (step) {
      case 'select-folder':
        return 'Start by selecting the root directory of your project';
      case 'project-name':
        return 'Give your project a memorable name';
      case 'app-spec':
        return 'Help the AI understand your project better';
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{getStepTitle()}</DialogTitle>
          <DialogDescription>{getStepDescription()}</DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 py-2">
          {['select-folder', 'project-name', 'app-spec'].map((s, i) => (
            <div
              key={s}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                step === s
                  ? 'bg-primary'
                  : ['project-name', 'app-spec'].indexOf(step) > i
                    ? 'bg-primary/50'
                    : 'bg-muted'
              )}
            />
          ))}
        </div>

        {renderStep()}
      </DialogContent>
    </Dialog>
  );
}
