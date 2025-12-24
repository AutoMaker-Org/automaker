import { useMemo, useCallback } from 'react';
import type { BeadsIssue } from '@automaker/types';
import { BEADS_COLUMNS, type BeadsColumnId } from '../constants';

interface UseBeadsColumnIssuesProps {
  issues: BeadsIssue[];
  searchQuery: string;
  currentProject: { path: string } | null;
}

export interface BeadsStats {
  total: number;
  open: number;
  inProgress: number;
  closed: number;
  blocked: number;
}

/**
 * Organizes bead issues into board columns and provides a column selector and basic counts.
 *
 * @returns An object containing:
 * - `columnIssuesMap`: a record mapping column IDs (`backlog`, `ready`, `in_progress`, `blocked`, `done`) to arrays of `BeadsIssue`. Each column's issues are ordered by priority (lower number = higher priority) and then by `createdAt` (older first).
 * - `getColumnIssues`: a function `(columnId: BeadsColumnId) => BeadsIssue[]` that returns the issues for the given column.
 * - `stats`: an object with issue counts `{ total, open, inProgress, closed, blocked }`.
 */
export function useBeadsColumnIssues({
  issues,
  searchQuery,
  currentProject,
}: UseBeadsColumnIssuesProps) {
  // Helper to check if an issue has open blockers
  const hasOpenBlockers = (issue: BeadsIssue, allIssues: BeadsIssue[]): boolean => {
    if (!issue.dependencies) return false;

    // Check each dependency
    for (const dep of issue.dependencies) {
      // Only check 'blocks' type dependencies
      if (dep.type === 'blocks') {
        const depIssue = allIssues.find((i) => i.id === dep.issueId);
        // If the blocking issue is open or in progress, it's blocking this issue
        if (depIssue && (depIssue.status === 'open' || depIssue.status === 'in_progress')) {
          return true;
        }
      }
    }
    return false;
  };

  // Helper to count how many issues this issue blocks
  const getBlockingCount = (issue: BeadsIssue, allIssues: BeadsIssue[]): number => {
    return allIssues.filter((otherIssue) => {
      if (!otherIssue.dependencies) return false;
      return otherIssue.dependencies.some(
        (dep) => dep.issueId === issue.id && dep.type === 'blocks'
      );
    }).length;
  };

  // Memoize column issues to prevent unnecessary re-renders
  const columnIssuesMap = useMemo(() => {
    const map: Record<BeadsColumnId, BeadsIssue[]> = {
      backlog: [],
      ready: [],
      in_progress: [],
      blocked: [],
      done: [],
    };

    // Normalize search query
    const normalizedQuery = searchQuery.toLowerCase().trim();

    // Filter issues by search query (case-insensitive)
    const filteredIssues = normalizedQuery
      ? issues.filter(
          (issue) =>
            issue.title.toLowerCase().includes(normalizedQuery) ||
            issue.description.toLowerCase().includes(normalizedQuery) ||
            issue.labels?.some((label) => label.toLowerCase().includes(normalizedQuery))
        )
      : issues;

    // Categorize issues into columns
    filteredIssues.forEach((issue) => {
      const blockers = hasOpenBlockers(issue, issues);

      if (issue.status === 'closed') {
        map.done.push(issue);
      } else if (issue.status === 'in_progress') {
        map.in_progress.push(issue);
      } else if (blockers) {
        // Open issues with blockers go to Blocked
        map.blocked.push(issue);
      } else if (issue.status === 'open') {
        // Open issues without blockers go to Ready
        map.ready.push(issue);
      } else {
        // Other cases go to backlog
        map.backlog.push(issue);
      }
    });

    // Sort issues within each column by priority (0=highest) then by creation date
    Object.keys(map).forEach((columnId) => {
      map[columnId as BeadsColumnId].sort((a, b) => {
        // First sort by priority (lower number = higher priority)
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        // Then by creation date (older first)
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    });

    return map;
  }, [issues, searchQuery]);

  const getColumnIssues = useCallback(
    (columnId: BeadsColumnId) => {
      return columnIssuesMap[columnId];
    },
    [columnIssuesMap]
  );

  // Calculate statistics
  const stats = useMemo(() => {
    const total = issues.length;
    const open = issues.filter((i) => i.status === 'open').length;
    const inProgress = issues.filter((i) => i.status === 'in_progress').length;
    const closed = issues.filter((i) => i.status === 'closed').length;
    const blocked = issues.filter((i) => hasOpenBlockers(i, issues)).length;

    return { total, open, inProgress, closed, blocked };
  }, [issues]);

  return {
    columnIssuesMap,
    getColumnIssues,
    stats,
  };
}
