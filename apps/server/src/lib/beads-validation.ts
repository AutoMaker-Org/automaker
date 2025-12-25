/**
 * Zod validation schemas for Beads API routes
 *
 * Provides runtime type validation and sanitization for Beads operations.
 */

import { z } from 'zod';

// ============================================================================
// Reusable Base Schemas
// ============================================================================

/**
 * Issue ID schema (format: bd-[a-z0-9]+(\.\d+)?)
 */
export const beadsIssueIdSchema = z.string().regex(/^bd-[a-z0-9]+(\.\d+)?$/, {
  message: 'Invalid issue ID format. Expected format: bd-xxxxx or bd-xxxxx.1',
});

/**
 * Issue status schema
 */
export const beadsIssueStatusSchema = z.enum(['open', 'in_progress', 'closed'] as const);

/**
 * Issue type schema
 */
export const beadsIssueTypeSchema = z.enum(['bug', 'feature', 'task', 'epic', 'chore'] as const);

/**
 * Priority schema (0-4, where 0 is highest)
 */
export const beadsIssuePrioritySchema = z.number().int().min(0).max(4, {
  message: 'Priority must be between 0 (highest) and 4 (lowest)',
});

/**
 * Labels schema (array of strings, max 50 chars each, max 10 labels)
 */
export const beadsLabelsSchema = z
  .array(z.string().max(50, 'Each label must be 50 characters or less'))
  .max(10, 'Cannot have more than 10 labels')
  .optional();

/**
 * Dependency type schema
 */
export const beadsDependencyTypeSchema = z.enum([
  'blocks',
  'related',
  'parent',
  'discovered-from',
] as const);

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Create issue input schema
 */
export const createBeadsIssueSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less')
    .regex(/^[^<>{}$]*$/, 'Title contains invalid characters'),
  description: z.string().max(10000, 'Description must be 10000 characters or less').optional(),
  type: beadsIssueTypeSchema.optional(),
  priority: beadsIssuePrioritySchema.optional(),
  labels: beadsLabelsSchema,
  parentIssueId: beadsIssueIdSchema.optional(),
});

/**
 * Update issue input schema
 */
export const updateBeadsIssueSchema = z
  .object({
    title: z
      .string()
      .min(1, 'Title is required')
      .max(200, 'Title must be 200 characters or less')
      .regex(/^[^<>{}$]/, 'Title contains invalid characters')
      .optional(),
    description: z.string().max(10000, 'Description must be 10000 characters or less').optional(),
    status: beadsIssueStatusSchema.optional(),
    type: beadsIssueTypeSchema.optional(),
    priority: beadsIssuePrioritySchema.optional(),
    labels: beadsLabelsSchema,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be specified for update',
  });

/**
 * Delete issue input schema
 */
export const deleteBeadsIssueSchema = z.object({
  issueId: beadsIssueIdSchema,
  force: z.boolean().optional(),
});

/**
 * Add dependency schema
 */
export const addDependencySchema = z.object({
  issueId: beadsIssueIdSchema,
  depId: beadsIssueIdSchema,
  type: beadsDependencyTypeSchema,
});

/**
 * Remove dependency schema
 */
export const removeDependencySchema = z.object({
  issueId: beadsIssueIdSchema,
  depId: beadsIssueIdSchema,
});

/**
 * List issues filters schema
 */
export const listBeadsIssuesFiltersSchema = z
  .object({
    status: z.array(beadsIssueStatusSchema).optional(),
    type: z.array(beadsIssueTypeSchema).optional(),
    labels: z.array(z.string()).optional(),
    priorityMin: beadsIssuePrioritySchema.optional(),
    priorityMax: beadsIssuePrioritySchema.optional(),
    titleContains: z.string().max(200).optional(),
    descContains: z.string().max(200).optional(),
    ids: z.array(beadsIssueIdSchema).optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.priorityMin !== undefined && data.priorityMax !== undefined) {
        return data.priorityMin <= data.priorityMax;
      }
      return true;
    },
    { message: 'priorityMin must be less than or equal to priorityMax' }
  );

/**
 * Search issues schema
 */
export const searchBeadsIssuesSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(200),
  limit: z.number().int().min(1).max(100).optional(),
  inComments: z.boolean().optional(),
});

/**
 * Get stale issues schema
 */
export const getStaleIssuesSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
});

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/**
 * Beads route params schema (for /:projectPath routes)
 */
export const beadsRouteParamsSchema = z.object({
  projectPath: z.string().min(1, 'projectPath is required'),
});

/**
 * Issue ID route params schema (for /:projectPath/issues/:issueId routes)
 */
export const beadsIssueRouteParamsSchema = z.object({
  projectPath: z.string().min(1, 'projectPath is required'),
  issueId: beadsIssueIdSchema,
});

// ============================================================================
// Type Exports
// ============================================================================

export type CreateBeadsIssueInput = z.infer<typeof createBeadsIssueSchema>;
export type UpdateBeadsIssueInput = z.infer<typeof updateBeadsIssueSchema>;
export type DeleteBeadsIssueInput = z.infer<typeof deleteBeadsIssueSchema>;
export type AddDependencyInput = z.infer<typeof addDependencySchema>;
export type RemoveDependencyInput = z.infer<typeof removeDependencySchema>;
export type ListBeadsIssuesFilters = z.infer<typeof listBeadsIssuesFiltersSchema>;
export type SearchBeadsIssuesInput = z.infer<typeof searchBeadsIssuesSchema>;
export type GetStaleIssuesInput = z.infer<typeof getStaleIssuesSchema>;
