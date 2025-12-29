import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileCode,
  Lightbulb,
  AlertTriangle,
  Plus,
  GitPullRequest,
  Clock,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  IssueValidationResult,
  IssueValidationVerdict,
  IssueValidationConfidence,
  IssueComplexity,
  GitHubIssue,
} from '@/lib/electron';

interface ValidationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: GitHubIssue | null;
  validationResult: IssueValidationResult | null;
  onConvertToTask?: (issue: GitHubIssue, validation: IssueValidationResult) => void;
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

const confidenceConfig: Record<IssueValidationConfidence, { label: string; color: string }> = {
  high: { label: 'High Confidence', color: 'text-green-500' },
  medium: { label: 'Medium Confidence', color: 'text-yellow-500' },
  low: { label: 'Low Confidence', color: 'text-orange-500' },
};

const complexityConfig: Record<IssueComplexity, { label: string; color: string }> = {
  trivial: { label: 'Trivial', color: 'text-green-500' },
  simple: { label: 'Simple', color: 'text-blue-500' },
  moderate: { label: 'Moderate', color: 'text-yellow-500' },
  complex: { label: 'Complex', color: 'text-orange-500' },
  very_complex: { label: 'Very Complex', color: 'text-red-500' },
};

export function ValidationDialog({
  open,
  onOpenChange,
  issue,
  validationResult,
  onConvertToTask,
}: ValidationDialogProps) {
  if (!issue) return null;

  const handleConvertToTask = () => {
    if (validationResult && onConvertToTask) {
      onConvertToTask(issue, validationResult);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Issue Validation Result</DialogTitle>
          <DialogDescription>
            #{issue.number}: {issue.title}
          </DialogDescription>
        </DialogHeader>

        {validationResult ? (
          <div className="space-y-6 py-4">
            {/* Verdict Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {(() => {
                  const config = verdictConfig[validationResult.verdict];
                  const Icon = config.icon;
                  return (
                    <>
                      <div className={cn('p-2 rounded-lg', config.bgColor)}>
                        <Icon className={cn('h-6 w-6', config.color)} />
                      </div>
                      <div>
                        <p className={cn('text-lg font-semibold', config.color)}>{config.label}</p>
                        <p
                          className={cn(
                            'text-sm',
                            confidenceConfig[validationResult.confidence].color
                          )}
                        >
                          {confidenceConfig[validationResult.confidence].label}
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>
              {validationResult.estimatedComplexity && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Estimated Complexity</p>
                  <p
                    className={cn(
                      'text-sm font-medium',
                      complexityConfig[validationResult.estimatedComplexity].color
                    )}
                  >
                    {complexityConfig[validationResult.estimatedComplexity].label}
                  </p>
                </div>
              )}
            </div>

            {/* Bug Confirmed Badge */}
            {validationResult.bugConfirmed && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                <span className="text-sm font-medium text-red-500">Bug Confirmed in Codebase</span>
              </div>
            )}

            {/* PR Analysis Section - Show AI's analysis of linked PRs */}
            {validationResult.prAnalysis && validationResult.prAnalysis.hasOpenPR && (
              <div
                className={cn(
                  'p-3 rounded-lg border',
                  validationResult.prAnalysis.recommendation === 'wait_for_merge'
                    ? 'bg-green-500/10 border-green-500/20'
                    : validationResult.prAnalysis.recommendation === 'pr_needs_work'
                      ? 'bg-yellow-500/10 border-yellow-500/20'
                      : 'bg-purple-500/10 border-purple-500/20'
                )}
              >
                <div className="flex items-start gap-2">
                  {validationResult.prAnalysis.recommendation === 'wait_for_merge' ? (
                    <Clock className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  ) : validationResult.prAnalysis.recommendation === 'pr_needs_work' ? (
                    <Wrench className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                  ) : (
                    <GitPullRequest className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <span
                      className={cn(
                        'text-sm font-medium',
                        validationResult.prAnalysis.recommendation === 'wait_for_merge'
                          ? 'text-green-500'
                          : validationResult.prAnalysis.recommendation === 'pr_needs_work'
                            ? 'text-yellow-500'
                            : 'text-purple-500'
                      )}
                    >
                      {validationResult.prAnalysis.recommendation === 'wait_for_merge'
                        ? 'Fix Ready - Wait for Merge'
                        : validationResult.prAnalysis.recommendation === 'pr_needs_work'
                          ? 'PR Needs Work'
                          : 'Work in Progress'}
                    </span>
                    {validationResult.prAnalysis.prNumber && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        PR #{validationResult.prAnalysis.prNumber}
                        {validationResult.prAnalysis.prFixesIssue && ' appears to fix this issue'}
                      </p>
                    )}
                    {validationResult.prAnalysis.prSummary && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {validationResult.prAnalysis.prSummary}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Fallback Work in Progress Badge - Show when there's an open PR but no AI analysis */}
            {!validationResult.prAnalysis?.hasOpenPR &&
              issue.linkedPRs?.some((pr) => pr.state === 'open' || pr.state === 'OPEN') && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <GitPullRequest className="h-5 w-5 text-purple-500 shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-purple-500">Work in Progress</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {issue.linkedPRs
                        .filter((pr) => pr.state === 'open' || pr.state === 'OPEN')
                        .map((pr) => `PR #${pr.number}`)
                        .join(', ')}{' '}
                      is open for this issue
                    </p>
                  </div>
                </div>
              )}

            {/* Reasoning */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-muted-foreground" />
                Analysis
              </h4>
              <div className="bg-muted/30 p-3 rounded-lg border border-border">
                <Markdown>{validationResult.reasoning}</Markdown>
              </div>
            </div>

            {/* Related Files */}
            {validationResult.relatedFiles && validationResult.relatedFiles.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-muted-foreground" />
                  Related Files
                </h4>
                <div className="space-y-1">
                  {validationResult.relatedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="text-sm font-mono bg-muted/50 px-2 py-1 rounded text-muted-foreground"
                    >
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested Fix */}
            {validationResult.suggestedFix && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Suggested Approach</h4>
                <div className="bg-muted/30 p-3 rounded-lg border border-border">
                  <Markdown>{validationResult.suggestedFix}</Markdown>
                </div>
              </div>
            )}

            {/* Missing Info (for needs_clarification) */}
            {validationResult.missingInfo && validationResult.missingInfo.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  Missing Information
                </h4>
                <ul className="space-y-1 list-disc list-inside">
                  {validationResult.missingInfo.map((info, index) => (
                    <li key={index} className="text-sm text-muted-foreground">
                      {info}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">No validation result available.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {validationResult?.verdict === 'valid' &&
            onConvertToTask &&
            validationResult?.prAnalysis?.recommendation !== 'wait_for_merge' && (
              <Button onClick={handleConvertToTask}>
                <Plus className="h-4 w-4 mr-2" />
                Convert to Task
              </Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
