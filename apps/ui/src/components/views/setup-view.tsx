import { useSetupStore } from '@/store/setup-store';
import { StepIndicator } from './setup-view/components';
import {
  WelcomeStep,
  ThemeStep,
  CompleteStep,
  CursorSetupStep,
  CodexSetupStep,
  OpenCodeSetupStep,
  ClaudeSetupStep,
  GitHubSetupStep,
} from './setup-view/steps';
import { useNavigate } from '@tanstack/react-router';

// Main Setup View
export function SetupView() {
  const {
    currentStep,
    setCurrentStep,
    completeSetup,
    setSkipCursorSetup,
    setSkipClaudeSetup,
    setSkipOpenCodeSetup,
    setSkipCodexSetup,
  } = useSetupStore();
  const navigate = useNavigate();

  const steps = [
    'welcome',
    'theme',
    'cursor',
    'codex',
    'opencode',
    'claude',
    'github',
    'complete',
  ] as const;
  type StepName = (typeof steps)[number];
  const getStepName = (): StepName => {
    if (currentStep === 'cursor_setup') return 'cursor';
    if (currentStep === 'codex_setup') return 'codex';
    if (currentStep === 'opencode_setup') return 'opencode';
    if (currentStep === 'claude_detect' || currentStep === 'claude_auth') return 'claude';
    if (currentStep === 'welcome') return 'welcome';
    if (currentStep === 'theme') return 'theme';
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
        console.log('[Setup Flow] Moving to cursor_setup step');
        setCurrentStep('cursor_setup');
        break;
      case 'cursor':
        console.log('[Setup Flow] Moving to codex_setup step');
        setCurrentStep('codex_setup');
        break;
      case 'codex':
        console.log('[Setup Flow] Moving to opencode_setup step');
        setCurrentStep('opencode_setup');
        break;
      case 'opencode':
        console.log('[Setup Flow] Moving to claude_detect step');
        setCurrentStep('claude_detect');
        break;
      case 'claude':
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
      case 'cursor':
        setCurrentStep('theme');
        break;
      case 'codex':
        setCurrentStep('cursor_setup');
        break;
      case 'opencode':
        setCurrentStep('codex_setup');
        break;
      case 'claude':
        setCurrentStep('opencode_setup');
        break;
      case 'github':
        setCurrentStep('claude_detect');
        break;
    }
  };

  const handleSkipCursor = () => {
    console.log('[Setup Flow] Skipping Cursor setup');
    setSkipCursorSetup(true);
    setCurrentStep('codex_setup');
  };

  const handleSkipCodex = () => {
    console.log('[Setup Flow] Skipping Codex setup');
    setSkipCodexSetup(true);
    setCurrentStep('opencode_setup');
  };

  const handleSkipOpenCode = () => {
    console.log('[Setup Flow] Skipping OpenCode setup');
    setSkipOpenCodeSetup(true);
    setCurrentStep('claude_detect');
  };

  const handleSkipClaude = () => {
    console.log('[Setup Flow] Skipping Claude setup');
    setSkipClaudeSetup(true);
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

            {currentStep === 'cursor_setup' && (
              <CursorSetupStep
                onNext={() => handleNext('cursor')}
                onBack={() => handleBack('cursor')}
                onSkip={handleSkipCursor}
              />
            )}

            {currentStep === 'codex_setup' && (
              <CodexSetupStep
                onNext={() => handleNext('codex')}
                onBack={() => handleBack('codex')}
                onSkip={handleSkipCodex}
              />
            )}

            {currentStep === 'opencode_setup' && (
              <OpenCodeSetupStep
                onNext={() => handleNext('opencode')}
                onBack={() => handleBack('opencode')}
                onSkip={handleSkipOpenCode}
              />
            )}

            {(currentStep === 'claude_detect' || currentStep === 'claude_auth') && (
              <ClaudeSetupStep
                onNext={() => handleNext('claude')}
                onBack={() => handleBack('claude')}
                onSkip={handleSkipClaude}
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
