import { createLogger } from '@automaker/utils/logger';
import { useSetupStore } from '@/store/setup-store';
import { StepIndicator } from './setup-view/components';
import {
  WelcomeStep,
  ThemeStep,
  CompleteStep,
  ProvidersSetupStep,
  GitHubSetupStep,
} from './setup-view/steps';
import { useNavigate } from '@tanstack/react-router';

const logger = createLogger('SetupView');

// Main Setup View
export function SetupView() {
  const { currentStep, setCurrentStep, completeSetup } = useSetupStore();
  const navigate = useNavigate();

  // Simplified steps: welcome, theme, providers (combined), github, complete
  const steps = ['welcome', 'theme', 'providers', 'github', 'complete'] as const;
  type StepName = (typeof steps)[number];

  const getStepName = (): StepName => {
    // Map old step names to new consolidated steps
    if (currentStep === 'welcome') return 'welcome';
    if (currentStep === 'theme') return 'theme';
    if (
      currentStep === 'claude_detect' ||
      currentStep === 'claude_auth' ||
      currentStep === 'cursor' ||
      currentStep === 'codex' ||
      currentStep === 'opencode' ||
      currentStep === 'providers'
    ) {
      return 'providers';
    }
    if (currentStep === 'github') return 'github';
    return 'complete';
  };

  const currentIndex = steps.indexOf(getStepName());

  const handleNext = (from: string) => {
    logger.debug('[Setup Flow] handleNext called from:', from, 'currentStep:', currentStep);
    switch (from) {
      case 'welcome':
        logger.debug('[Setup Flow] Moving to theme step');
        setCurrentStep('theme');
        break;
      case 'theme':
        logger.debug('[Setup Flow] Moving to providers step');
        setCurrentStep('providers');
        break;
      case 'providers':
        logger.debug('[Setup Flow] Moving to github step');
        setCurrentStep('github');
        break;
      case 'github':
        logger.debug('[Setup Flow] Moving to complete step');
        setCurrentStep('complete');
        break;
    }
  };

  const handleBack = (from: string) => {
    logger.debug('[Setup Flow] handleBack called from:', from);
    switch (from) {
      case 'theme':
        setCurrentStep('welcome');
        break;
      case 'providers':
        setCurrentStep('theme');
        break;
      case 'github':
        setCurrentStep('providers');
        break;
    }
  };

  const handleSkipGithub = () => {
    logger.debug('[Setup Flow] Skipping GitHub setup');
    setCurrentStep('complete');
  };

  const handleFinish = () => {
    logger.debug('[Setup Flow] handleFinish called - completing setup');
    completeSetup();
    logger.debug('[Setup Flow] Setup completed, redirecting to dashboard');
    navigate({ to: '/dashboard' });
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

            {(currentStep === 'providers' ||
              currentStep === 'claude_detect' ||
              currentStep === 'claude_auth' ||
              currentStep === 'cursor' ||
              currentStep === 'codex' ||
              currentStep === 'opencode') && (
              <ProvidersSetupStep
                onNext={() => handleNext('providers')}
                onBack={() => handleBack('providers')}
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
