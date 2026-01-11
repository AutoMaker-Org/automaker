import { VALIDATION_STALENESS_HOURS } from './constants';

/**
 * Check if a validation is stale (older than VALIDATION_STALENESS_HOURS)
 */
export function isValidationStale(validatedAt: string): boolean {
  const hoursSinceValidation = (Date.now() - new Date(validatedAt).getTime()) / (1000 * 60 * 60);
  return hoursSinceValidation > VALIDATION_STALENESS_HOURS;
}

/**
 * Format a date string to relative or absolute format
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes < 1) return 'just now';
      return `${diffMinutes}m ago`;
    }
    return `${diffHours}h ago`;
  }

  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;

  return date.toLocaleDateString();
}

/**
 * Map Linear priority (0-4) to feature priority (1-5)
 * 0 = no priority -> 3 (medium)
 * 1 = urgent -> 1 (highest)
 * 2 = high -> 2
 * 3 = medium -> 3
 * 4 = low -> 4
 */
export function mapLinearPriority(linearPriority: number): number {
  const priorityMap: Record<number, number> = {
    0: 3, // no priority -> medium
    1: 1, // urgent -> highest
    2: 2, // high -> high
    3: 3, // medium -> medium
    4: 4, // low -> low
  };
  return priorityMap[linearPriority] ?? 3;
}

/**
 * Get priority color based on Linear priority
 */
export function getPriorityColor(priority: number): string {
  switch (priority) {
    case 1:
      return 'text-red-500'; // urgent
    case 2:
      return 'text-orange-500'; // high
    case 3:
      return 'text-yellow-500'; // medium
    case 4:
      return 'text-blue-500'; // low
    default:
      return 'text-muted-foreground'; // no priority
  }
}

/**
 * Get workflow state type color
 */
export function getStateTypeColor(stateType: string): string {
  switch (stateType) {
    case 'backlog':
      return 'bg-gray-500';
    case 'unstarted':
      return 'bg-gray-400';
    case 'started':
      return 'bg-yellow-500';
    case 'completed':
      return 'bg-green-500';
    case 'canceled':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}
