import {
  Circle,
  CheckCircle2,
  X,
  Wand2,
  ExternalLink,
  Loader2,
  CheckCircle,
  Clock,
  GitPullRequest,
  User,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { cn } from '@/lib/utils';
import type { IssueDetailPanelProps } from '../types';
import { isValidationStale } from '../utils';

export function IssueDetailPanel({
  issue,
  validatingIssues,
  cachedValidations,
  onValidateIssue,
  onViewCachedValidation,
  onOpenInGitHub,
  onClose,
  onShowRevalidateConfirm,
  formatDate,
}: IssueDetailPanelProps) {
  const isValidating = validatingIssues.has(issue.number);
  const cached = cachedValidations.get(issue.number);
  const isStale = cached ? isValidationStale(cached.validatedAt) : false;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Detail Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          {issue.state === 'OPEN' ? (
            <Circle className="h-4 w-4 text-green-500 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" />
          )}
          <span className="text-sm font-medium truncate">
            #{issue.number} {issue.title}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(() => {
            if (isValidating) {
              return (
                <Button variant="default" size="sm" disabled>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Validating...
                </Button>
              );
            }

            if (cached && !isStale) {
              return (
                <>
                  <Button variant="outline" size="sm" onClick={() => onViewCachedValidation(issue)}>
                    <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                    View Result
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onShowRevalidateConfirm}
                    title="Re-validate"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </>
              );
            }

            if (cached && isStale) {
              return (
                <>
                  <Button variant="outline" size="sm" onClick={() => onViewCachedValidation(issue)}>
                    <Clock className="h-4 w-4 mr-1 text-yellow-500" />
                    View (stale)
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onValidateIssue(issue, { forceRevalidate: true })}
                  >
                    <Wand2 className="h-4 w-4 mr-1" />
                    Re-validate
                  </Button>
                </>
              );
            }

            return (
              <Button variant="default" size="sm" onClick={() => onValidateIssue(issue)}>
                <Wand2 className="h-4 w-4 mr-1" />
                Validate with AI
              </Button>
            );
          })()}
          <Button variant="outline" size="sm" onClick={() => onOpenInGitHub(issue.url)}>
            <ExternalLink className="h-4 w-4 mr-1" />
            Open in GitHub
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Issue Detail Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Title */}
        <h1 className="text-xl font-bold mb-2">{issue.title}</h1>

        {/* Meta info */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-xs font-medium',
              issue.state === 'OPEN'
                ? 'bg-green-500/10 text-green-500'
                : 'bg-purple-500/10 text-purple-500'
            )}
          >
            {issue.state === 'OPEN' ? 'Open' : 'Closed'}
          </span>
          <span>
            #{issue.number} opened {formatDate(issue.createdAt)} by{' '}
            <span className="font-medium text-foreground">{issue.author.login}</span>
          </span>
        </div>

        {/* Labels */}
        {issue.labels.length > 0 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {issue.labels.map((label) => (
              <span
                key={label.name}
                className="px-2 py-0.5 text-xs font-medium rounded-full"
                style={{
                  backgroundColor: `#${label.color}20`,
                  color: `#${label.color}`,
                  border: `1px solid #${label.color}40`,
                }}
              >
                {label.name}
              </span>
            ))}
          </div>
        )}

        {/* Assignees */}
        {issue.assignees && issue.assignees.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Assigned to:</span>
            <div className="flex items-center gap-2">
              {issue.assignees.map((assignee) => (
                <span
                  key={assignee.login}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20"
                >
                  {assignee.avatarUrl && (
                    <img
                      src={assignee.avatarUrl}
                      alt={assignee.login}
                      className="h-4 w-4 rounded-full"
                    />
                  )}
                  {assignee.login}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Linked Pull Requests */}
        {issue.linkedPRs && issue.linkedPRs.length > 0 && (
          <div className="mb-6 p-3 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <GitPullRequest className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">Linked Pull Requests</span>
            </div>
            <div className="space-y-2">
              {issue.linkedPRs.map((pr) => (
                <div key={pr.number} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        'px-1.5 py-0.5 text-xs font-medium rounded',
                        pr.state === 'open'
                          ? 'bg-green-500/10 text-green-500'
                          : pr.state === 'merged'
                            ? 'bg-purple-500/10 text-purple-500'
                            : 'bg-red-500/10 text-red-500'
                      )}
                    >
                      {pr.state === 'open' ? 'Open' : pr.state === 'merged' ? 'Merged' : 'Closed'}
                    </span>
                    <span className="text-muted-foreground">#{pr.number}</span>
                    <span className="truncate">{pr.title}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 shrink-0"
                    onClick={() => onOpenInGitHub(pr.url)}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        {issue.body ? (
          <Markdown className="text-sm">{issue.body}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground italic">No description provided.</p>
        )}

        {/* Open in GitHub CTA */}
        <div className="mt-8 p-4 rounded-lg bg-muted/50 border border-border">
          <p className="text-sm text-muted-foreground mb-3">
            View comments, add reactions, and more on GitHub.
          </p>
          <Button onClick={() => onOpenInGitHub(issue.url)}>
            <ExternalLink className="h-4 w-4 mr-2" />
            View Full Issue on GitHub
          </Button>
        </div>
      </div>
    </div>
  );
}
