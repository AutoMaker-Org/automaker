'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PlanContentViewer } from './plan-content-viewer';
import { Label } from '@/components/ui/label';
import { Feature } from '@/store/app-store';
import { Check, RefreshCw, Edit2, Eye } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

interface PlanApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: Feature | null;
  planContent: string;
  onApprove: (editedPlan?: string) => void;
  onReject: (feedback?: string) => void;
  isLoading?: boolean;
  viewOnly?: boolean;
}

export function PlanApprovalDialog({
  open,
  onOpenChange,
  feature,
  planContent,
  onApprove,
  onReject,
  isLoading = false,
  viewOnly = false,
}: PlanApprovalDialogProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedPlan, setEditedPlan] = useState(planContent);
  const [showRejectFeedback, setShowRejectFeedback] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [showFullDescription, setShowFullDescription] = useState(false);

  const DESCRIPTION_LIMIT = 250;
  const TITLE_LIMIT = 50;

  // Reset state when dialog opens or plan content changes
  useEffect(() => {
    if (open) {
      setEditedPlan(planContent);
      setIsEditMode(false);
      setShowRejectFeedback(false);
      setRejectFeedback('');
      setShowFullDescription(false);
    }
  }, [open, planContent]);

  const handleApprove = () => {
    // Only pass edited plan if it was modified
    const wasEdited = editedPlan !== planContent;
    onApprove(wasEdited ? editedPlan : undefined);
  };

  const handleReject = () => {
    if (showRejectFeedback) {
      onReject(rejectFeedback.trim() || undefined);
    } else {
      setShowRejectFeedback(true);
    }
  };

  const handleCancelReject = () => {
    setShowRejectFeedback(false);
    setRejectFeedback('');
  };

  const handleClose = (open: boolean) => {
    if (!open && !isLoading) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="w-full h-full max-w-full max-h-full sm:w-[90vw] sm:max-w-[900px] sm:max-h-[85dvh] sm:h-auto sm:rounded-xl rounded-none flex flex-col dialog-fullscreen-mobile"
        data-testid="plan-approval-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {viewOnly ? 'View Plan' : 'Review Plan'}
            {feature?.title && feature.title.length <= TITLE_LIMIT && (
              <span className="font-normal text-muted-foreground"> - {feature.title}</span>
            )}
          </DialogTitle>
          <DialogDescription>
            {viewOnly
              ? 'View the generated plan for this feature.'
              : 'Review the generated plan before implementation begins.'}
            {feature && (
              <span className="block mt-2 text-primary">
                Feature:{' '}
                {showFullDescription || feature.description.length <= DESCRIPTION_LIMIT
                  ? feature.description
                  : `${feature.description.slice(0, DESCRIPTION_LIMIT)}...`}
                {feature.description.length > DESCRIPTION_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setShowFullDescription(!showFullDescription)}
                    className="ml-1 text-muted-foreground hover:text-foreground underline text-sm"
                  >
                    {showFullDescription ? 'show less' : 'show more'}
                  </button>
                )}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Mode Toggle - Only show when not in viewOnly mode */}
          {!viewOnly && (
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm text-muted-foreground">
                {isEditMode ? 'Edit Mode' : 'View Mode'}
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditMode(!isEditMode)}
                disabled={isLoading}
              >
                {isEditMode ? (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    View
                  </>
                ) : (
                  <>
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Plan Content */}
          <div className="flex-1 overflow-y-auto sm:max-h-[60vh] border border-border rounded-lg">
            {isEditMode && !viewOnly ? (
              <Textarea
                value={editedPlan}
                onChange={(e) => setEditedPlan(e.target.value)}
                className="min-h-[200px] sm:min-h-[400px] h-full w-full border-0 rounded-lg resize-none font-mono text-sm"
                placeholder="Enter plan content..."
                disabled={isLoading}
              />
            ) : (
              <PlanContentViewer content={editedPlan || ''} className="p-4" />
            )}
          </div>

          {/* Revision Feedback Section - Only show when not in viewOnly mode */}
          {showRejectFeedback && !viewOnly && (
            <div className="mt-4 space-y-2">
              <Label htmlFor="reject-feedback">What changes would you like?</Label>
              <Textarea
                id="reject-feedback"
                value={rejectFeedback}
                onChange={(e) => setRejectFeedback(e.target.value)}
                placeholder="Describe the changes you'd like to see in the plan..."
                className="min-h-[80px]"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to cancel the feature, or provide feedback to regenerate the plan.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 flex-col sm:flex-row">
          {viewOnly ? (
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
          ) : showRejectFeedback ? (
            <>
              <Button
                variant="ghost"
                onClick={handleCancelReject}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                Back
              </Button>
              <Button
                variant="secondary"
                onClick={handleReject}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                {isLoading ? (
                  <Spinner size="sm" className="mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {rejectFeedback.trim() ? 'Revise Plan' : 'Cancel Feature'}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleReject}
                disabled={isLoading}
                className="w-full sm:w-auto order-2 sm:order-1"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Request Changes
              </Button>
              <Button
                onClick={handleApprove}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto order-1 sm:order-2"
              >
                {isLoading ? (
                  <Spinner size="sm" variant="foreground" className="mr-2" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Approve Plan
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
