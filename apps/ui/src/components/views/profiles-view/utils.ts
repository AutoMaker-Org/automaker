import type { ModelAlias, ModelProvider, AIProfile } from '@automaker/types';
import { CURSOR_MODEL_MAP } from '@automaker/types';

// Helper to determine provider from model (legacy, always returns 'claude')
export function getProviderFromModel(model: ModelAlias): ModelProvider {
  return 'claude';
}

/**
 * Validate an AI profile for completeness and correctness
 */
export function validateProfile(profile: Partial<AIProfile>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Name is required
  if (!profile.name?.trim()) {
    errors.push('Profile name is required');
  }

  // Provider must be valid
  if (!profile.provider || !['claude', 'cursor'].includes(profile.provider)) {
    errors.push('Invalid provider');
  }

  // Claude-specific validation
  if (profile.provider === 'claude') {
    if (!profile.model) {
      errors.push('Claude model is required');
    } else if (!['haiku', 'sonnet', 'opus'].includes(profile.model)) {
      errors.push('Invalid Claude model');
    }
  }

  // Cursor-specific validation
  if (profile.provider === 'cursor') {
    if (profile.cursorModel && !(profile.cursorModel in CURSOR_MODEL_MAP)) {
      errors.push('Invalid Cursor model');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
