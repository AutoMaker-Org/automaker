import { useSetupStore } from '@/store/setup-store';
import { StepIndicator } from './setup-view/components';
import {
  WelcomeStep,
  ThemeStep,
  CompleteStep,
  ClaudeSetupStep,
  GitHubSetupStep,
  ProviderSelectionStep,
  ZaiSetupStep,
} from './setup-view/steps';
import { useNavigate } from '@tanstack/react-router';

// Main Setup View
export function SetupView() {
  const { currentStep, setCurrentStep, completeSetup, selectedProvider } = useSetupStore();
  const navigate = useNavigate();

  // Steps for the progress indicator
  const steps = ['welcome', 'theme', 'provider', 'setup', 'github', 'complete'] as const;
  type StepName = (typeof steps)[number];

  const getStepName = (): StepName => {
    if (currentStep === 'welcome') return 'welcome';
    if (currentStep === 'theme') return 'theme';
    if (currentStep === 'provider_selection') return 'provider';
    if (currentStep === 'claude_setup' || currentStep === 'zai_setup') return 'setup';
    if (currentStep === 'github') return 'github';
    return 'complete';
  };

  const currentIndex = steps.indexOf(getStepName());

  const handleNext = (from: string) => {
    console.log('[Setup Flow] handleNext called from:', from, 'currentStep:', currentStep);
    switch (from) {
      case 'welcome':
        console.log('[Setup Flow] Moving to theme step');
        setCurrentStep('theme');
        break;
      case 'theme':
        console.log('[Setup Flow] Moving to provider_selection step');
        setCurrentStep('provider_selection');
        break;
      case 'provider_selection':
        // Move to the appropriate setup step based on selected provider
        if (selectedProvider === 'claude') {
          console.log('[Setup Flow] Moving to claude_setup step');
          setCurrentStep('claude_setup');
        } else if (selectedProvider === 'zai') {
          console.log('[Setup Flow] Moving to zai_setup step');
          setCurrentStep('zai_setup');
        }
        break;
      case 'claude_setup':
      case 'zai_setup':
        console.log('[Setup Flow] Moving to github step');
        setCurrentStep('github');
        break;
      case 'github':
        console.log('[Setup Flow] Moving to complete step');
        setCurrentStep('complete');
        break;
    }
  };

  const handleBack = (from: string) => {
    console.log('[Setup Flow] handleBack called from:', from);
    switch (from) {
      case 'theme':
        setCurrentStep('welcome');
        break;
      case 'provider_selection':
        setCurrentStep('theme');
        break;
      case 'claude_setup':
      case 'zai_setup':
        setCurrentStep('provider_selection');
        break;
      case 'github':
        // Go back to the setup step that was selected
        if (selectedProvider === 'claude') {
          setCurrentStep('claude_setup');
        } else {
          setCurrentStep('zai_setup');
        }
        break;
    }
  };

  const handleSkipProvider = () => {
    console.log('[Setup Flow] Skipping provider setup');
    setCurrentStep('github');
  };

  const handleSkipGithub = () => {
    console.log('[Setup Flow] Skipping GitHub setup');
    setCurrentStep('complete');
  };

  const handleFinish = () => {
    console.log('[Setup Flow] handleFinish called - completing setup');
    completeSetup();
    console.log('[Setup Flow] Setup completed, redirecting to welcome view');
    navigate({ to: '/' });
  };

  return (
    <div className="h-full flex flex-col content-bg" data-testid="setup-view">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-glass backdrop-blur-md titlebar-drag-region">
        <div className="px-8 py-4">
          <div className="flex items-center gap-3 titlebar-no-drag">
            <img src="/logo.png" alt="Automaker" className="w-8 h-8" />
            <span className="text-lg font-semibold text-foreground">Automaker Setup</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 flex items-center justify-center">
        <div className="w-full max-w-2xl mx-auto px-8">
          <div className="mb-8">
            <StepIndicator currentStep={currentIndex} totalSteps={steps.length} />
          </div>

          <div>
            {currentStep === 'welcome' && <WelcomeStep onNext={() => handleNext('welcome')} />}

            {currentStep === 'theme' && (
              <ThemeStep onNext={() => handleNext('theme')} onBack={() => handleBack('theme')} />
            )}

            {currentStep === 'provider_selection' && (
              <ProviderSelectionStep
                onNext={() => handleNext('provider_selection')}
                onBack={() => handleBack('provider_selection')}
                onSkip={handleSkipProvider}
              />
            )}

            {currentStep === 'claude_setup' && (
              <ClaudeSetupStep
                onNext={() => handleNext('claude_setup')}
                onBack={() => handleBack('claude_setup')}
                onSkip={handleSkipProvider}
              />
            )}

            {currentStep === 'zai_setup' && (
              <ZaiSetupStep
                onNext={() => handleNext('zai_setup')}
                onBack={() => handleBack('zai_setup')}
                onSkip={handleSkipProvider}
              />
            )}

            {currentStep === 'github' && (
              <GitHubSetupStep
                onNext={() => handleNext('github')}
                onBack={() => handleBack('github')}
                onSkip={handleSkipGithub}
              />
            )}

            {currentStep === 'complete' && <CompleteStep onFinish={handleFinish} />}
          </div>
        </div>
      </div>
    </div>
  );
}
