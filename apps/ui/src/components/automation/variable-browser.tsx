/**
 * Variable Browser Component - Displays available variables for automation steps
 *
 * Shows all variables organized by scope:
 * - System: Read-only variables from automaker
 * - Project: User-defined project variables
 * - Workflow: Variables from the automation definition
 * - Steps: Outputs from previous steps
 *
 * Users can click on variables to insert them into step configurations.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Variable,
  Copy,
  Check,
  Lock,
  FolderOpen,
  Workflow,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiGet } from '@/lib/api-fetch';
import { writeToClipboard } from '@/lib/clipboard-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/store/app-store';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type {
  VariableBrowserGroup,
  VariableDescriptor,
  ListVariablesResult,
  WorkflowVariableDefinition,
} from '@automaker/types';

export interface VariableBrowserProps {
  /** Called when a variable is selected */
  onVariableSelect?: (variable: VariableDescriptor, syntax: string) => void;
  /** Workflow variables from the current automation */
  workflowVariables?: WorkflowVariableDefinition[];
  /** Step outputs from previous steps */
  stepOutputs?: Array<{ stepId: string; stepName?: string }>;
  /** Filter to specific scopes */
  scopes?: Array<'system' | 'project' | 'workflow' | 'steps'>;
  /** Show search input */
  showSearch?: boolean;
  /** Compact mode - smaller text and spacing */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

interface VariableGroupProps {
  group: VariableBrowserGroup;
  isOpen: boolean;
  onToggle: () => void;
  onVariableClick: (variable: VariableDescriptor) => void;
  copiedVariable: string | null;
  searchQuery: string;
  compact?: boolean;
}

const SCOPE_ICONS: Record<string, React.ReactNode> = {
  system: <Lock className="h-3.5 w-3.5" />,
  project: <FolderOpen className="h-3.5 w-3.5" />,
  workflow: <Workflow className="h-3.5 w-3.5" />,
  steps: <Layers className="h-3.5 w-3.5" />,
};

const SCOPE_VARIANTS: Record<string, 'muted' | 'secondary' | 'info' | 'success'> = {
  system: 'muted',
  project: 'secondary',
  workflow: 'info',
  steps: 'success',
};

function VariableGroup({
  group,
  isOpen,
  onToggle,
  onVariableClick,
  copiedVariable,
  searchQuery,
  compact,
}: VariableGroupProps) {
  const filteredVariables = useMemo(() => {
    if (!searchQuery) return group.variables;
    const query = searchQuery.toLowerCase();
    return group.variables.filter(
      (v) => v.name.toLowerCase().includes(query) || v.description.toLowerCase().includes(query)
    );
  }, [group.variables, searchQuery]);

  if (filteredVariables.length === 0 && searchQuery) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium',
            'hover:bg-accent/50 transition-colors',
            compact && 'py-1 text-xs'
          )}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          {SCOPE_ICONS[group.name]}
          <span className="flex-1">{group.label}</span>
          <Badge variant={SCOPE_VARIANTS[group.name]} size="sm">
            {filteredVariables.length}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={cn('space-y-1 pl-6 pt-1', compact && 'pl-4')}>
          {filteredVariables.map((variable) => (
            <VariableItem
              key={variable.name}
              variable={variable}
              onClick={() => onVariableClick(variable)}
              isCopied={copiedVariable === `${group.name}.${variable.name}`}
              compact={compact}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface VariableItemProps {
  variable: VariableDescriptor;
  onClick: () => void;
  isCopied: boolean;
  compact?: boolean;
}

function VariableItem({ variable, onClick, isCopied, compact }: VariableItemProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={`Insert variable ${variable.name}: ${variable.description}`}
      className={cn(
        'group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left',
        'hover:bg-accent/50 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        compact && 'py-1 text-xs'
      )}
      title={variable.description}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <code
            className={cn('font-mono text-primary truncate', compact ? 'text-[10px]' : 'text-xs')}
          >
            {variable.name}
          </code>
          {variable.readOnly && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
        </div>
        <p className={cn('text-muted-foreground truncate', compact ? 'text-[10px]' : 'text-xs')}>
          {variable.description}
        </p>
        {variable.example && (
          <p
            className={cn(
              'text-muted-foreground/60 font-mono truncate',
              compact ? 'text-[9px]' : 'text-[10px]'
            )}
          >
            Example: {variable.example}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {isCopied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className={cn('h-3.5 w-3.5 text-muted-foreground', compact && 'h-3 w-3')} />
        )}
      </div>
    </button>
  );
}

export function VariableBrowser({
  onVariableSelect,
  workflowVariables,
  stepOutputs,
  scopes,
  showSearch = true,
  compact = false,
  className,
}: VariableBrowserProps) {
  const [groups, setGroups] = useState<VariableBrowserGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['system', 'project']));
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);

  const projectPath = useAppStore((state) => state.currentProject?.path);

  const loadVariables = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (projectPath) {
        params.set('projectPath', projectPath);
      }
      if (workflowVariables && workflowVariables.length > 0) {
        params.set('workflowVariables', JSON.stringify(workflowVariables));
      }
      if (stepOutputs && stepOutputs.length > 0) {
        params.set('stepOutputs', JSON.stringify(stepOutputs));
      }
      if (scopes) {
        params.set('includeSystem', scopes.includes('system') ? 'true' : 'false');
        params.set('includeProject', scopes.includes('project') ? 'true' : 'false');
      }

      const result = await apiGet<ListVariablesResult>(
        `/api/automation/variables?${params.toString()}`
      );

      // Filter groups if scopes specified
      const filteredGroups = scopes
        ? result.groups.filter((g) =>
            scopes.includes(g.name as 'system' | 'project' | 'workflow' | 'steps')
          )
        : result.groups;

      setGroups(filteredGroups);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load variables';
      console.error('[VariableBrowser] Failed to load variables:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [projectPath, workflowVariables, stepOutputs, scopes]);

  useEffect(() => {
    loadVariables();
  }, [loadVariables]);

  const handleVariableClick = useCallback(
    (variable: VariableDescriptor, scope: string) => {
      const syntax = `{{${scope}.${variable.name}}}`;

      // Notify parent first - this must happen before clipboard write because
      // the legacy clipboard fallback creates a temporary textarea and calls .select(),
      // which moves focus outside the Popover's React tree and triggers Radix's
      // DismissableLayer focus-outside handler, prematurely closing the popover.
      onVariableSelect?.(variable, syntax);

      // Copy to clipboard after selection is handled (deferred to avoid focus interference)
      // Using void to explicitly ignore the promise - UI feedback is handled via copiedVariable state
      setTimeout(() => {
        void (async () => {
          try {
            const success = await writeToClipboard(syntax);
            if (success) {
              setCopiedVariable(`${scope}.${variable.name}`);
              setTimeout(() => setCopiedVariable(null), 2000);
            }
          } catch (error) {
            console.warn(
              '[VariableBrowser] Clipboard write failed:',
              error instanceof Error ? error.message : String(error)
            );
          }
        })();
      }, 0);
    },
    [onVariableSelect]
  );

  const toggleGroup = useCallback((groupName: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className={cn('p-4 text-center text-muted-foreground text-sm', className)}>
        Loading variables...
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-4 text-center', className)}>
        <p className="text-destructive text-sm mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={loadVariables} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col overflow-hidden', className)}>
      {showSearch && (
        <div className="p-2 border-b">
          <Input
            placeholder="Search variables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn('h-8', compact && 'h-7 text-xs')}
          />
        </div>
      )}

      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <div className={cn('p-2 space-y-1', compact && 'p-1')}>
          {groups.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-4">
              No variables available
            </div>
          ) : (
            groups.map((group) => (
              <VariableGroup
                key={group.name}
                group={group}
                isOpen={openGroups.has(group.name)}
                onToggle={() => toggleGroup(group.name)}
                onVariableClick={(variable) => handleVariableClick(variable, group.name)}
                copiedVariable={copiedVariable}
                searchQuery={searchQuery}
                compact={compact}
              />
            ))
          )}
        </div>
      </div>

      <div
        className={cn('p-2 border-t text-muted-foreground', compact ? 'text-[10px]' : 'text-xs')}
      >
        Click a variable to copy its syntax
      </div>
    </div>
  );
}

/**
 * Variable Picker Button - A compact trigger for the variable browser
 */
export function VariablePickerButton({
  onVariableSelect,
  workflowVariables,
  stepOutputs,
  className,
}: VariableBrowserProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={cn('relative', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="h-7 gap-1 text-xs"
      >
        <Variable className="h-3.5 w-3.5" />
        Variables
      </Button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-md border bg-popover shadow-lg h-64 max-h-[50vh] flex flex-col overflow-hidden">
            <VariableBrowser
              onVariableSelect={(variable, syntax) => {
                onVariableSelect?.(variable, syntax);
                setIsOpen(false);
              }}
              workflowVariables={workflowVariables}
              stepOutputs={stepOutputs}
              compact
            />
          </div>
        </>
      )}
    </div>
  );
}

export default VariableBrowser;
