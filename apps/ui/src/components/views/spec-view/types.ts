// Spec view mode - determines how the spec is displayed/edited
export type SpecViewMode = 'view' | 'edit' | 'source';

// Feature count options for spec generation
export type FeatureCount = 20 | 50 | 100;

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
  onRegenerate: () => void;
  onGenerateFeaturesOnly?: () => void;
  isRegenerating: boolean;
  isGeneratingFeatures?: boolean;
}
