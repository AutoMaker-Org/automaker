import type { ComponentType } from 'react';
import {
  AUTOMATION_STEP_EDITOR_COMPONENTS,
  type AutomationStepEditorComponentKey,
  type AutomationStepEditorProps,
} from './step-editors';

export type BuiltInAutomationStepType =
  | 'create-feature'
  | 'manage-feature'
  | 'run-ai-prompt'
  | 'run-typescript-code'
  | 'define-variable'
  | 'set-variable'
  | 'call-http-endpoint'
  | 'run-script-exec'
  | 'emit-event'
  | 'write-file'
  | 'if'
  | 'loop'
  | 'call-automation';

export interface AutomationStepUiDefinition {
  type: BuiltInAutomationStepType;
  title: string;
  description: string;
  category: 'features' | 'ai' | 'variables' | 'integrations' | 'flow';
  editorComponent: AutomationStepEditorComponentKey;
  inputContract: string;
  outputContract: string;
  configSchema: {
    type: 'object';
    fields: Array<{
      key: string;
      type: 'string' | 'number' | 'boolean' | 'json' | 'enum' | 'string[]';
      required?: boolean;
      label: string;
      options?: string[];
    }>;
  };
  editor: ComponentType<AutomationStepEditorProps>;
}

export const BASE_STEP_DEFINITIONS: Omit<AutomationStepUiDefinition, 'editor'>[] = [
  {
    type: 'create-feature',
    title: 'Create Feature',
    description: 'Creates a new feature in the current project scope.',
    category: 'features',
    editorComponent: 'createFeature',
    inputContract: 'Optional defaults for feature fields.',
    outputContract: 'Created feature object.',
    configSchema: {
      type: 'object',
      fields: [
        { key: 'title', type: 'string', label: 'Title' },
        { key: 'description', type: 'string', label: 'Description' },
        { key: 'category', type: 'string', label: 'Category' },
      ],
    },
  },
  {
    type: 'manage-feature',
    title: 'Manage Feature',
    description: 'Starts, stops, edits, or deletes an existing feature.',
    category: 'features',
    editorComponent: 'manageFeature',
    inputContract: 'Optional feature patch object for edit action.',
    outputContract: 'Updated feature object or delete result.',
    configSchema: {
      type: 'object',
      fields: [
        {
          key: 'action',
          type: 'enum',
          required: true,
          label: 'Action',
          options: ['start', 'stop', 'edit', 'delete'],
        },
        { key: 'featureId', type: 'string', required: true, label: 'Feature ID' },
      ],
    },
  },
  {
    type: 'run-ai-prompt',
    title: 'Run AI Prompt',
    description: 'Executes a prompt with configurable model selection.',
    category: 'ai',
    editorComponent: 'runAiPrompt',
    inputContract: 'Optional prompt fallback when config.prompt is not set.',
    outputContract: 'Model response object.',
    configSchema: {
      type: 'object',
      fields: [
        { key: 'prompt', type: 'string', required: true, label: 'Prompt' },
        { key: 'model', type: 'string', label: 'Model' },
      ],
    },
  },
  {
    type: 'run-typescript-code',
    title: 'Run TypeScript Code',
    description: 'Executes TypeScript/JavaScript in a sandboxed context.',
    category: 'ai',
    editorComponent: 'runTypeScriptCode',
    inputContract: 'Available as `input` in the sandbox.',
    outputContract: 'Return value from executed code.',
    configSchema: {
      type: 'object',
      fields: [{ key: 'code', type: 'string', required: true, label: 'Code' }],
    },
  },
  {
    type: 'define-variable',
    title: 'Define/Set Variable',
    description: 'Creates or updates workflow variables.',
    category: 'variables',
    editorComponent: 'defineVariable',
    inputContract: 'Used when config.value is not set.',
    outputContract: 'Assigned value.',
    configSchema: {
      type: 'object',
      fields: [
        { key: 'name', type: 'string', label: 'Variable Name' },
        { key: 'value', type: 'json', label: 'Value' },
      ],
    },
  },
  {
    type: 'set-variable',
    title: 'Set Variable',
    description: 'Compatibility alias for define-variable.',
    category: 'variables',
    editorComponent: 'defineVariable',
    inputContract: 'Used when config.value is not set.',
    outputContract: 'Assigned value.',
    configSchema: {
      type: 'object',
      fields: [
        { key: 'name', type: 'string', label: 'Variable Name' },
        { key: 'value', type: 'json', label: 'Value' },
      ],
    },
  },
  {
    type: 'call-http-endpoint',
    title: 'Call HTTP Endpoint',
    description: 'Makes HTTP requests with headers/body interpolation.',
    category: 'integrations',
    editorComponent: 'callHttpEndpoint',
    inputContract: 'Optional request body fallback.',
    outputContract: 'HTTP result object.',
    configSchema: {
      type: 'object',
      fields: [
        { key: 'method', type: 'enum', label: 'Method', options: ['GET', 'POST', 'PUT', 'DELETE'] },
        { key: 'url', type: 'string', required: true, label: 'URL' },
      ],
    },
  },
  {
    type: 'run-script-exec',
    title: 'Run Script/Exec',
    description: 'Executes shell commands or scripts.',
    category: 'integrations',
    editorComponent: 'runScriptExec',
    inputContract: 'Optional command fallback.',
    outputContract: 'stdout, stderr, and process metadata.',
    configSchema: {
      type: 'object',
      fields: [
        { key: 'command', type: 'string', required: true, label: 'Command' },
        {
          key: 'allowDangerousCommands',
          type: 'boolean',
          label: 'Allow potentially dangerous commands',
        },
      ],
    },
  },
  {
    type: 'emit-event',
    title: 'Emit Event',
    description: 'Emits an internal Automaker event.',
    category: 'integrations',
    editorComponent: 'emitEvent',
    inputContract: 'Optional payload fallback.',
    outputContract: 'Event metadata.',
    configSchema: {
      type: 'object',
      fields: [{ key: 'eventType', type: 'string', required: true, label: 'Event Type' }],
    },
  },
  {
    type: 'write-file',
    title: 'Write File',
    description: 'Writes text content to a file on disk.',
    category: 'integrations',
    editorComponent: 'writeFile',
    inputContract: 'Optional content fallback when config.content is not set.',
    outputContract: 'Object with filePath, bytesWritten, and encoding fields.',
    configSchema: {
      type: 'object',
      fields: [
        { key: 'filePath', type: 'string', required: true, label: 'File Path' },
        { key: 'content', type: 'string', required: true, label: 'Content' },
        {
          key: 'encoding',
          type: 'enum',
          label: 'Encoding',
          options: ['utf8', 'ascii', 'base64', 'binary'],
        },
        { key: 'createDirs', type: 'boolean', label: 'Create parent directories if missing' },
        { key: 'append', type: 'boolean', label: 'Append to file instead of overwriting' },
      ],
    },
  },
  {
    type: 'if',
    title: 'If (Conditional)',
    description: 'Branches execution based on a condition expression.',
    category: 'flow',
    editorComponent: 'ifConditional',
    inputContract: 'Used as initial input for the selected branch.',
    outputContract: 'Output from executed branch.',
    configSchema: {
      type: 'object',
      fields: [{ key: 'condition', type: 'string', required: true, label: 'Condition' }],
    },
  },
  {
    type: 'loop',
    title: 'Loop',
    description: 'Repeats nested steps over a list or fixed count.',
    category: 'flow',
    editorComponent: 'loop',
    inputContract: 'Used as default item source.',
    outputContract: 'Iteration summary and nested outputs.',
    configSchema: {
      type: 'object',
      fields: [{ key: 'steps', type: 'json', required: true, label: 'Nested Steps' }],
    },
  },
  {
    type: 'call-automation',
    title: 'Call Automation',
    description: 'Invokes another automation by ID and returns its output.',
    category: 'flow',
    editorComponent: 'callAutomation',
    inputContract: 'Optional variables fallback.',
    outputContract: 'Child run info and output.',
    configSchema: {
      type: 'object',
      fields: [{ key: 'automationId', type: 'string', required: true, label: 'Automation ID' }],
    },
  },
];

// Lazily resolve editor components to avoid circular dependency issues during module evaluation
// By making `editor` a getter, we delay access to `AUTOMATION_STEP_EDITOR_COMPONENTS` until the `editor` property is accessed.
export const AUTOMATION_STEP_UI_DEFINITIONS = BASE_STEP_DEFINITIONS.map((def) => ({
  ...def,
  get editor() {
    return (
      AUTOMATION_STEP_EDITOR_COMPONENTS[def.editorComponent] ??
      AUTOMATION_STEP_EDITOR_COMPONENTS.genericJson
    );
  },
}));

export function getAutomationStepUiDefinition(
  stepType: string
): AutomationStepUiDefinition | undefined {
  return AUTOMATION_STEP_UI_DEFINITIONS.find((definition) => definition.type === stepType);
}
