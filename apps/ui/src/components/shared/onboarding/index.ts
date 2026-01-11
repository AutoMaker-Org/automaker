/**
 * Shared Onboarding Components
 *
 * Generic onboarding wizard infrastructure for building
 * interactive tutorials across different views.
 */

export { OnboardingWizard } from './onboarding-wizard';
export { useOnboardingWizard } from './use-onboarding-wizard';
export type {
  OnboardingStep,
  OnboardingState,
  OnboardingWizardProps,
  UseOnboardingWizardOptions,
  UseOnboardingWizardResult,
} from './types';
export {
  ONBOARDING_STORAGE_PREFIX,
  ONBOARDING_TARGET_ATTRIBUTE,
  ONBOARDING_ANALYTICS,
} from './constants';
