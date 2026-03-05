import { useState } from 'react';
import { Plus, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AUTOMATION_STEP_UI_DEFINITIONS,
  getAutomationStepUiDefinition,
  type BuiltInAutomationStepType,
  type AutomationStepUiDefinition,
} from './step-registry';
import { StepConfigDialog } from './step-config-dialog';
import { getStepSummary } from '@/lib/automation-utils';
import type {
  AutomationDefinition,
  AutomationStep,
  WorkflowVariableDefinition,
} from '@automaker/types';

/** Categories for organizing automation steps in the dropdown */
type StepCategory = 'features' | 'ai' | 'variables' | 'integrations' | 'flow';

/** Order of categories in the dropdown menu */
const STEP_CATEGORIES: StepCategory[] = ['features', 'ai', 'variables', 'integrations', 'flow'];

/**
 * Helper component to render category menu items with proper separator handling.
 * Ensures no trailing separator after the last category.
 */
function CategoryMenuItems({
  onAddStep,
}: {
  onAddStep: (type: BuiltInAutomationStepType) => void;
}) {
  // Filter to only non-empty categories and build menu items
  const categoryItems = STEP_CATEGORIES.reduce<
    Array<{ category: StepCategory; steps: AutomationStepUiDefinition[] }>
  >((acc, category) => {
    const categorySteps = AUTOMATION_STEP_UI_DEFINITIONS.filter((def) => def.category === category);
    if (categorySteps.length > 0) {
      acc.push({ category, steps: categorySteps });
    }
    return acc;
  }, []);

  return categoryItems.map(({ category, steps }, index) => {
    const isLastCategory = index === categoryItems.length - 1;
    const categoryLabel =
      category === 'ai' ? 'AI' : category.charAt(0).toUpperCase() + category.slice(1);

    return (
      <div key={category}>
        <DropdownMenuLabel>{categoryLabel}</DropdownMenuLabel>
        {steps.map((definition) => (
          <DropdownMenuItem key={definition.type} onClick={() => onAddStep(definition.type)}>
            {definition.title}
          </DropdownMenuItem>
        ))}
        {!isLastCategory && <DropdownMenuSeparator />}
      </div>
    );
  });
}

interface NestedStepListProps {
  steps: AutomationStep[];
  onChange: (steps: AutomationStep[]) => void;
  workflowVariables?: WorkflowVariableDefinition[];
  /** List of available automations for the call-automation step */
  automations?: AutomationDefinition[];
  /** ID of the automation currently being edited (to filter out from the list) */
  currentAutomationId?: string;
}

function buildStepId(prefix = 'step'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultStep(type: BuiltInAutomationStepType): AutomationStep {
  const definition = getAutomationStepUiDefinition(type);
  return {
    id: buildStepId(),
    type,
    name: definition?.title ?? type,
    config: {},
  };
}

export function NestedStepList({
  steps,
  onChange,
  workflowVariables,
  automations,
  currentAutomationId,
}: NestedStepListProps) {
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [editingStep, setEditingStep] = useState<AutomationStep | null>(null);

  // Compute step outputs from all steps for variable browser
  const stepOutputs = steps.map((step) => ({
    stepId: step.id || '',
    stepName: step.name,
  }));

  const handleAddStep = (type: BuiltInAutomationStepType) => {
    const newStep = createDefaultStep(type);
    onChange([...steps, newStep]);
    setEditingStepIndex(steps.length);
    setEditingStep(newStep);
  };

  const handleRemoveStep = (index: number) => {
    const nextSteps = [...steps];
    nextSteps.splice(index, 1);
    onChange(nextSteps);
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === steps.length - 1) return;

    const nextSteps = [...steps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const [item] = nextSteps.splice(index, 1);
    nextSteps.splice(targetIndex, 0, item);
    onChange(nextSteps);
  };

  const handleEditStep = (step: AutomationStep, index: number) => {
    setEditingStepIndex(index);
    setEditingStep(step);
  };

  const handleSaveStep = (updatedStep: AutomationStep) => {
    if (editingStepIndex === null) return;
    const nextSteps = [...steps];
    nextSteps[editingStepIndex] = updatedStep;
    onChange(nextSteps);
    setEditingStep(null);
    setEditingStepIndex(null);
  };

  return (
    <div
      className="space-y-3 border rounded-md p-3 bg-background/50"
      data-testid="nested-step-list"
    >
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {steps.length === 0 && (
          <p className="text-sm text-muted-foreground py-2 text-center">No steps defined.</p>
        )}
        {steps.map((step, index) => {
          const definition = getAutomationStepUiDefinition(step.type);
          return (
            <div
              key={step.id || index}
              className="rounded-md border p-2 space-y-2 border-border/60 bg-card"
              data-testid="nested-step-item"
              data-step-type={step.type}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  className="text-left min-w-0 flex-1 hover:underline decoration-dotted"
                  onClick={() => handleEditStep(step, index)}
                >
                  <p className="text-sm font-medium truncate">
                    {index + 1}. {step.name || definition?.title || step.type}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{getStepSummary(step)}</p>
                </button>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleMoveStep(index, 'up')}
                    disabled={index === 0}
                    title="Move Up"
                    aria-label={`Move step "${step.name || step.type}" up`}
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleMoveStep(index, 'down')}
                    disabled={index === steps.length - 1}
                    title="Move Down"
                    aria-label={`Move step "${step.name || step.type}" down`}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => handleRemoveStep(index)}
                    title="Remove"
                    aria-label={`Remove step "${step.name || step.type}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-2 border-t">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="w-full h-8 text-xs" data-testid="nested-add-step-button">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Step
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56 max-h-[40vh] overflow-y-auto"
            data-testid="nested-add-step-dropdown"
          >
            <CategoryMenuItems onAddStep={handleAddStep} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <StepConfigDialog
        step={editingStep}
        open={Boolean(editingStep)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingStep(null);
            setEditingStepIndex(null);
          }
        }}
        onSave={handleSaveStep}
        workflowVariables={workflowVariables}
        stepOutputs={stepOutputs}
        automations={automations}
        currentAutomationId={currentAutomationId}
      />
    </div>
  );
}
