import * as React from 'react';
import { GitBranch } from 'lucide-react';
import { Autocomplete, AutocompleteOption } from '@/components/ui/autocomplete';

interface BranchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  branches: string[];
  branchCardCounts?: Record<string, number>; // Map of branch name to unarchived card count
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  allowCreate?: boolean; // Whether to allow creating new branches (default: true)
  emptyMessage?: string; // Message shown when no branches match the search
  'data-testid'?: string;
}

export function BranchAutocomplete({
  value,
  onChange,
  branches,
  branchCardCounts,
  placeholder = 'Select a branch...',
  className,
  disabled = false,
  error = false,
  allowCreate = true,
  emptyMessage = 'No branches found.',
  'data-testid': testId,
}: BranchAutocompleteProps) {
  // Always include "main" at the top of suggestions
  const branchOptions: AutocompleteOption[] = React.useMemo(() => {
    const branchSet = new Set(['main', ...branches]);
    return Array.from(branchSet).map((branch) => {
      const cardCount = branchCardCounts?.[branch];
      // Show card count if available, otherwise show "default" for main branch only
      const badge =
        branchCardCounts !== undefined
          ? String(cardCount ?? 0)
          : branch === 'main'
            ? 'default'
            : undefined;

      return {
        value: branch,
        label: branch,
        badge,
      };
    });
  }, [branches, branchCardCounts]);

  return (
    <Autocomplete
      value={value}
      onChange={onChange}
      options={branchOptions}
      placeholder={placeholder}
      searchPlaceholder={allowCreate ? 'Search or type new branch...' : 'Search branches...'}
      emptyMessage={emptyMessage}
      className={className}
      disabled={disabled}
      error={error}
      icon={GitBranch}
      allowCreate={allowCreate}
      createLabel={(v) => `Create "${v}"`}
      data-testid={testId}
      itemTestIdPrefix="branch-option"
    />
  );
}
