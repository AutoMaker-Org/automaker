// Feature count options for spec generation
export type FeatureCount = number;

// Generation phases for UI display
export type GenerationPhase =
  | 'initialization'
  | 'setup'
  | 'analysis'
  | 'spec_complete'
  | 'feature_generation'
  | 'complete'
  | 'error';

// Props for the unified create spec dialog
export interface CreateSpecDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectOverview: string;
  onProjectOverviewChange: (value: string) => void;
  generateFeatures: boolean;
  onGenerateFeaturesChange: (value: boolean) => void;
  analyzeProject: boolean;
  onAnalyzeProjectChange: (value: boolean) => void;
  featureCount: FeatureCount;
  onFeatureCountChange: (value: FeatureCount) => void;
  useWorktreeBranch: boolean;
  onUseWorktreeBranchChange: (value: boolean) => void;
  worktreeBranch: string;
  onWorktreeBranchChange: (value: string) => void;
  onCreateSpec: () => void;
  onSkip?: () => void;
  isCreatingSpec: boolean;
  showSkipButton?: boolean;
  title?: string;
  description?: string;
}

// Props for the regenerate spec dialog
export interface RegenerateSpecDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectDefinition: string;
  onProjectDefinitionChange: (value: string) => void;
  generateFeatures: boolean;
  onGenerateFeaturesChange: (value: boolean) => void;
  analyzeProject: boolean;
  onAnalyzeProjectChange: (value: boolean) => void;
  featureCount: FeatureCount;
  onFeatureCountChange: (value: FeatureCount) => void;
  useWorktreeBranch: boolean;
  onUseWorktreeBranchChange: (value: boolean) => void;
  worktreeBranch: string;
  onWorktreeBranchChange: (value: string) => void;
  onRegenerate: () => void;
  onGenerateFeaturesOnly?: () => void;
  isRegenerating: boolean;
  isGeneratingFeatures?: boolean;
}
