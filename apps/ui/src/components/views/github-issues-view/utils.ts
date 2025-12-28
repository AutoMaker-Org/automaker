import type { IssueComplexity } from '@/lib/electron';
import { VALIDATION_STALENESS_HOURS } from './constants';

/**
 * Map issue complexity to feature priority.
 * Lower complexity issues get higher priority (1 = high, 2 = medium).
 */
export function getFeaturePriority(complexity: IssueComplexity | undefined): number {
  switch (complexity) {
    case 'trivial':
    case 'simple':
      return 1; // High priority for easy wins
    case 'moderate':
    case 'complex':
    case 'very_complex':
    default:
      return 2; // Medium priority for larger efforts
  }
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function isValidationStale(validatedAt: string): boolean {
  const hoursSinceValidation = (Date.now() - new Date(validatedAt).getTime()) / (1000 * 60 * 60);
  return hoursSinceValidation > VALIDATION_STALENESS_HOURS;
}
