export type SummaryValue = string | null | undefined;

/**
 * Returns the first summary candidate that contains non-whitespace content.
 * The original string is returned (without trimming) to preserve formatting.
 */
export function getFirstNonEmptySummary(...candidates: SummaryValue[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return null;
}
