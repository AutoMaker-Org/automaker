import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AUTOMATION_STEP_UI_DEFINITIONS, getAutomationStepUiDefinition } from './step-registry';
import type {
  AutomationDefinition,
  AutomationStep,
  WorkflowVariableDefinition,
} from '@automaker/types';

export interface StepConfigDialogProps {
  step: AutomationStep | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (step: AutomationStep) => void;
  workflowVariables?: WorkflowVariableDefinition[];
  /** Step outputs from previous steps for variable insertion */
  stepOutputs?: Array<{ stepId: string; stepName?: string }>;
  /** List of available automations for the call-automation step */
  automations?: AutomationDefinition[];
  /** ID of the automation currently being edited (to filter out from the list) */
  currentAutomationId?: string;
}

export function StepConfigDialog({
  step,
  open,
  onOpenChange,
  onSave,
  workflowVariables,
  stepOutputs,
  automations,
  currentAutomationId,
}: StepConfigDialogProps) {
  const [editingStep, setEditingStep] = useState<AutomationStep | null>(null);

  useEffect(() => {
    if (open && step) {
      setEditingStep({ ...step });
    } else if (!open) {
      setEditingStep(null);
    }
  }, [open, step]);

  const handleSave = () => {
    if (editingStep) {
      onSave(editingStep);
      onOpenChange(false);
    }
  };

  const definition = editingStep ? getAutomationStepUiDefinition(editingStep.type) : undefined;
  const EditorComponent = definition?.editor;

  if (!editingStep && open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Step</DialogTitle>
          <DialogDescription>Configure the step details and parameters.</DialogDescription>
        </DialogHeader>

        {editingStep && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Step Name</Label>
              <Input
                value={editingStep.name ?? ''}
                onChange={(e) => setEditingStep({ ...editingStep, name: e.target.value })}
                placeholder={definition?.title ?? editingStep.type}
              />
            </div>

            <div className="space-y-2">
              <Label>Step Type</Label>
              <Select
                value={editingStep.type}
                onValueChange={(value) =>
                  setEditingStep({
                    ...editingStep,
                    type: value,
                    config: {}, // Reset config on type change
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTOMATION_STEP_UI_DEFINITIONS.map((def) => (
                    <SelectItem key={def.type} value={def.type}>
                      {def.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-md p-4 bg-card/50">
              {EditorComponent ? (
                <EditorComponent
                  config={editingStep.config ?? {}}
                  onConfigChange={(newConfig) =>
                    setEditingStep({ ...editingStep, config: newConfig })
                  }
                  workflowVariables={workflowVariables}
                  stepOutputs={stepOutputs}
                  automations={automations}
                  currentAutomationId={currentAutomationId}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No editor available for this step type.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
