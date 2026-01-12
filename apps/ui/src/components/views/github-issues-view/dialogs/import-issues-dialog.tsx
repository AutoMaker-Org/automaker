import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertCircle, Import, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GitHubIssue, StoredValidation, IssueValidationVerdict } from '@/lib/electron';

interface ImportIssuesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issues: GitHubIssue[];
  cachedValidations: Map<number, StoredValidation>;
  validatingIssues: Set<number>;
  onImport: (issues: GitHubIssue[]) => Promise<void>;
}

const verdictConfig: Record<
  IssueValidationVerdict,
  { label: string; color: string; bgColor: string; icon: typeof CheckCircle2 }
> = {
  valid: {
    label: 'Valid',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    icon: CheckCircle2,
  },
  invalid: {
    label: 'Invalid',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    icon: XCircle,
  },
  needs_clarification: {
    label: 'Needs Clarification',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    icon: AlertCircle,
  },
};

export function ImportIssuesDialog({
  open,
  onOpenChange,
  issues,
  cachedValidations,
  validatingIssues,
  onImport,
}: ImportIssuesDialogProps) {
  const [selectedIssues, setSelectedIssues] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  // Filter issues that can be imported (have valid validation)
  const importableIssues = useMemo(() => {
    return issues.filter((issue) => {
      const validation = cachedValidations.get(issue.number);
      return validation?.result.verdict === 'valid';
    });
  }, [issues, cachedValidations]);

  // Count by status
  const statusCounts = useMemo(() => {
    let valid = 0;
    let invalid = 0;
    let needsClarification = 0;
    let notValidated = 0;

    for (const issue of issues) {
      const validation = cachedValidations.get(issue.number);
      if (!validation) {
        notValidated++;
      } else {
        switch (validation.result.verdict) {
          case 'valid':
            valid++;
            break;
          case 'invalid':
            invalid++;
            break;
          case 'needs_clarification':
            needsClarification++;
            break;
        }
      }
    }

    return { valid, invalid, needsClarification, notValidated };
  }, [issues, cachedValidations]);

  const handleSelectAll = () => {
    if (selectedIssues.size === importableIssues.length) {
      setSelectedIssues(new Set());
    } else {
      setSelectedIssues(new Set(importableIssues.map((i) => i.number)));
    }
  };

  const handleToggleIssue = (issueNumber: number) => {
    const newSelected = new Set(selectedIssues);
    if (newSelected.has(issueNumber)) {
      newSelected.delete(issueNumber);
    } else {
      newSelected.add(issueNumber);
    }
    setSelectedIssues(newSelected);
  };

  const handleImport = async () => {
    const issuesToImport = issues.filter((i) => selectedIssues.has(i.number));
    if (issuesToImport.length === 0) return;

    setImporting(true);
    try {
      await onImport(issuesToImport);
      setSelectedIssues(new Set());
      onOpenChange(false);
    } finally {
      setImporting(false);
    }
  };

  // Reset selection when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedIssues(new Set());
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Import className="h-5 w-5" />
            Import Issues as Tasks
          </DialogTitle>
          <DialogDescription>
            Select validated issues to import as tasks into your backlog.
          </DialogDescription>
        </DialogHeader>

        {/* Status Summary */}
        <div className="flex flex-wrap gap-2 py-2 border-b border-border">
          <Badge variant="outline" className="text-green-500 border-green-500/30">
            {statusCounts.valid} valid
          </Badge>
          <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
            {statusCounts.needsClarification} needs clarification
          </Badge>
          <Badge variant="outline" className="text-red-500 border-red-500/30">
            {statusCounts.invalid} invalid
          </Badge>
          <Badge variant="outline" className="text-muted-foreground">
            {statusCounts.notValidated} not validated
          </Badge>
        </div>

        {/* Issues List */}
        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[400px]">
          {issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <AlertCircle className="h-8 w-8 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">No open issues found.</p>
            </div>
          ) : (
            <div className="space-y-1 py-2">
              {issues.map((issue) => {
                const validation = cachedValidations.get(issue.number);
                const isValidating = validatingIssues.has(issue.number);
                const isImportable = validation?.result.verdict === 'valid';
                const isSelected = selectedIssues.has(issue.number);

                return (
                  <div
                    key={issue.number}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                      isImportable
                        ? 'hover:bg-muted/50 cursor-pointer'
                        : 'opacity-50 cursor-not-allowed',
                      isSelected && 'bg-primary/10 border-primary/30'
                    )}
                    onClick={() => isImportable && handleToggleIssue(issue.number)}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={!isImportable}
                      onCheckedChange={() => isImportable && handleToggleIssue(issue.number)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground">
                          #{issue.number}
                        </span>
                        <span className="text-sm font-medium truncate">{issue.title}</span>
                      </div>
                      {issue.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {issue.labels.slice(0, 3).map((label) => (
                            <Badge key={label.name} variant="outline" className="text-xs">
                              {label.name}
                            </Badge>
                          ))}
                          {issue.labels.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{issue.labels.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isValidating ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : validation ? (
                        (() => {
                          const config = verdictConfig[validation.result.verdict];
                          const Icon = config.icon;
                          return (
                            <div className={cn('flex items-center gap-1', config.color)}>
                              <Icon className="h-4 w-4" />
                              <span className="text-xs">{config.label}</span>
                            </div>
                          );
                        })()
                      ) : (
                        <span className="text-xs text-muted-foreground">Not validated</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-4">
          <div className="flex items-center justify-between w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              disabled={importableIssues.length === 0}
            >
              {selectedIssues.size === importableIssues.length && importableIssues.length > 0
                ? 'Deselect All'
                : `Select All Valid (${importableIssues.length})`}
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={selectedIssues.size === 0 || importing}>
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Import className="h-4 w-4 mr-2" />
                    Import {selectedIssues.size} Issue{selectedIssues.size !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
