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
import { Plus, Trash2, ChevronUp, ChevronDown, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { PipelineConfig, PipelineStep } from '@automaker/types';
import { cn } from '@/lib/utils';
import { AddEditPipelineStepDialog } from './add-edit-pipeline-step-dialog';

interface PipelineSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  projectPath: string;
  pipelineConfig: PipelineConfig | null;
  onSave: (config: PipelineConfig) => Promise<void>;
}

export function PipelineSettingsDialog({
  open,
  onClose,
  projectPath: _projectPath,
  pipelineConfig,
  onSave,
}: PipelineSettingsDialogProps) {
  // Filter and validate steps to ensure all required properties exist
  const validateSteps = (steps: PipelineStep[] | undefined): PipelineStep[] => {
    if (!Array.isArray(steps)) return [];
    return steps.filter(
      (step): step is PipelineStep =>
        step != null &&
        typeof step.id === 'string' &&
        typeof step.name === 'string' &&
        typeof step.instructions === 'string'
    );
  };

  const [steps, setSteps] = useState<PipelineStep[]>(() => validateSteps(pipelineConfig?.steps));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sub-dialog state
  const [addEditDialogOpen, setAddEditDialogOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<PipelineStep | null>(null);

  // Sync steps when dialog opens or pipelineConfig changes
  useEffect(() => {
    if (open) {
      setSteps(validateSteps(pipelineConfig?.steps));
    }
  }, [open, pipelineConfig]);

  const sortedSteps = [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const handleAddStep = () => {
    setEditingStep(null);
    setAddEditDialogOpen(true);
  };

  const handleEditStep = (step: PipelineStep) => {
    setEditingStep(step);
    setAddEditDialogOpen(true);
  };

  const handleDeleteStep = (stepId: string) => {
    const newSteps = steps.filter((s) => s.id !== stepId);
    // Reorder remaining steps
    newSteps.forEach((s, index) => {
      s.order = index;
    });
    setSteps(newSteps);
  };

  const handleMoveStep = (stepId: string, direction: 'up' | 'down') => {
    const stepIndex = sortedSteps.findIndex((s) => s.id === stepId);
    if (
      (direction === 'up' && stepIndex === 0) ||
      (direction === 'down' && stepIndex === sortedSteps.length - 1)
    ) {
      return;
    }

    const newSteps = [...sortedSteps];
    const targetIndex = direction === 'up' ? stepIndex - 1 : stepIndex + 1;

    // Swap orders
    const temp = newSteps[stepIndex].order;
    newSteps[stepIndex].order = newSteps[targetIndex].order;
    newSteps[targetIndex].order = temp;

    setSteps(newSteps);
  };

  const handleSaveStep = (
    stepData: Omit<PipelineStep, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => {
    const now = new Date().toISOString();

    if (stepData.id) {
      // Update existing step
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepData.id
            ? {
                ...s,
                name: stepData.name,
                instructions: stepData.instructions,
                colorClass: stepData.colorClass,
                updatedAt: now,
              }
            : s
        )
      );
    } else {
      // Add new step
      const newStep: PipelineStep = {
        id: `step_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
        name: stepData.name,
        instructions: stepData.instructions,
        colorClass: stepData.colorClass,
        order: steps.length,
        createdAt: now,
        updatedAt: now,
      };
      setSteps((prev) => [...prev, newStep]);
    }
  };

  const handleSaveConfig = async () => {
    setIsSubmitting(true);
    try {
      const sortedEffectiveSteps = [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const config: PipelineConfig = {
        version: 1,
        steps: sortedEffectiveSteps.map((s, index) => ({ ...s, order: index })),
      };
      await onSave(config);
      toast.success('Pipeline configuration saved');
      onClose();
    } catch {
      toast.error('Failed to save pipeline configuration');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Pipeline Settings</DialogTitle>
            <DialogDescription>
              Configure custom pipeline steps that run after a feature completes "In Progress". Each
              step will automatically prompt the agent with its instructions.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {/* Steps List */}
            {sortedSteps.length > 0 ? (
              <div className="space-y-2">
                {sortedSteps.map((step, index) => (
                  <div
                    key={step.id}
                    className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30"
                  >
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => handleMoveStep(step.id, 'up')}
                        disabled={index === 0}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => handleMoveStep(step.id, 'down')}
                        disabled={index === sortedSteps.length - 1}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>

                    <div
                      className={cn(
                        'w-3 h-8 rounded',
                        (step.colorClass || 'bg-blue-500/20').replace('/20', '')
                      )}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{step.name || 'Unnamed Step'}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {(step.instructions || '').substring(0, 100)}
                        {(step.instructions || '').length > 100 ? '...' : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEditStep(step)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteStep(step.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No pipeline steps configured.</p>
                <p className="text-sm">
                  Add steps to create a custom workflow after features complete.
                </p>
              </div>
            )}

            {/* Add Step Button */}
            <Button variant="outline" className="w-full" onClick={handleAddStep}>
              <Plus className="h-4 w-4 mr-2" />
              Add Pipeline Step
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSaveConfig} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Pipeline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sub-dialog for adding/editing steps */}
      <AddEditPipelineStepDialog
        open={addEditDialogOpen}
        onClose={() => {
          setAddEditDialogOpen(false);
          setEditingStep(null);
        }}
        onSave={handleSaveStep}
        existingStep={editingStep}
        defaultOrder={steps.length}
      />
    </>
  );
}
