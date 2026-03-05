import type { ComponentType, ReactNode, RefObject } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Variable } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getValueAsString,
  parseValueFromInput,
  valueToDisplayString,
} from '@/lib/automation-utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { VariableBrowser } from './variable-browser';
import { PhaseModelSelector } from '@/components/views/settings-view/model-defaults/phase-model-selector';
import type {
  AutomationDefinition,
  AutomationStep,
  VariableDescriptor,
  WorkflowVariableDefinition,
  PhaseModelEntry,
} from '@automaker/types';
import { DEFAULT_PHASE_MODELS } from '@automaker/types';
import { useAppStore } from '@/store/app-store';
import { NestedStepList } from './nested-step-list';

/**
 * Sentinel value for manual input mode in CallAutomationStepEditor.
 * When selected from dropdown, switches to text input mode.
 */
const MANUAL_INPUT_SENTINEL = '__manual__';

/**
 * Custom hook to manage variable selection with controlled popover state.
 *
 * This hook provides a consistent pattern for variable insertion components:
 * - Tracks popover open/close state
 * - Inserts variable syntax at the current cursor position (or appends if no cursor info)
 * - Automatically closes the popover after selection
 * - Restores focus and positions cursor after the inserted variable
 *
 * @param value - The current input/textarea value
 * @param onChange - Callback to update the value
 * @param inputRef - Ref to the input or textarea element for cursor position tracking
 * @returns Object with isPopoverOpen, setIsPopoverOpen, handleVariableSelect, and savedCursorPos
 */
function useVariableSelection(
  value: string,
  onChange: (value: string) => void,
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const savedCursorPos = useRef<{ start: number; end: number } | null>(null);

  // Save cursor position on every selection change and blur so it's available
  // even when the input loses focus before the popover's onOpenChange fires
  // (common on mobile where tap on button blurs input before popover opens)
  const saveCursorPosition = useCallback(() => {
    if (inputRef.current) {
      const start = inputRef.current.selectionStart;
      const end = inputRef.current.selectionEnd;
      if (start !== null && end !== null) {
        savedCursorPos.current = { start, end };
      }
    }
  }, [inputRef]);

  const handlePopoverOpenChange = useCallback(
    (open: boolean) => {
      if (open && inputRef.current) {
        // Try to save cursor position when opening (may already be saved via blur)
        const start = inputRef.current.selectionStart;
        const end = inputRef.current.selectionEnd;
        if (start !== null && end !== null) {
          savedCursorPos.current = { start, end };
        }
        // If selectionStart is null (input lost focus), savedCursorPos retains
        // the last known position from saveCursorPosition
      }
      setIsPopoverOpen(open);
    },
    [inputRef]
  );

  const handleVariableSelect = useCallback(
    (_variable: VariableDescriptor, syntax: string) => {
      const cursorPos = savedCursorPos.current;
      let newValue: string;
      let newCursorPos: number;

      if (cursorPos !== null) {
        // Insert at saved cursor position, replacing any selection
        newValue = value.slice(0, cursorPos.start) + syntax + value.slice(cursorPos.end);
        newCursorPos = cursorPos.start + syntax.length;
      } else {
        // Fallback: append to end
        newValue = value + syntax;
        newCursorPos = newValue.length;
      }

      onChange(newValue);
      setIsPopoverOpen(false);

      // Restore focus and set cursor position after React re-renders
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      });
    },
    [value, onChange, inputRef]
  );

  return {
    isPopoverOpen,
    setIsPopoverOpen: handlePopoverOpenChange,
    handleVariableSelect,
    saveCursorPosition,
  };
}

export type AutomationStepEditorComponentKey =
  | 'createFeature'
  | 'manageFeature'
  | 'runAiPrompt'
  | 'runTypeScriptCode'
  | 'defineVariable'
  | 'callHttpEndpoint'
  | 'runScriptExec'
  | 'emitEvent'
  | 'ifConditional'
  | 'loop'
  | 'callAutomation'
  | 'writeFile'
  | 'genericJson';

export interface AutomationStepEditorProps {
  config: Record<string, unknown>;
  onConfigChange: (next: Record<string, unknown>) => void;
  /** Workflow variables available for variable insertion */
  workflowVariables?: WorkflowVariableDefinition[];
  /** Step outputs from previous steps for variable insertion */
  stepOutputs?: Array<{ stepId: string; stepName?: string }>;
  /** List of available automations for the call-automation step */
  automations?: AutomationDefinition[];
  /** ID of the automation currently being edited (to filter out from the list) */
  currentAutomationId?: string;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function updateConfig(
  config: Record<string, unknown>,
  onChange: (next: Record<string, unknown>) => void,
  key: string,
  value: unknown
): void {
  onChange({ ...config, [key]: value });
}

function getString(config: Record<string, unknown>, key: string): string {
  return typeof config[key] === 'string' ? (config[key] as string) : '';
}

function getNumber(config: Record<string, unknown>, key: string): string {
  return typeof config[key] === 'number' ? String(config[key]) : '';
}

function getBoolean(config: Record<string, unknown>, key: string): boolean {
  return Boolean(config[key]);
}

/**
 * Variable-aware input component that includes a variable browser button.
 *
 * Uses a controlled Popover to ensure the dropdown closes after variable selection.
 * The variable syntax is inserted at the current cursor position in the input.
 */
function VariableInput({
  value,
  onChange,
  placeholder,
  type,
  workflowVariables,
  stepOutputs,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  workflowVariables?: WorkflowVariableDefinition[];
  stepOutputs?: Array<{ stepId: string; stepName?: string }>;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { isPopoverOpen, setIsPopoverOpen, handleVariableSelect, saveCursorPosition } =
    useVariableSelection(value, onChange, inputRef);

  return (
    <div className={cn('flex gap-1', className)}>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onSelect={saveCursorPosition}
        onBlur={saveCursorPosition}
        placeholder={placeholder}
        type={type}
        className="flex-1"
      />
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            title="Insert variable"
          >
            <Variable className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-0" align="end">
          <VariableBrowser
            onVariableSelect={handleVariableSelect}
            workflowVariables={workflowVariables}
            stepOutputs={stepOutputs}
            compact
            className="h-64 max-h-[50vh]"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Variable-aware textarea component that includes a variable browser button.
 *
 * Uses a controlled Popover to ensure the dropdown closes after variable selection.
 * The variable syntax is inserted at the current cursor position in the textarea.
 */
function VariableTextarea({
  value,
  onChange,
  placeholder,
  rows,
  className,
  workflowVariables,
  stepOutputs,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  workflowVariables?: WorkflowVariableDefinition[];
  stepOutputs?: Array<{ stepId: string; stepName?: string }>;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isPopoverOpen, setIsPopoverOpen, handleVariableSelect, saveCursorPosition } =
    useVariableSelection(value, onChange, textareaRef);

  return (
    <div className="space-y-1">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onSelect={saveCursorPosition}
        onBlur={saveCursorPosition}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            <Variable className="h-3 w-3" />
            Insert Variable
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-0" align="start">
          <VariableBrowser
            onVariableSelect={handleVariableSelect}
            workflowVariables={workflowVariables}
            stepOutputs={stepOutputs}
            compact
            className="h-64 max-h-[50vh]"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function JsonField({
  label,
  value,
  onValueChange,
  placeholder,
}: {
  label: string;
  value: unknown;
  onValueChange: (value: unknown) => void;
  placeholder?: string;
}) {
  const textValue = valueToDisplayString(value);

  return (
    <Field label={label} hint="JSON object or array">
      <Textarea
        value={textValue}
        placeholder={placeholder}
        rows={4}
        className="font-mono text-xs"
        onChange={(event) => {
          const result = parseValueFromInput(event.target.value);
          // Only update if valid JSON or empty (invalid JSON is silently ignored)
          if (result.isValid) {
            onValueChange(result.value);
          }
        }}
      />
    </Field>
  );
}

export function CreateFeatureStepEditor({
  config,
  onConfigChange,
  workflowVariables,
  stepOutputs,
}: AutomationStepEditorProps) {
  return (
    <div className="space-y-3">
      <Field label="Title" hint="Use {{variableName}} to insert variables">
        <VariableInput
          value={getString(config, 'title')}
          onChange={(value) => updateConfig(config, onConfigChange, 'title', value)}
          workflowVariables={workflowVariables}
          stepOutputs={stepOutputs}
        />
      </Field>
      <Field label="Description" hint="Use {{variableName}} to insert variables">
        <VariableTextarea
          value={getString(config, 'description')}
          rows={4}
          onChange={(value) => updateConfig(config, onConfigChange, 'description', value)}
          workflowVariables={workflowVariables}
          stepOutputs={stepOutputs}
        />
      </Field>
      <Field label="Category">
        <VariableInput
          value={getString(config, 'category')}
          onChange={(value) =>
            updateConfig(config, onConfigChange, 'category', value || 'Uncategorized')
          }
          placeholder="Uncategorized"
          workflowVariables={workflowVariables}
          stepOutputs={stepOutputs}
        />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={getBoolean(config, 'make')}
          onCheckedChange={(checked) => updateConfig(config, onConfigChange, 'make', !!checked)}
        />
        <Label>Make (start immediately)</Label>
      </div>
    </div>
  );
}

export function ManageFeatureStepEditor({ config, onConfigChange }: AutomationStepEditorProps) {
  return (
    <div className="space-y-3">
      <Field label="Action">
        <Select
          value={getString(config, 'action') || 'start'}
          onValueChange={(value) => updateConfig(config, onConfigChange, 'action', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="start">start</SelectItem>
            <SelectItem value="stop">stop</SelectItem>
            <SelectItem value="edit">edit</SelectItem>
            <SelectItem value="delete">delete</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Feature ID">
        <Input
          value={getString(config, 'featureId')}
          onChange={(event) =>
            updateConfig(config, onConfigChange, 'featureId', event.target.value)
          }
        />
      </Field>
      <JsonField
        label="Updates (for edit)"
        value={config.updates}
        onValueChange={(value) => updateConfig(config, onConfigChange, 'updates', value)}
      />
    </div>
  );
}

export function RunAiPromptStepEditor({
  config,
  onConfigChange,
  workflowVariables,
  stepOutputs,
}: AutomationStepEditorProps) {
  const defaultFeatureModel = useAppStore((s) => s.defaultFeatureModel);
  const currentProject = useAppStore((s) => s.currentProject);
  const effectiveDefaultModel = currentProject?.defaultFeatureModel ?? defaultFeatureModel;

  // Parse the model config - supports both legacy string model and PhaseModelEntry object
  const modelConfig = useMemo((): PhaseModelEntry => {
    const modelValue = config.model;
    if (typeof modelValue === 'string' && modelValue) {
      // Legacy string model - convert to PhaseModelEntry
      return { model: modelValue };
    }
    if (typeof modelValue === 'object' && modelValue !== null && 'model' in modelValue) {
      // Already a PhaseModelEntry
      return modelValue as PhaseModelEntry;
    }
    // Default to the user's default feature model from settings
    return effectiveDefaultModel ?? DEFAULT_PHASE_MODELS.enhancementModel;
  }, [config.model, effectiveDefaultModel]);

  const handleModelChange = useCallback(
    (entry: PhaseModelEntry) => {
      updateConfig(config, onConfigChange, 'model', entry);
    },
    [config, onConfigChange]
  );

  return (
    <div className="space-y-3">
      <Field label="Prompt" hint="Use {{variableName}} to insert variables">
        <VariableTextarea
          rows={6}
          value={getString(config, 'prompt')}
          onChange={(value) => updateConfig(config, onConfigChange, 'prompt', value)}
          workflowVariables={workflowVariables}
          stepOutputs={stepOutputs}
        />
      </Field>
      <Field label="Model" hint="Select model with optional thinking level">
        <PhaseModelSelector value={modelConfig} onChange={handleModelChange} compact />
      </Field>
      <Field label="System Prompt" hint="Use {{variableName}} to insert variables">
        <VariableTextarea
          rows={3}
          value={getString(config, 'systemPrompt')}
          onChange={(value) => updateConfig(config, onConfigChange, 'systemPrompt', value)}
          workflowVariables={workflowVariables}
          stepOutputs={stepOutputs}
        />
      </Field>
      <Field label="Max Turns">
        <Input
          type="number"
          value={getNumber(config, 'maxTurns')}
          onChange={(event) =>
            updateConfig(config, onConfigChange, 'maxTurns', Number(event.target.value || 1))
          }
        />
      </Field>
    </div>
  );
}

export function RunTypeScriptCodeStepEditor({ config, onConfigChange }: AutomationStepEditorProps) {
  return (
    <div className="space-y-3">
      <Field label="Code">
        <Textarea
          rows={10}
          className="font-mono text-xs"
          value={getString(config, 'code')}
          onChange={(event) => updateConfig(config, onConfigChange, 'code', event.target.value)}
        />
      </Field>
      <Field label="Timeout (ms)">
        <Input
          type="number"
          value={getNumber(config, 'timeoutMs')}
          onChange={(event) =>
            updateConfig(config, onConfigChange, 'timeoutMs', Number(event.target.value || 0))
          }
        />
      </Field>
    </div>
  );
}

export function DefineVariableStepEditor({
  config,
  onConfigChange,
  workflowVariables,
  stepOutputs,
}: AutomationStepEditorProps) {
  return (
    <div className="space-y-3">
      <Field label="Variable Name" hint="Use {{variableName}} to insert variables">
        <VariableInput
          value={getString(config, 'name')}
          onChange={(value) => updateConfig(config, onConfigChange, 'name', value)}
          workflowVariables={workflowVariables}
          stepOutputs={stepOutputs}
        />
      </Field>
      <Field label="Value" hint="JSON value or use {{variableName}} to insert variables">
        <VariableTextarea
          value={getValueAsString(config)}
          onChange={(value) => {
            const result = parseValueFromInput(value);
            // Always update the value - either as parsed JSON or as raw string
            // This allows variable syntax like {{workflow.var}} to work
            updateConfig(config, onConfigChange, 'value', result.value);
          }}
          rows={4}
          className="font-mono text-xs"
          workflowVariables={workflowVariables}
          stepOutputs={stepOutputs}
        />
      </Field>
      <Field label="Bulk Values" hint="JSON object with key-value pairs">
        <VariableTextarea
          value={valueToDisplayString(config.values)}
          onChange={(value) => {
            const result = parseValueFromInput(value);
            // Only update if valid JSON or empty (bulk values must be valid JSON)
            if (result.isValid) {
              updateConfig(config, onConfigChange, 'values', result.value);
            }
          }}
          rows={4}
          className="font-mono text-xs"
          workflowVariables={workflowVariables}
          stepOutputs={stepOutputs}
        />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={getBoolean(config, 'defineOnly')}
          onCheckedChange={(checked) =>
            updateConfig(config, onConfigChange, 'defineOnly', !!checked)
          }
        />
        <Label>Define only (do not overwrite existing)</Label>
      </div>
    </div>
  );
}

export function CallHttpEndpointStepEditor({
  config,
  onConfigChange,
  workflowVariables,
  stepOutputs,
}: AutomationStepEditorProps) {
  return (
    <div className="space-y-3">
      <Field label="Method">
        <Select
          value={getString(config, 'method') || 'GET'}
          onValueChange={(value) => updateConfig(config, onConfigChange, 'method', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="URL" hint="Use {{variableName}} to insert variables">
        <VariableInput
          value={getString(config, 'url')}
          onChange={(value) => updateConfig(config, onConfigChange, 'url', value)}
          placeholder="https://api.example.com/endpoint"
          workflowVariables={workflowVariables}
          stepOutputs={stepOutputs}
        />
      </Field>
      <JsonField
        label="Headers"
        value={config.headers}
        onValueChange={(value) => updateConfig(config, onConfigChange, 'headers', value)}
      />
      <JsonField
        label="Body"
        value={config.body}
        onValueChange={(value) => updateConfig(config, onConfigChange, 'body', value)}
      />
    </div>
  );
}

export function RunScriptExecStepEditor({
  config,
  onConfigChange,
  workflowVariables,
  stepOutputs,
}: AutomationStepEditorProps) {
  return (
    <div className="space-y-3">
      <Field label="Command" hint="Use {{variableName}} to insert variables">
        <VariableInput
          value={getString(config, 'command')}
          onChange={(value) => updateConfig(config, onConfigChange, 'command', value)}
          placeholder="e.g., npm run build"
          workflowVariables={workflowVariables}
          stepOutputs={stepOutputs}
        />
      </Field>
      <Field label="Working Directory" hint="Use {{system.projectPath}} for project root">
        <VariableInput
          value={getString(config, 'cwd')}
          onChange={(value) => updateConfig(config, onConfigChange, 'cwd', value)}
          placeholder="e.g., {{system.projectPath}}"
          workflowVariables={workflowVariables}
          stepOutputs={stepOutputs}
        />
      </Field>
      <Field label="Timeout (ms)">
        <Input
          type="number"
          value={getNumber(config, 'timeoutMs')}
          onChange={(event) =>
            updateConfig(config, onConfigChange, 'timeoutMs', Number(event.target.value || 0))
          }
        />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={config.shell === undefined ? true : getBoolean(config, 'shell')}
          onCheckedChange={(checked) => updateConfig(config, onConfigChange, 'shell', !!checked)}
        />
        <Label>Run in shell</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={getBoolean(config, 'allowDangerousCommands')}
          onCheckedChange={(checked) =>
            updateConfig(config, onConfigChange, 'allowDangerousCommands', !!checked)
          }
        />
        <Label>Allow potentially dangerous commands</Label>
      </div>
    </div>
  );
}

export function EmitEventStepEditor({ config, onConfigChange }: AutomationStepEditorProps) {
  return (
    <div className="space-y-3">
      <Field label="Event Type">
        <Input
          value={getString(config, 'eventType')}
          onChange={(event) =>
            updateConfig(config, onConfigChange, 'eventType', event.target.value)
          }
        />
      </Field>
      <JsonField
        label="Payload"
        value={config.payload}
        onValueChange={(value) => updateConfig(config, onConfigChange, 'payload', value)}
      />
    </div>
  );
}

export function IfConditionalStepEditor({
  config,
  onConfigChange,
  workflowVariables,
  automations,
  currentAutomationId,
}: AutomationStepEditorProps) {
  return (
    <div className="space-y-4">
      <Field label="Condition Expression" hint="Example: workflow.isReady === true">
        <Input
          value={getString(config, 'condition')}
          onChange={(event) =>
            updateConfig(config, onConfigChange, 'condition', event.target.value)
          }
        />
      </Field>
      <div className="space-y-2">
        <Label>Then Steps (True)</Label>
        <NestedStepList
          steps={(config.thenSteps as AutomationStep[]) ?? []}
          onChange={(steps) => updateConfig(config, onConfigChange, 'thenSteps', steps)}
          workflowVariables={workflowVariables}
          automations={automations}
          currentAutomationId={currentAutomationId}
        />
      </div>
      <div className="space-y-2">
        <Label>Else Steps (False)</Label>
        <NestedStepList
          steps={(config.elseSteps as AutomationStep[]) ?? []}
          onChange={(steps) => updateConfig(config, onConfigChange, 'elseSteps', steps)}
          workflowVariables={workflowVariables}
          automations={automations}
          currentAutomationId={currentAutomationId}
        />
      </div>
    </div>
  );
}

export function LoopStepEditor({
  config,
  onConfigChange,
  workflowVariables,
  automations,
  currentAutomationId,
}: AutomationStepEditorProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Item Variable" hint="e.g. item">
          <Input
            value={getString(config, 'itemVariable')}
            onChange={(event) =>
              updateConfig(config, onConfigChange, 'itemVariable', event.target.value)
            }
          />
        </Field>
        <Field label="Index Variable" hint="e.g. index">
          <Input
            value={getString(config, 'indexVariable')}
            onChange={(event) =>
              updateConfig(config, onConfigChange, 'indexVariable', event.target.value)
            }
          />
        </Field>
      </div>
      <Field label="Count (Optional)">
        <Input
          type="number"
          value={getNumber(config, 'count')}
          onChange={(event) =>
            updateConfig(config, onConfigChange, 'count', Number(event.target.value || 0))
          }
        />
      </Field>
      <JsonField
        label="Items (Optional JSON Array)"
        value={config.items}
        onValueChange={(value) => updateConfig(config, onConfigChange, 'items', value)}
      />
      <div className="space-y-2">
        <Label>Nested Steps</Label>
        <NestedStepList
          steps={(config.steps as AutomationStep[]) ?? []}
          onChange={(steps) => updateConfig(config, onConfigChange, 'steps', steps)}
          workflowVariables={workflowVariables}
          automations={automations}
          currentAutomationId={currentAutomationId}
        />
      </div>
    </div>
  );
}

/**
 * Editor for the call-automation step type.
 *
 * Provides a dropdown to select from available automations, with a fallback
 * to manual ID entry for:
 * - Variable syntax (e.g., {{workflow.targetAutomation}})
 * - Automations not in the current list
 *
 * The current automation being edited is filtered out to prevent self-calling.
 */
export function CallAutomationStepEditor({
  config,
  onConfigChange,
  automations,
  currentAutomationId,
}: AutomationStepEditorProps) {
  // Filter out the current automation to prevent self-calling
  const availableAutomations = (automations ?? []).filter(
    (automation) => automation.id !== currentAutomationId
  );

  // Check if the current value is a variable syntax (starts with {{)
  const currentValue = getString(config, 'automationId');
  const isVariableSyntax = currentValue.startsWith('{{');
  // Determine if we're in "select" mode or "manual input" mode
  const isManualInput = isVariableSyntax || currentValue === MANUAL_INPUT_SENTINEL;

  const handleSwitchToDropdown = () => {
    updateConfig(config, onConfigChange, 'automationId', '');
  };

  const handleDropdownChange = (value: string) => {
    if (value === MANUAL_INPUT_SENTINEL) {
      updateConfig(config, onConfigChange, 'automationId', MANUAL_INPUT_SENTINEL);
    } else {
      updateConfig(config, onConfigChange, 'automationId', value);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Automation" hint="Select an automation or enter ID manually">
        {isManualInput ? (
          <div className="space-y-2">
            <Input
              value={isVariableSyntax ? currentValue : ''}
              onChange={(event) =>
                updateConfig(config, onConfigChange, 'automationId', event.target.value)
              }
              placeholder="Enter automation ID or {{variable}}"
              data-testid="call-automation-manual-input"
            />
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={handleSwitchToDropdown}
              data-testid="call-automation-switch-to-dropdown"
            >
              Switch to dropdown
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Select value={currentValue || undefined} onValueChange={handleDropdownChange}>
              <SelectTrigger data-testid="call-automation-dropdown">
                <SelectValue placeholder="Select an automation..." />
              </SelectTrigger>
              <SelectContent>
                {availableAutomations.length === 0 ? (
                  <SelectItem value={MANUAL_INPUT_SENTINEL} disabled>
                    No automations available
                  </SelectItem>
                ) : (
                  availableAutomations.map((automation) => (
                    <SelectItem key={automation.id} value={automation.id}>
                      {automation.name} ({automation.id})
                    </SelectItem>
                  ))
                )}
                <SelectItem value={MANUAL_INPUT_SENTINEL}>Enter ID manually...</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </Field>
      <Field label="Scope">
        <Select
          value={getString(config, 'scope') || 'project'}
          onValueChange={(value) => updateConfig(config, onConfigChange, 'scope', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="project">project</SelectItem>
            <SelectItem value="global">global</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <JsonField
        label="Variables"
        value={config.variables}
        onValueChange={(value) => updateConfig(config, onConfigChange, 'variables', value)}
      />
    </div>
  );
}

export function WriteFileStepEditor({
  config,
  onConfigChange,
  workflowVariables,
  stepOutputs,
}: AutomationStepEditorProps) {
  return (
    <div className="space-y-3">
      <Field
        label="File Path"
        hint="Absolute or relative path. Use {{system.projectPath}} for project root."
      >
        <VariableInput
          value={getString(config, 'filePath')}
          onChange={(value) => updateConfig(config, onConfigChange, 'filePath', value)}
          placeholder="e.g., {{system.projectPath}}/output.txt"
          workflowVariables={workflowVariables}
          stepOutputs={stepOutputs}
        />
      </Field>
      <Field
        label="Content"
        hint="Text content to write. Use {{variableName}} to insert variables."
      >
        <VariableTextarea
          value={getString(config, 'content')}
          onChange={(value) => updateConfig(config, onConfigChange, 'content', value)}
          placeholder="File content here..."
          workflowVariables={workflowVariables}
          stepOutputs={stepOutputs}
        />
      </Field>
      <Field label="Encoding">
        <Select
          value={getString(config, 'encoding') || 'utf8'}
          onValueChange={(value) => updateConfig(config, onConfigChange, 'encoding', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="utf8">UTF-8</SelectItem>
            <SelectItem value="ascii">ASCII</SelectItem>
            <SelectItem value="base64">Base64</SelectItem>
            <SelectItem value="binary">Binary</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={config.createDirs === undefined ? true : getBoolean(config, 'createDirs')}
          onCheckedChange={(checked) =>
            updateConfig(config, onConfigChange, 'createDirs', !!checked)
          }
        />
        <Label>Create parent directories if missing</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={getBoolean(config, 'append')}
          onCheckedChange={(checked) => updateConfig(config, onConfigChange, 'append', !!checked)}
        />
        <Label>Append to file instead of overwriting</Label>
      </div>
    </div>
  );
}

export function GenericJsonStepEditor({ config, onConfigChange }: AutomationStepEditorProps) {
  return (
    <JsonField
      label="Step Config"
      value={config}
      onValueChange={(value) => onConfigChange((value as Record<string, unknown>) ?? {})}
    />
  );
}

export const AUTOMATION_STEP_EDITOR_COMPONENTS: Record<
  AutomationStepEditorComponentKey,
  ComponentType<AutomationStepEditorProps>
> = {
  createFeature: CreateFeatureStepEditor,
  manageFeature: ManageFeatureStepEditor,
  runAiPrompt: RunAiPromptStepEditor,
  runTypeScriptCode: RunTypeScriptCodeStepEditor,
  defineVariable: DefineVariableStepEditor,
  callHttpEndpoint: CallHttpEndpointStepEditor,
  runScriptExec: RunScriptExecStepEditor,
  emitEvent: EmitEventStepEditor,
  ifConditional: IfConditionalStepEditor,
  loop: LoopStepEditor,
  callAutomation: CallAutomationStepEditor,
  writeFile: WriteFileStepEditor,
  genericJson: GenericJsonStepEditor,
};
