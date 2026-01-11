/**
 * Enhancement types for AI-powered task description improvements
 */

/**
 * Available enhancement modes for transforming task descriptions
 */
export type EnhancementMode = 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer';

/**
 * Example input/output pair for few-shot learning
 */
export interface EnhancementExample {
  input: string;
  output: string;
}
