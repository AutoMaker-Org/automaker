import { createLogger } from '@automaker/utils/logger';
import { useSetupStore } from '@/store/setup-store';
import { StepIndicator } from './setup-view/components';
import {
  WelcomeStep,
  ThemeStep,
  CompleteStep,
  ClaudeSetupStep,
  CursorSetupStep,
  GitHubSetupStep,
} from './setup-view/steps';
import { useNavigate } from '@tanstack/react-router';

const logger = createLogger('SetupView');

// Main Setup View
export function SetupView() {
  const { currentStep, setCurrentStep, completeSetup, setSkipClaudeSetup } = useSetupStore();
  const navigate = useNavigate();

  const steps = ['welcome', 'theme', 'claude', 'cursor', 'github', 'complete'] as const;
  type StepName = (typeof steps)[number];
  const getStepName = (): StepName => {
    if (currentStep === 'claude_detect' || currentStep === 'claude_auth') return 'claude';
    if (currentStep === 'welcome') return 'welcome';
    if (currentStep === 'theme') return 'theme';
    if (currentStep === 'cursor') return 'cursor';
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
        logger.debug('[Setup Flow] Moving to claude_detect step');
        setCurrentStep('claude_detect');
        break;
      case 'claude':
        logger.debug('[Setup Flow] Moving to cursor step');
        setCurrentStep('cursor');
        break;
      case 'cursor':
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
      case 'claude':
        setCurrentStep('theme');
        break;
      case 'cursor':
        setCurrentStep('claude_detect');
        break;
      case 'github':
        setCurrentStep('cursor');
        break;
    }
  };

  const handleSkipClaude = () => {
    logger.debug('[Setup Flow] Skipping Claude setup');
    setSkipClaudeSetup(true);
    setCurrentStep('cursor');
  };

  const handleSkipCursor = () => {
    logger.debug('[Setup Flow] Skipping Cursor setup');
    setCurrentStep('github');
  };

  const handleSkipGithub = () => {
    logger.debug('[Setup Flow] Skipping GitHub setup');
    setCurrentStep('complete');
  };

  const handleFinish = () => {
    logger.debug('[Setup Flow] handleFinish called - completing setup');
    completeSetup();
    logger.debug('[Setup Flow] Setup completed, redirecting to welcome view');
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

            {(currentStep === 'claude_detect' || currentStep === 'claude_auth') && (
              <ClaudeSetupStep
                onNext={() => handleNext('claude')}
                onBack={() => handleBack('claude')}
                onSkip={handleSkipClaude}
              />
            )}

            {currentStep === 'cursor' && (
              <CursorSetupStep
                onNext={() => handleNext('cursor')}
                onBack={() => handleBack('cursor')}
                onSkip={handleSkipCursor}
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
