'use client';

import { useState } from 'react';
import {
  Zap,
  ClipboardList,
  FileText,
  ScrollText,
  Check,
  Eye,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { PlanSpec } from '@/store/app-store';

export type PlanningMode = 'skip' | 'lite' | 'spec' | 'full';

// Re-export for backwards compatibility
export type { ParsedTask, PlanSpec } from '@/store/app-store';

interface PlanningModeSelectorProps {
  mode: PlanningMode;
  onModeChange: (mode: PlanningMode) => void;
  requireApproval?: boolean;
  onRequireApprovalChange?: (require: boolean) => void;
  planSpec?: PlanSpec;
  onGenerateSpec?: () => void;
  onApproveSpec?: () => void;
  onRejectSpec?: () => void;
  onViewSpec?: () => void;
  isGenerating?: boolean;
  featureDescription?: string; // For auto-generation context
  testIdPrefix?: string;
  compact?: boolean; // For use in dialogs vs settings
}

const modes = [
  {
    value: 'skip' as const,
    label: 'Skip',
    description: 'Direct implementation, no upfront planning',
    icon: Zap,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    badge: 'Default',
  },
  {
    value: 'lite' as const,
    label: 'Lite',
    description: 'Think through approach, create task list',
    icon: ClipboardList,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  {
    value: 'spec' as const,
    label: 'Spec',
    description: 'Generate spec with acceptance criteria',
    icon: FileText,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    badge: 'Approval Required',
  },
  {
    value: 'full' as const,
    label: 'Full',
    description: 'Comprehensive spec with phased plan',
    icon: ScrollText,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    badge: 'Approval Required',
  },
];

export function PlanningModeSelector({
  mode,
  onModeChange,
  requireApproval,
  onRequireApprovalChange,
  planSpec,
  onGenerateSpec,
  onApproveSpec,
  onRejectSpec,
  onViewSpec,
  isGenerating = false,
  featureDescription,
  testIdPrefix = 'planning',
  compact = false,
}: PlanningModeSelectorProps) {
  const [showPreview, setShowPreview] = useState(false);
  const selectedMode = modes.find((m) => m.value === mode);
  const requiresApproval = mode === 'spec' || mode === 'full';
  const canGenerate = requiresApproval && featureDescription?.trim() && !isGenerating;
  const hasSpec = planSpec && planSpec.content;

  return (
    <div className="space-y-4">
      {/* Header with icon */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center',
              selectedMode?.bgColor || 'bg-muted'
            )}
          >
            {selectedMode && <selectedMode.icon className={cn('h-4 w-4', selectedMode.color)} />}
          </div>
          <div>
            <Label className="text-sm font-medium">Planning Mode</Label>
            <p className="text-xs text-muted-foreground">
              Choose how much upfront planning before implementation
            </p>
          </div>
        </div>

        {/* Quick action buttons when spec/full mode */}
        {requiresApproval && hasSpec && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onViewSpec} className="h-7 px-2">
              <Eye className="h-3.5 w-3.5 mr-1" />
              View
            </Button>
          </div>
        )}
      </div>

      {/* Mode Selection Cards */}
      <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')}>
        {modes.map((m) => {
          const isSelected = mode === m.value;
          const Icon = m.icon;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => onModeChange(m.value)}
              data-testid={`${testIdPrefix}-mode-${m.value}`}
              className={cn(
                'flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-all duration-200',
                'border-2 hover:border-primary/50',
                isSelected
                  ? cn('border-primary', m.bgColor)
                  : 'border-border/50 bg-card/50 hover:bg-accent/30'
              )}
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                  isSelected ? m.bgColor : 'bg-muted'
                )}
              >
                <Icon
                  className={cn(
                    'h-5 w-5 transition-colors',
                    isSelected ? m.color : 'text-muted-foreground'
                  )}
                />
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <span
                    className={cn(
                      'font-medium text-sm',
                      isSelected ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {m.label}
                  </span>
                  {m.badge && (
                    <span
                      className={cn(
                        'text-[9px] px-1 py-0.5 rounded font-medium',
                        m.badge === 'Default'
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : 'bg-amber-500/15 text-amber-500'
                      )}
                    >
                      {m.badge === 'Default' ? 'Default' : 'Review'}
                    </span>
                  )}
                </div>
                {!compact && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                    {m.description}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Require Approval Checkbox - Only show when mode !== 'skip' */}
      {mode !== 'skip' && onRequireApprovalChange && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          <Checkbox
            id="require-approval"
            checked={requireApproval}
            onCheckedChange={(checked) => onRequireApprovalChange(checked === true)}
            data-testid={`${testIdPrefix}-require-approval-checkbox`}
          />
          <Label
            htmlFor="require-approval"
            className="text-sm text-muted-foreground cursor-pointer"
          >
            Manually approve plan before implementation
          </Label>
        </div>
      )}

      {/* Spec Preview/Actions Panel - Only for spec/full modes */}
      {requiresApproval && (
        <div
          className={cn(
            'rounded-xl border transition-all duration-300',
            planSpec?.status === 'approved'
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : planSpec?.status === 'generated'
                ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-border/50 bg-muted/30'
          )}
        >
          <div className="p-4 space-y-3">
            {/* Status indicator */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isGenerating ? (
                  <>
                    <Spinner size="sm" />
                    <span className="text-sm text-muted-foreground">
                      Generating {mode === 'full' ? 'comprehensive spec' : 'spec'}...
                    </span>
                  </>
                ) : planSpec?.status === 'approved' ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm text-emerald-500 font-medium">Spec Approved</span>
                  </>
                ) : planSpec?.status === 'generated' ? (
                  <>
                    <Eye className="h-4 w-4 text-amber-500" />
                    <span className="text-sm text-amber-500 font-medium">
                      Spec Ready for Review
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Spec will be generated when feature starts
                    </span>
                  </>
                )}
              </div>

              {/* Auto-generate toggle area */}
              {!planSpec?.status && canGenerate && onGenerateSpec && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onGenerateSpec}
                  disabled={isGenerating}
                  className="h-7"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Pre-generate
                </Button>
              )}
            </div>

            {/* Spec content preview */}
            {hasSpec && (
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                  className="w-full justify-between h-8 px-2"
                >
                  <span className="text-xs text-muted-foreground">
                    {showPreview ? 'Hide Preview' : 'Show Preview'}
                  </span>
                  <Eye className="h-3.5 w-3.5" />
                </Button>

                {showPreview && (
                  <div className="rounded-lg bg-background/80 border border-border/50 p-3 max-h-48 overflow-y-auto">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                      {planSpec.content}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons when spec is generated */}
            {planSpec?.status === 'generated' && (
              <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                <Button variant="outline" size="sm" onClick={onRejectSpec} className="flex-1">
                  Request Changes
                </Button>
                <Button
                  size="sm"
                  onClick={onApproveSpec}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Approve Spec
                </Button>
              </div>
            )}

            {/* Regenerate option when approved */}
            {planSpec?.status === 'approved' && onGenerateSpec && (
              <div className="flex items-center justify-end pt-2 border-t border-border/30">
                <Button variant="ghost" size="sm" onClick={onGenerateSpec} className="h-7">
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Regenerate
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info text for non-approval modes */}
      {!requiresApproval && (
        <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          {mode === 'skip'
            ? 'The agent will start implementing immediately without creating a plan or spec.'
            : "The agent will create a planning outline before implementing, but won't wait for approval."}
        </p>
      )}
    </div>
  );
}
