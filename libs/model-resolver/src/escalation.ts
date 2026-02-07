/**
 * Model escalation utilities for retry logic
 *
 * Provides model escalation chain for automatic retry with increasingly capable models.
 * Used by auto-mode retry system to escalate from cheaper to more capable models on failure.
 */

import { resolveModelString } from './resolver.js';

/**
 * Escalation chain from least to most capable Claude model.
 * Uses full model strings for reliable comparison.
 */
const ESCALATION_CHAIN = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5-20250929',
  'claude-opus-4-6',
];

/**
 * Get the next model in the escalation chain for retry attempts.
 *
 * @param currentModel - The current model string (alias or full ID)
 * @returns The next tier model string, or null if already at the top or not a Claude model
 */
export function getEscalatedModel(currentModel: string): string | null {
  // Resolve to full model string for comparison
  const resolved = resolveModelString(currentModel);

  // Find position in escalation chain
  const currentIndex = ESCALATION_CHAIN.indexOf(resolved);

  if (currentIndex === -1) {
    // Not in escalation chain (non-Claude model like cursor, codex, opencode, or provider model)
    return null;
  }

  if (currentIndex >= ESCALATION_CHAIN.length - 1) {
    // Already at the top of the chain (opus)
    return null;
  }

  return ESCALATION_CHAIN[currentIndex + 1];
}
