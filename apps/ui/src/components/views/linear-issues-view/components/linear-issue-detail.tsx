import { memo } from 'react';
import {
  X,
  ExternalLink,
  User,
  Calendar,
  Tag,
  Folder,
  Flag,
  GitBranch,
  Wand2,
  Loader2,
  CheckCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { LinearIssue, StoredLinearValidation } from '@/lib/electron';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDate, getPriorityColor, isValidationStale } from '../utils';
import { ModelOverrideTrigger } from '@/components/shared';
import type { PhaseModelEntry } from '@automaker/types';
import ReactMarkdown from 'react-markdown';

interface LinearIssueDetailProps {
  issue: LinearIssue;
  onClose: () => void;
  onOpenInLinear: () => void;
  // Validation props
  isValidating?: boolean;
  cachedValidation?: StoredLinearValidation | null;
  onValidateIssue?: (options?: { forceRevalidate?: boolean }) => void;
  onViewCachedValidation?: () => void;
  modelOverride?: {
    effectiveModelEntry: PhaseModelEntry;
    setOverride: (entry: PhaseModelEntry | null) => void;
    isOverridden: boolean;
  };
}

export const LinearIssueDetail = memo(function LinearIssueDetail({
  issue,
  onClose,
  onOpenInLinear,
  isValidating = false,
  cachedValidation,
  onValidateIssue,
  onViewCachedValidation,
  modelOverride,
}: LinearIssueDetailProps) {
  const isStale = cachedValidation ? isValidationStale(cachedValidation.validatedAt) : false;

  const renderValidationButtons = () => {
    // If no validation handlers provided, don't show validation UI
    if (!onValidateIssue || !modelOverride) {
      return null;
    }

    if (isValidating) {
      return (
        <Button variant="default" size="sm" disabled>
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          Validating...
        </Button>
      );
    }

    if (cachedValidation && !isStale) {
      return (
        <>
          <Button variant="outline" size="sm" onClick={onViewCachedValidation}>
            <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
            View Result
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onValidateIssue({ forceRevalidate: true })}
            title="Re-validate"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </>
      );
    }

    if (cachedValidation && isStale) {
      return (
        <>
          <Button variant="outline" size="sm" onClick={onViewCachedValidation}>
            <Clock className="h-4 w-4 mr-1 text-yellow-500" />
            View (stale)
          </Button>
          <ModelOverrideTrigger
            currentModelEntry={modelOverride.effectiveModelEntry}
            onModelChange={modelOverride.setOverride}
            phase="validationModel"
            isOverridden={modelOverride.isOverridden}
            size="sm"
            variant="icon"
            className="mx-1"
          />
          <Button
            variant="default"
            size="sm"
            onClick={() => onValidateIssue({ forceRevalidate: true })}
          >
            <Wand2 className="h-4 w-4 mr-1" />
            Re-validate
          </Button>
        </>
      );
    }

    // No cached validation
    return (
      <>
        <ModelOverrideTrigger
          currentModelEntry={modelOverride.effectiveModelEntry}
          onModelChange={modelOverride.setOverride}
          phase="validationModel"
          isOverridden={modelOverride.isOverridden}
          size="sm"
          variant="icon"
          className="mr-1"
        />
        <Button variant="default" size="sm" onClick={() => onValidateIssue()}>
          <Wand2 className="h-4 w-4 mr-1" />
          Validate with AI
        </Button>
      </>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-mono text-muted-foreground shrink-0">
            {issue.identifier}
          </span>
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: issue.state?.color || '#888' }}
            title={issue.state?.name || 'Unknown'}
          />
        </div>
        <div className="flex items-center gap-1">
          {renderValidationButtons()}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenInLinear}>
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Title */}
          <h2 className="text-lg font-semibold leading-tight">{issue.title}</h2>

          {/* Meta info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {/* Status */}
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: issue.state?.color || '#888' }}
              />
              <span className="text-muted-foreground">Status:</span>
              <span>{issue.state?.name || 'Unknown'}</span>
            </div>

            {/* Priority */}
            <div className="flex items-center gap-2">
              <Flag className={`h-4 w-4 ${getPriorityColor(issue.priority)}`} />
              <span className="text-muted-foreground">Priority:</span>
              <span className={getPriorityColor(issue.priority)}>{issue.priorityLabel}</span>
            </div>

            {/* Assignee */}
            <div className="flex items-center gap-2">
              {issue.assignee?.avatarUrl ? (
                <img
                  src={issue.assignee.avatarUrl}
                  alt={issue.assignee.displayName}
                  className="w-4 h-4 rounded-full"
                />
              ) : (
                <User className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-muted-foreground">Assignee:</span>
              <span>{issue.assignee?.displayName || 'Unassigned'}</span>
            </div>

            {/* Team */}
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Team:</span>
              <span>{issue.team.name}</span>
            </div>

            {/* Project */}
            {issue.project && (
              <div className="flex items-center gap-2 col-span-2">
                <Folder className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Project:</span>
                <span>{issue.project.name}</span>
              </div>
            )}

            {/* Created */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Created:</span>
              <span>{formatDate(issue.createdAt)}</span>
            </div>

            {/* Updated */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Updated:</span>
              <span>{formatDate(issue.updatedAt)}</span>
            </div>
          </div>

          {/* Labels */}
          {issue.labels.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
              {issue.labels.map((label) => (
                <Badge
                  key={label.id}
                  variant="outline"
                  className="text-xs"
                  style={{
                    backgroundColor: `${label.color}20`,
                    borderColor: label.color,
                    color: label.color,
                  }}
                >
                  {label.name}
                </Badge>
              ))}
            </div>
          )}

          <Separator />

          {/* Description */}
          {issue.description ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{issue.description}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No description provided.</p>
          )}

          {/* Parent issue */}
          {issue.parent && (
            <>
              <Separator />
              <div className="text-sm">
                <span className="text-muted-foreground">Parent issue: </span>
                <span className="font-mono">{issue.parent.identifier}</span>
                <span className="text-muted-foreground ml-2">{issue.parent.title}</span>
              </div>
            </>
          )}

          {/* Estimate */}
          {issue.estimate !== undefined && (
            <div className="text-sm">
              <span className="text-muted-foreground">Estimate: </span>
              <span>{issue.estimate} points</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});
