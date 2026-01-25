import { useMemo } from 'react';
import type { GitHubIssue, StoredValidation } from '@/lib/electron';
import type { IssuesFilterState, IssuesFilterResult, IssuesValidationStatus } from '../types';
import { isValidationStale } from '../utils';

/**
 * Determines the validation status of an issue based on its cached validation.
 */
function getValidationStatus(
  issueNumber: number,
  cachedValidations: Map<number, StoredValidation>
): IssuesValidationStatus | null {
  const validation = cachedValidations.get(issueNumber);
  if (!validation) {
    return 'not_validated';
  }
  if (isValidationStale(validation.validatedAt)) {
    return 'stale';
  }
  return 'validated';
}

/**
 * Checks if a search query matches an issue's searchable content.
 * Searches through title and body (case-insensitive).
 */
function matchesSearchQuery(issue: GitHubIssue, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;

  const titleMatch = issue.title?.toLowerCase().includes(normalizedQuery);
  const bodyMatch = issue.body?.toLowerCase().includes(normalizedQuery);

  return titleMatch || bodyMatch;
}

/**
 * Checks if an issue matches the state filter (open/closed/all).
 * Note: GitHub CLI returns state in uppercase (OPEN/CLOSED), so we compare case-insensitively.
 */
function matchesStateFilter(
  issue: GitHubIssue,
  stateFilter: IssuesFilterState['stateFilter']
): boolean {
  if (stateFilter === 'all') return true;
  return issue.state.toLowerCase() === stateFilter;
}

/**
 * Checks if an issue matches any of the selected labels.
 * Returns true if no labels are selected (no filter) or if any selected label matches.
 */
function matchesLabels(issue: GitHubIssue, selectedLabels: string[]): boolean {
  if (selectedLabels.length === 0) return true;

  const issueLabels = issue.labels.map((l) => l.name);
  return selectedLabels.some((label) => issueLabels.includes(label));
}

/**
 * Checks if an issue matches any of the selected assignees.
 * Returns true if no assignees are selected (no filter) or if any selected assignee matches.
 */
function matchesAssignees(issue: GitHubIssue, selectedAssignees: string[]): boolean {
  if (selectedAssignees.length === 0) return true;

  const issueAssignees = issue.assignees?.map((a) => a.login) ?? [];
  return selectedAssignees.some((assignee) => issueAssignees.includes(assignee));
}

/**
 * Checks if an issue matches any of the selected milestones.
 * Returns true if no milestones are selected (no filter) or if any selected milestone matches.
 * Note: GitHub issues may not have milestone data in the current schema, this is a placeholder.
 */
function matchesMilestones(issue: GitHubIssue, selectedMilestones: string[]): boolean {
  if (selectedMilestones.length === 0) return true;

  // GitHub issues in the current schema don't have milestone field
  // This is a placeholder for future milestone support
  // For now, issues with no milestone won't match if a milestone filter is active
  return false;
}

/**
 * Checks if an issue matches the validation status filter.
 */
function matchesValidationStatus(
  issue: GitHubIssue,
  validationStatusFilter: IssuesValidationStatus | null,
  cachedValidations: Map<number, StoredValidation>
): boolean {
  if (!validationStatusFilter) return true;

  const status = getValidationStatus(issue.number, cachedValidations);
  return status === validationStatusFilter;
}

/**
 * Extracts all unique labels from a list of issues.
 */
function extractAvailableLabels(issues: GitHubIssue[]): string[] {
  const labelsSet = new Set<string>();
  for (const issue of issues) {
    for (const label of issue.labels) {
      labelsSet.add(label.name);
    }
  }
  return Array.from(labelsSet).sort();
}

/**
 * Extracts all unique assignees from a list of issues.
 */
function extractAvailableAssignees(issues: GitHubIssue[]): string[] {
  const assigneesSet = new Set<string>();
  for (const issue of issues) {
    for (const assignee of issue.assignees ?? []) {
      assigneesSet.add(assignee.login);
    }
  }
  return Array.from(assigneesSet).sort();
}

/**
 * Extracts all unique milestones from a list of issues.
 * Note: Currently returns empty array as milestone is not in the GitHubIssue schema.
 */
function extractAvailableMilestones(_issues: GitHubIssue[]): string[] {
  // GitHub issues in the current schema don't have milestone field
  // This is a placeholder for future milestone support
  return [];
}

/**
 * Determines if any filter is currently active.
 */
function hasActiveFilterCheck(filterState: IssuesFilterState): boolean {
  const {
    searchQuery,
    stateFilter,
    selectedLabels,
    selectedAssignees,
    selectedMilestones,
    validationStatusFilter,
  } = filterState;

  // Note: stateFilter 'open' is the default, so we consider it "not active" for UI purposes
  // Only 'closed' or 'all' are considered active filters
  const hasStateFilter = stateFilter !== 'open';
  const hasSearchQuery = searchQuery.trim().length > 0;
  const hasLabelFilter = selectedLabels.length > 0;
  const hasAssigneeFilter = selectedAssignees.length > 0;
  const hasMilestoneFilter = selectedMilestones.length > 0;
  const hasValidationFilter = validationStatusFilter !== null;

  return (
    hasSearchQuery ||
    hasStateFilter ||
    hasLabelFilter ||
    hasAssigneeFilter ||
    hasMilestoneFilter ||
    hasValidationFilter
  );
}

/**
 * Hook to filter GitHub issues based on the current filter state.
 *
 * This hook follows the same pattern as useGraphFilter but is tailored for GitHub issues.
 * It computes matched issues and extracts available filter options from all issues.
 *
 * @param issues - Combined array of all issues (open + closed) to filter
 * @param filterState - Current filter state including search, labels, assignees, etc.
 * @param cachedValidations - Map of issue numbers to their cached validation results
 * @returns Filter result containing matched issue numbers and available filter options
 */
export function useIssuesFilter(
  issues: GitHubIssue[],
  filterState: IssuesFilterState,
  cachedValidations: Map<number, StoredValidation> = new Map()
): IssuesFilterResult {
  const {
    searchQuery,
    stateFilter,
    selectedLabels,
    selectedAssignees,
    selectedMilestones,
    validationStatusFilter,
  } = filterState;

  return useMemo(() => {
    // Extract available options from all issues (for filter dropdown population)
    const availableLabels = extractAvailableLabels(issues);
    const availableAssignees = extractAvailableAssignees(issues);
    const availableMilestones = extractAvailableMilestones(issues);

    // Check if any filter is active
    const hasActiveFilter = hasActiveFilterCheck(filterState);

    // Normalize search query for case-insensitive matching
    const normalizedQuery = searchQuery.toLowerCase().trim();

    // Filter issues based on all criteria - return matched issues directly
    // This eliminates the redundant O(n) filtering operation in the consuming component
    const matchedIssues: GitHubIssue[] = [];

    for (const issue of issues) {
      // All conditions must be true for a match
      const matchesAllFilters =
        matchesSearchQuery(issue, normalizedQuery) &&
        matchesStateFilter(issue, stateFilter) &&
        matchesLabels(issue, selectedLabels) &&
        matchesAssignees(issue, selectedAssignees) &&
        matchesMilestones(issue, selectedMilestones) &&
        matchesValidationStatus(issue, validationStatusFilter, cachedValidations);

      if (matchesAllFilters) {
        matchedIssues.push(issue);
      }
    }

    return {
      matchedIssues,
      availableLabels,
      availableAssignees,
      availableMilestones,
      hasActiveFilter,
      matchedCount: matchedIssues.length,
    };
  }, [
    issues,
    searchQuery,
    stateFilter,
    selectedLabels,
    selectedAssignees,
    selectedMilestones,
    validationStatusFilter,
    cachedValidations,
  ]);
}
