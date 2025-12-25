import { useMemo, useCallback } from 'react';
import type { BeadsIssue } from '@automaker/types';
import type { BeadsColumnId } from '../constants';
import { getIssueColumn, hasOpenBlockers } from '../lib/column-utils';

interface UseBeadsColumnIssuesProps {
  issues: BeadsIssue[];
  searchQuery: string;
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
export function useBeadsColumnIssues({ issues, searchQuery }: UseBeadsColumnIssuesProps) {
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

    // Categorize issues into columns using the shared utility
    filteredIssues.forEach((issue) => {
      const column = getIssueColumn(issue, issues);
      map[column].push(issue);
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
