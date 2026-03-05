import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Play,
  Plus,
  Download,
  Upload,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Search,
  Bot,
  Save,
  FileJson,
  AlertTriangle,
  History,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { getServerUrlSync } from '@/lib/http-api-client';
import {
  getStepSummary,
  getAutomationRequestHeaders,
  automationApiRequest,
} from '@/lib/automation-utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { VariableBrowser } from '@/components/automation/variable-browser';
import { AiAutomationGenerator } from '@/components/automation/ai-automation-generator';
import { AutomationRunHistoryView } from '@/components/views/automation-run-history-view';
import {
  AUTOMATION_STEP_UI_DEFINITIONS,
  getAutomationStepUiDefinition,
} from '@/components/automation/step-registry';
import {
  SUGGESTED_AUTOMATIONS,
  SUGGESTED_AUTOMATION_CATEGORIES,
  type SuggestedAutomation,
  type SuggestedAutomationCategoryFilter,
} from '@/components/automation/suggested-automations';
import type {
  AutomationDefinition,
  AutomationRun,
  AutomationScope,
  AutomationStep,
  AutomationTriggerType,
  BuiltInAutomationStepType,
  WorkflowVariableDefinition,
} from '@automaker/types';

type ScopeOption = 'global' | `project:${string}`;
type StatusFilter = 'all' | 'enabled' | 'disabled' | 'completed' | 'failed' | 'running';

interface AutomationListResponse {
  success: boolean;
  automations: AutomationDefinition[];
}

interface AutomationRunsResponse {
  success: boolean;
  runs: AutomationRun[];
}

interface EditorState {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  triggerType: AutomationTriggerType;
  triggerCron: string;
  triggerEvent: string;
  triggerDate: string;
  triggerMethods: string;
  triggerSecret: string;
  triggerTimezone: string;
  steps: AutomationStep[];
}

const AUTOMATION_QUERY_KEY = ['automations'] as const;
const RUNS_QUERY_KEY = ['automation-runs'] as const;
const DEFAULT_CRON_EXPRESSION = '0 9 * * *';
const DEFAULT_WEBHOOK_METHODS = 'POST';
const CUSTOM_EVENT_OPTION_VALUE = '__custom';
const RUNS_REFETCH_INTERVAL_MS = 5000;
const VALID_WEBHOOK_METHODS = ['GET', 'POST', 'PUT', 'PATCH'] as const;
const INTERNAL_EVENT_OPTIONS = [
  'feature_created',
  'feature_success',
  'feature_error',
  'auto_mode_complete',
  'auto_mode_error',
] as const;
/** Trigger metadata source for test runs initiated from the automation editor */
const TEST_RUN_TRIGGER_SOURCE = 'editor-test-run';

interface EditorValidationState {
  errors: string[];
  warnings: string[];
}

function getScopeParams(scopeSelection: ScopeOption): {
  scope: AutomationScope;
  projectPath?: string;
} {
  if (scopeSelection === 'global') {
    return { scope: 'global' };
  }
  return { scope: 'project', projectPath: scopeSelection.replace(/^project:/, '') };
}

function formatTrigger(trigger: AutomationDefinition['trigger']): string {
  switch (trigger.type) {
    case 'manual':
      return 'Manual';
    case 'event':
      return `Event: ${trigger.event ?? 'n/a'}`;
    case 'schedule':
      return `Schedule: ${trigger.cron ?? 'n/a'}`;
    case 'webhook':
      return 'Webhook';
    case 'date':
      return `Date: ${trigger.date ?? 'n/a'}`;
    default:
      return trigger.type;
  }
}

function getLastRunMap(runs: AutomationRun[] | undefined): Record<string, AutomationRun> {
  if (!runs) return {};

  const byId: Record<string, AutomationRun> = {};
  for (const run of runs) {
    const existing = byId[run.automationId];
    if (!existing || new Date(run.startedAt).getTime() > new Date(existing.startedAt).getTime()) {
      byId[run.automationId] = run;
    }
  }
  return byId;
}

function downloadJson(content: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  // Cleanup: remove link and revoke URL after a short delay to ensure download starts
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 100);
}

function createDefaultEditorState(id = ''): EditorState {
  return {
    id,
    name: '',
    description: '',
    enabled: true,
    triggerType: 'manual',
    triggerCron: DEFAULT_CRON_EXPRESSION,
    triggerEvent: '',
    triggerDate: '',
    triggerMethods: DEFAULT_WEBHOOK_METHODS,
    triggerSecret: '',
    triggerTimezone: '',
    steps: [createDefaultStep('define-variable')],
  };
}

/**
 * Generate the next sequential automation ID based on existing automations.
 * Looks for numeric IDs and returns the next integer.
 * Falls back to "1" if no numeric IDs exist.
 */
function generateNextAutomationId(existingAutomations: AutomationDefinition[]): string {
  let maxId = 0;

  for (const automation of existingAutomations) {
    const numericId = parseInt(automation.id, 10);
    if (!isNaN(numericId) && numericId > maxId) {
      maxId = numericId;
    }
  }

  return String(maxId + 1);
}

/**
 * Build a summary text for validation errors and warnings.
 * Returns a string like "2 errors, 1 warning" or "1 error" or "1 warning".
 */
function buildValidationSummary(errorCount: number, warningCount: number): string {
  const parts: string[] = [];
  if (errorCount > 0) {
    parts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
  }
  return parts.join(', ');
}

function buildTriggerFromEditor(editor: EditorState): AutomationDefinition['trigger'] {
  const methods = editor.triggerMethods
    .split(',')
    .map((method) => method.trim().toUpperCase())
    .filter((method): method is (typeof VALID_WEBHOOK_METHODS)[number] =>
      VALID_WEBHOOK_METHODS.includes(method as (typeof VALID_WEBHOOK_METHODS)[number])
    );

  switch (editor.triggerType) {
    case 'event':
      return { type: 'event', event: editor.triggerEvent.trim() || 'automation.event' };
    case 'schedule':
      return {
        type: 'schedule',
        cron: editor.triggerCron.trim() || DEFAULT_CRON_EXPRESSION,
        timezone: editor.triggerTimezone.trim() || undefined,
      };
    case 'webhook':
      return {
        type: 'webhook',
        methods: methods.length > 0 ? methods : [DEFAULT_WEBHOOK_METHODS],
        secret: editor.triggerSecret.trim() || undefined,
      };
    case 'date':
      return {
        type: 'date',
        date: editor.triggerDate.trim(),
        timezone: editor.triggerTimezone.trim() || undefined,
      };
    default:
      return { type: 'manual' };
  }
}

function buildStepId(prefix = 'step'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultStep(type: BuiltInAutomationStepType): AutomationStep {
  return {
    id: buildStepId(),
    type,
    name: getAutomationStepUiDefinition(type)?.title ?? type,
    config: {},
  };
}

function normalizeStep(rawStep: AutomationStep, index: number): AutomationStep {
  return {
    ...rawStep,
    id: rawStep.id?.trim() ? rawStep.id : `step-${index + 1}`,
    type: rawStep.type?.trim() || 'define-variable',
    config: rawStep.config ?? {},
  };
}

function getWebhookUrl(automationId: string): string {
  const id = automationId.trim();
  if (!id) return '';

  try {
    const baseUrl = new URL(getServerUrlSync());
    return `${baseUrl.origin}/api/automation/webhook/${encodeURIComponent(id)}`;
  } catch {
    return '';
  }
}

function collectTemplateTokens(value: unknown, result: string[] = []): string[] {
  if (typeof value === 'string') {
    const matches = value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g);
    for (const match of matches) {
      if (match[1]) {
        result.push(match[1].trim());
      }
    }
    return result;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTemplateTokens(item, result);
    }
    return result;
  }

  if (value && typeof value === 'object') {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      collectTemplateTokens(nestedValue, result);
    }
  }

  return result;
}

function validateEditorState(editor: EditorState): EditorValidationState {
  const errorSet = new Set<string>();
  const warningSet = new Set<string>();
  const addError = (message: string) => errorSet.add(message);
  const addWarning = (message: string) => warningSet.add(message);
  const trimmedId = editor.id.trim();

  if (!trimmedId) addError('Automation ID is required.');
  if (!editor.name.trim()) addError('Automation name is required.');

  if (editor.triggerType === 'event' && !editor.triggerEvent.trim()) {
    addError('Event trigger requires an event name.');
  }

  if (editor.triggerType === 'schedule' && !editor.triggerCron.trim()) {
    addError('Schedule trigger requires a cron expression.');
  }

  if (editor.triggerType === 'date' && !editor.triggerDate.trim()) {
    addError('Date trigger requires an ISO date value.');
  }

  if (editor.triggerType === 'webhook') {
    const hasValidWebhookMethod = editor.triggerMethods
      .split(',')
      .map((method) => method.trim().toUpperCase())
      .some((method) =>
        VALID_WEBHOOK_METHODS.includes(method as (typeof VALID_WEBHOOK_METHODS)[number])
      );
    if (!hasValidWebhookMethod) {
      addError('Webhook trigger requires at least one valid HTTP method (GET, POST, PUT, PATCH).');
    }
  }

  if (editor.steps.length === 0) {
    addError('At least one automation step is required.');
  }

  const stepIds = new Set<string>();
  const workflowVariables = new Set<string>();
  const availableScopes = new Set(['system', 'project', 'workflow', 'steps']);

  for (const step of editor.steps) {
    const stepId = step.id.trim();
    if (!stepId) {
      addError(`Step "${step.name ?? step.type}" is missing an ID.`);
      continue;
    }
    if (stepIds.has(stepId)) {
      addError(`Step ID "${stepId}" is duplicated.`);
    }
    stepIds.add(stepId);

    if (step.type === 'define-variable' || step.type === 'set-variable') {
      const variableName = typeof step.config?.name === 'string' ? step.config.name.trim() : '';
      if (variableName) workflowVariables.add(variableName);
    }

    if (step.type === 'call-automation') {
      const targetAutomationId =
        typeof step.config?.automationId === 'string' ? step.config.automationId.trim() : '';
      if (!targetAutomationId) {
        addError(`Step "${stepId}" must define config.automationId.`);
      } else if (trimmedId && targetAutomationId === trimmedId) {
        addError(`Step "${stepId}" cannot call the same automation ID (${trimmedId}).`);
      }
    }

    const definition = getAutomationStepUiDefinition(step.type);
    for (const field of definition?.configSchema.fields ?? []) {
      if (!field.required) continue;
      const rawValue = step.config?.[field.key];
      const missing =
        rawValue === undefined ||
        rawValue === null ||
        (typeof rawValue === 'string' && !rawValue.trim());
      if (missing) {
        addError(`Step "${stepId}" is missing required field "${field.label}".`);
      }
    }
  }

  for (const step of editor.steps) {
    const tokens = new Set(collectTemplateTokens(step.config));
    for (const token of tokens) {
      const [scope, variableName] = token.split('.', 2);
      if (!scope || !availableScopes.has(scope)) {
        addWarning(`Step "${step.id}" references unknown variable scope "{{${token}}}".`);
        continue;
      }
      if (scope === 'workflow' && variableName && !workflowVariables.has(variableName)) {
        addWarning(`Step "${step.id}" references missing workflow variable "{{${token}}}".`);
      }
    }
  }

  return { errors: Array.from(errorSet), warnings: Array.from(warningSet) };
}

export function AutomationManagementView() {
  const queryClient = useQueryClient();
  const projects = useAppStore((state) => state.projects);
  const currentProject = useAppStore((state) => state.currentProject);
  const defaultFeatureModel = useAppStore((state) => state.defaultFeatureModel);
  const effectiveDefaultModel = currentProject?.defaultFeatureModel ?? defaultFeatureModel;
  const scopeOptions = useMemo<ScopeOption[]>(() => {
    return ['global', ...projects.map((project) => `project:${project.path}` as ScopeOption)];
  }, [projects]);

  const [scopeSelection, setScopeSelection] = useState<ScopeOption>(() =>
    currentProject?.path ? `project:${currentProject.path}` : 'global'
  );
  const [searchText, setSearchText] = useState('');
  const [triggerFilter, setTriggerFilter] = useState<'all' | AutomationTriggerType>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAutomationId, setEditingAutomationId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(createDefaultEditorState);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [testRunId, setTestRunId] = useState<string | null>(null);
  const [historyAutomationId, setHistoryAutomationId] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [validationExpanded, setValidationExpanded] = useState(false);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(true);
  const [suggestionCategoryFilter, setSuggestionCategoryFilter] =
    useState<SuggestedAutomationCategoryFilter>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiGeneratorOpen, setAiGeneratorOpen] = useState(false);

  const scopeParams = useMemo(() => getScopeParams(scopeSelection), [scopeSelection]);

  const automationsQuery = useQuery({
    queryKey: [...AUTOMATION_QUERY_KEY, scopeParams.scope, scopeParams.projectPath ?? null],
    queryFn: async (): Promise<AutomationDefinition[]> => {
      const search = new URLSearchParams({
        scope: scopeParams.scope,
      });
      if (scopeParams.projectPath) {
        search.set('projectPath', scopeParams.projectPath);
      }

      const payload = await automationApiRequest<AutomationListResponse>(
        `/api/automation/list?${search.toString()}`
      );
      return payload.automations ?? [];
    },
  });

  const runsQuery = useQuery({
    queryKey: RUNS_QUERY_KEY,
    queryFn: async (): Promise<AutomationRun[]> => {
      const payload = await automationApiRequest<AutomationRunsResponse>('/api/automation/runs');
      return payload.runs ?? [];
    },
    refetchInterval: RUNS_REFETCH_INTERVAL_MS,
  });

  const editorValidation = useMemo(() => validateEditorState(editor), [editor]);

  const selectedStep = useMemo(
    () => editor.steps.find((step) => step.id === selectedStepId) ?? null,
    [editor.steps, selectedStepId]
  );

  const selectedStepIndex = useMemo(
    () => editor.steps.findIndex((step) => step.id === selectedStepId),
    [editor.steps, selectedStepId]
  );

  const selectedStepDefinition = useMemo(
    () => (selectedStep ? getAutomationStepUiDefinition(selectedStep.type) : undefined),
    [selectedStep]
  );
  const webhookUrl = useMemo(() => getWebhookUrl(editor.id), [editor.id]);
  const eventSelectValue = useMemo(() => {
    const event = editor.triggerEvent.trim();
    if (!event) return '';
    return INTERNAL_EVENT_OPTIONS.includes(event as (typeof INTERNAL_EVENT_OPTIONS)[number])
      ? event
      : CUSTOM_EVENT_OPTION_VALUE;
  }, [editor.triggerEvent]);

  const workflowVariables = useMemo<WorkflowVariableDefinition[]>(() => {
    const variables: WorkflowVariableDefinition[] = [];
    for (const step of editor.steps) {
      if (step.type !== 'define-variable' && step.type !== 'set-variable') continue;
      const name = typeof step.config?.name === 'string' ? step.config.name.trim() : '';
      if (!name || variables.some((item) => item.name === name)) continue;
      variables.push({
        name,
        description:
          typeof step.config?.description === 'string' ? step.config.description : undefined,
      });
    }
    return variables;
  }, [editor.steps]);

  const stepOutputsForSelectedEditor = useMemo(() => {
    if (selectedStepIndex <= 0) return [];
    return editor.steps.slice(0, selectedStepIndex).map((step) => ({
      stepId: step.id,
      stepName: step.name,
    }));
  }, [editor.steps, selectedStepIndex]);

  const latestTestRun = useMemo(() => {
    if (!testRunId) return null;
    return (runsQuery.data ?? []).find((run) => run.id === testRunId) ?? null;
  }, [runsQuery.data, testRunId]);

  const lastRunByAutomation = useMemo(() => getLastRunMap(runsQuery.data), [runsQuery.data]);

  const filteredAutomations = useMemo(() => {
    const lowerSearch = searchText.trim().toLowerCase();
    return (automationsQuery.data ?? []).filter((automation) => {
      if (lowerSearch) {
        const inText = `${automation.name} ${automation.description ?? ''}`.toLowerCase();
        if (!inText.includes(lowerSearch)) return false;
      }

      if (triggerFilter !== 'all' && automation.trigger.type !== triggerFilter) return false;

      const lastRunStatus = lastRunByAutomation[automation.id]?.status;
      if (statusFilter === 'enabled' && automation.enabled === false) return false;
      if (statusFilter === 'disabled' && automation.enabled !== false) return false;
      if (statusFilter === 'completed' && lastRunStatus !== 'completed') return false;
      if (statusFilter === 'failed' && lastRunStatus !== 'failed') return false;
      if (statusFilter === 'running' && lastRunStatus !== 'running') return false;

      return true;
    });
  }, [automationsQuery.data, searchText, triggerFilter, statusFilter, lastRunByAutomation]);

  const invalidateAutomationQueries = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: AUTOMATION_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEY }),
    ]);
  };

  const createOrUpdateMutation = useMutation({
    mutationFn: async () => {
      if (editorValidation.errors.length > 0) {
        throw new Error(editorValidation.errors[0]);
      }

      const id = editor.id.trim();

      const definition: AutomationDefinition = {
        version: 1,
        id,
        name: editor.name.trim(),
        description: editor.description.trim() || undefined,
        enabled: editor.enabled,
        scope: scopeParams.scope,
        trigger: buildTriggerFromEditor(editor),
        steps: editor.steps.map((step, index) => normalizeStep(step, index)),
      };

      if (editingAutomationId) {
        return automationApiRequest<{ success: boolean; automation: AutomationDefinition }>(
          `/api/automation/${editingAutomationId}?scope=${scopeParams.scope}${scopeParams.projectPath ? `&projectPath=${encodeURIComponent(scopeParams.projectPath)}` : ''}`,
          {
            method: 'PUT',
            headers: getAutomationRequestHeaders(),
            body: JSON.stringify(definition),
          }
        );
      }

      return automationApiRequest<{ success: boolean; automation: AutomationDefinition }>(
        `/api/automation?scope=${scopeParams.scope}${scopeParams.projectPath ? `&projectPath=${encodeURIComponent(scopeParams.projectPath)}` : ''}`,
        {
          method: 'POST',
          headers: getAutomationRequestHeaders(),
          body: JSON.stringify(definition),
        }
      );
    },
    onSuccess: async () => {
      await invalidateAutomationQueries();
      setEditorOpen(false);
      setEditingAutomationId(null);
      setEditor(createDefaultEditorState());
      setSelectedStepId(null);
      setTestRunId(null);
      toast.success(editingAutomationId ? 'Automation updated' : 'Automation created');
    },
    onError: (error) => {
      toast.error('Failed to save automation', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ automationId, enabled }: { automationId: string; enabled: boolean }) => {
      return automationApiRequest(`/api/automation/${automationId}/enabled`, {
        method: 'PATCH',
        headers: getAutomationRequestHeaders(),
        body: JSON.stringify({
          enabled,
          scope: scopeParams.scope,
          projectPath: scopeParams.projectPath,
        }),
      });
    },
    onSuccess: async () => {
      await invalidateAutomationQueries();
    },
    onError: (error) => {
      toast.error('Failed to update automation state', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const quickActionMutation = useMutation({
    mutationFn: async (action: {
      type: 'duplicate' | 'delete' | 'trigger';
      automationId: string;
    }) => {
      if (action.type === 'duplicate') {
        return automationApiRequest(`/api/automation/${action.automationId}/duplicate`, {
          method: 'POST',
          headers: getAutomationRequestHeaders(),
          body: JSON.stringify({
            scope: scopeParams.scope,
            projectPath: scopeParams.projectPath,
          }),
        });
      }

      if (action.type === 'delete') {
        return automationApiRequest(`/api/automation/${action.automationId}`, {
          method: 'DELETE',
          headers: getAutomationRequestHeaders(),
          body: JSON.stringify({
            scope: scopeParams.scope,
            projectPath: scopeParams.projectPath,
          }),
        });
      }

      return automationApiRequest(`/api/automation/${action.automationId}/trigger`, {
        method: 'POST',
        headers: getAutomationRequestHeaders(),
        body: JSON.stringify({
          scope: scopeParams.scope,
          projectPath: scopeParams.projectPath,
        }),
      });
    },
    onMutate: (action) => {
      if (action.type === 'trigger') {
        const toastId = toast.loading('Triggering automation...');
        return { toastId };
      }
    },
    onSuccess: async (_, action, context) => {
      await invalidateAutomationQueries();
      const label =
        action.type === 'duplicate'
          ? 'Automation duplicated'
          : action.type === 'delete'
            ? 'Automation deleted'
            : 'Automation triggered';
      if (context?.toastId !== undefined) {
        toast.success(label, { id: context.toastId });
      } else {
        toast.success(label);
      }
    },
    onError: (error, action, context) => {
      if (context?.toastId !== undefined) {
        toast.error(`Failed to ${action.type} automation`, {
          id: context.toastId,
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } else {
        toast.error(`Failed to ${action.type} automation`, {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  });

  const testRunMutation = useMutation({
    mutationFn: async () => {
      if (editorValidation.errors.length > 0) {
        throw new Error(editorValidation.errors[0]);
      }

      const id = editor.id.trim();
      if (!id) {
        throw new Error('Automation ID is required for test run.');
      }

      if (!editingAutomationId) {
        throw new Error('Save the automation before running a test.');
      }

      const payload = await automationApiRequest<{ success: boolean; runId?: string }>(
        `/api/automation/${id}/trigger`,
        {
          method: 'POST',
          headers: getAutomationRequestHeaders(),
          body: JSON.stringify({
            scope: scopeParams.scope,
            projectPath: scopeParams.projectPath,
            triggerMetadata: {
              triggeredBy: TEST_RUN_TRIGGER_SOURCE,
            },
          }),
        }
      );

      if (!payload.runId) {
        throw new Error('Test run did not return a run ID.');
      }
      return payload.runId;
    },
    onSuccess: async (runId) => {
      setTestRunId(runId);
      await queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEY });
      toast.success('Test run started');
    },
    onError: (error) => {
      toast.error('Failed to run automation test', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const addStep = (type: BuiltInAutomationStepType) => {
    const step = createDefaultStep(type);
    setEditor((prev) => ({ ...prev, steps: [...prev.steps, step] }));
    setSelectedStepId(step.id);
  };

  const moveStep = (stepId: string, direction: 'up' | 'down') => {
    setEditor((prev) => {
      const index = prev.steps.findIndex((step) => step.id === stepId);
      if (index < 0) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.steps.length) return prev;
      const nextSteps = [...prev.steps];
      const [item] = nextSteps.splice(index, 1);
      nextSteps.splice(targetIndex, 0, item);
      return { ...prev, steps: nextSteps };
    });
  };

  const removeStep = (stepId: string) => {
    setEditor((prev) => ({ ...prev, steps: prev.steps.filter((step) => step.id !== stepId) }));
    setSelectedStepId((prevSelected) => (prevSelected === stepId ? null : prevSelected));
  };

  const updateStep = (stepId: string, patch: Partial<AutomationStep>) => {
    setEditor((prev) => ({
      ...prev,
      steps: prev.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    }));
  };

  const updateStepConfig = (stepId: string, config: Record<string, unknown>) => {
    setEditor((prev) => ({
      ...prev,
      steps: prev.steps.map((step) => (step.id === stepId ? { ...step, config } : step)),
    }));
  };

  const openCreateDialog = () => {
    const nextId = generateNextAutomationId(automationsQuery.data ?? []);
    const nextEditor = createDefaultEditorState(nextId);
    setEditingAutomationId(null);
    setEditor(nextEditor);
    setSelectedStepId(nextEditor.steps[0]?.id ?? null);
    setTestRunId(null);
    setValidationExpanded(false);
    setEditorOpen(true);
  };

  const buildEditorStateFromDefinition = (
    definition: Omit<AutomationDefinition, 'version' | 'scope'>
  ): { editorState: EditorState; firstStepId: string | null } => {
    const normalizedSteps = (definition.steps ?? []).map(normalizeStep);
    return {
      editorState: {
        id: definition.id,
        name: definition.name,
        description: definition.description ?? '',
        enabled: definition.enabled !== false,
        triggerType: definition.trigger.type,
        triggerCron: definition.trigger.cron ?? DEFAULT_CRON_EXPRESSION,
        triggerEvent: definition.trigger.event ?? '',
        triggerDate: definition.trigger.date ?? '',
        triggerMethods: (definition.trigger.methods ?? ['POST']).join(','),
        triggerSecret: definition.trigger.secret ?? '',
        triggerTimezone: definition.trigger.timezone ?? '',
        steps: normalizedSteps,
      },
      firstStepId: normalizedSteps[0]?.id ?? null,
    };
  };

  const openEditorWith = (
    definition: Omit<AutomationDefinition, 'version' | 'scope'>,
    existingAutomationId: string | null
  ) => {
    const { editorState, firstStepId } = buildEditorStateFromDefinition(definition);
    setEditingAutomationId(existingAutomationId);
    setEditor(editorState);
    setSelectedStepId(firstStepId);
    setTestRunId(null);
    setValidationExpanded(false);
    setEditorOpen(true);
  };

  const openEditDialog = (automation: AutomationDefinition) => {
    openEditorWith(automation, automation.id);
  };

  const openFromSuggestion = (suggestion: SuggestedAutomation) => {
    const nextId = generateNextAutomationId(automationsQuery.data ?? []);
    openEditorWith(suggestion.buildDefinition(nextId, effectiveDefaultModel), null);
  };

  const filteredSuggestions = useMemo(() => {
    if (suggestionCategoryFilter === 'all') return SUGGESTED_AUTOMATIONS;
    return SUGGESTED_AUTOMATIONS.filter((s) => s.category === suggestionCategoryFilter);
  }, [suggestionCategoryFilter]);

  const handleExportSingle = (automation: AutomationDefinition) => {
    downloadJson(automation, `${automation.id}.json`);
  };

  const handleExportAll = async () => {
    try {
      const query = new URLSearchParams({
        scope: scopeParams.scope,
      });
      if (scopeParams.projectPath) {
        query.set('projectPath', scopeParams.projectPath);
      }
      const payload = await automationApiRequest<{
        success: boolean;
        automations: AutomationDefinition[];
      }>(`/api/automation/export?${query.toString()}`);
      downloadJson(payload.automations ?? [], `automations-${scopeParams.scope}.json`);
      toast.success('Automations exported');
    } catch (error) {
      toast.error('Failed to export automations', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    const parsedAutomations: AutomationDefinition[] = [];
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          parsedAutomations.push(...(parsed as AutomationDefinition[]));
        } else {
          parsedAutomations.push(parsed as AutomationDefinition);
        }
      } catch (error) {
        toast.error(`Failed to parse ${file.name}`, {
          description: error instanceof Error ? error.message : 'Invalid JSON',
        });
      }
    }

    if (parsedAutomations.length === 0) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    try {
      const payload = await automationApiRequest<{
        success: boolean;
        imported: AutomationDefinition[];
        failures: Array<{ id?: string; error: string }>;
      }>('/api/automation/import', {
        method: 'POST',
        headers: getAutomationRequestHeaders(),
        body: JSON.stringify({
          automations: parsedAutomations,
          scope: scopeParams.scope,
          projectPath: scopeParams.projectPath,
        }),
      });

      await invalidateAutomationQueries();
      if (payload.failures.length > 0) {
        toast.warning(
          `Imported ${payload.imported.length} automations with ${payload.failures.length} failures`
        );
      } else {
        toast.success(`Imported ${payload.imported.length} automations`);
      }
    } catch (error) {
      toast.error('Failed to import automations', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const selectedProjectName = useMemo(() => {
    if (scopeSelection === 'global') return 'Global';
    const projectPath = scopeSelection.replace(/^project:/, '');
    return projects.find((project) => project.path === projectPath)?.name ?? projectPath;
  }, [scopeSelection, projects]);

  const StepEditorComponent = selectedStepDefinition?.editor;

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden content-bg"
      data-testid="automation-management-view"
    >
      <div className="border-b border-border/60 px-4 sm:px-6 py-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Bot className="w-6 h-6 text-brand-500" />
              Automations
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage {selectedProjectName} automation workflows
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Secondary actions: individual buttons on sm+, dropdown on mobile */}
            <div className="hidden sm:flex items-center gap-2">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
              <Button variant="outline" onClick={handleExportAll}>
                <Download className="w-4 h-4 mr-2" />
                Export All
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setHistoryAutomationId(null); // Close single-automation dialog if open
                  setShowAllHistory(true);
                }}
                title="View run history for all automations"
                aria-label="View all automation run history"
              >
                <History className="w-4 h-4 mr-2" />
                Run History
              </Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="sm:hidden"
                  aria-label="More options"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportAll}>
                  <Download className="w-4 h-4 mr-2" />
                  Export All
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setHistoryAutomationId(null);
                    setShowAllHistory(true);
                  }}
                >
                  <History className="w-4 h-4 mr-2" />
                  Run History
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              onClick={() => setAiGeneratorOpen(true)}
              data-testid="ai-generate-button"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Generate with AI
            </Button>
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Create New
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
        <Card>
          <CardHeader>
            <CardTitle>Scope And Filters</CardTitle>
            <CardDescription>Switch between global and per-project automations</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select
                value={scopeSelection}
                onValueChange={(next) => setScopeSelection(next as ScopeOption)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopeOptions.map((option) => {
                    if (option === 'global') {
                      return (
                        <SelectItem key={option} value={option}>
                          Global automations
                        </SelectItem>
                      );
                    }
                    const projectPath = option.replace(/^project:/, '');
                    const name =
                      projects.find((project) => project.path === projectPath)?.name ?? projectPath;
                    return (
                      <SelectItem key={option} value={option}>
                        Project: {name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Name or description"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Trigger Type</Label>
              <Select
                value={triggerFilter}
                onValueChange={(next) => setTriggerFilter(next as 'all' | AutomationTriggerType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All triggers</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="schedule">Schedule</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(next) => setStatusFilter(next as StatusFilter)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="enabled">Enabled</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="completed">Last run completed</SelectItem>
                  <SelectItem value="failed">Last run failed</SelectItem>
                  <SelectItem value="running">Currently running</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Collapsible open={suggestionsExpanded} onOpenChange={setSuggestionsExpanded}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer select-none">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Suggested Automations
                  <ChevronRight
                    className={cn(
                      'w-4 h-4 text-muted-foreground transition-transform ml-auto',
                      suggestionsExpanded && 'rotate-90'
                    )}
                  />
                </CardTitle>
                <CardDescription>
                  Start with a template to quickly set up common workflows
                </CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_AUTOMATION_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSuggestionCategoryFilter(cat.id)}
                      className={cn(
                        'px-3 py-1 text-sm rounded-full border transition-colors',
                        suggestionCategoryFilter === cat.id
                          ? 'bg-brand-500/10 border-brand-500/40 text-brand-600 dark:text-brand-400 font-medium'
                          : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground'
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => openFromSuggestion(suggestion)}
                      className="text-left rounded-lg border border-border/60 p-4 hover:border-brand-500/40 hover:bg-brand-500/5 transition-colors group"
                      data-testid={`suggestion-${suggestion.id}`}
                    >
                      <div className="text-2xl mb-2">{suggestion.icon}</div>
                      <p className="text-sm font-medium group-hover:text-brand-600 dark:group-hover:text-brand-400">
                        {suggestion.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {suggestion.description}
                      </p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Card>
          <CardHeader>
            <CardTitle>Automation List</CardTitle>
            <CardDescription>
              {filteredAutomations.length} automation{filteredAutomations.length === 1 ? '' : 's'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {automationsQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Loading automations...</p>
            )}
            {!automationsQuery.isLoading && filteredAutomations.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No automations found for the current filters.
              </p>
            )}

            {filteredAutomations.map((automation) => {
              const lastRun = lastRunByAutomation[automation.id];
              const isEnabled = automation.enabled !== false;

              return (
                <div
                  key={automation.id}
                  className="border border-border/60 rounded-lg p-3 sm:p-4 flex flex-col gap-3"
                  data-testid={`automation-row-${automation.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{automation.name}</h3>
                        <Badge variant="outline">{automation.id}</Badge>
                        <Badge variant="secondary">{automation.trigger.type}</Badge>
                        <Badge variant={isEnabled ? 'default' : 'outline'}>
                          {isEnabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {automation.description || 'No description'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTrigger(automation.trigger)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Last run:{' '}
                        {lastRun ? (
                          <>
                            <span className="font-medium">{lastRun.status}</span> at{' '}
                            {new Date(lastRun.startedAt).toLocaleString()}
                          </>
                        ) : (
                          'Never'
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`enabled-${automation.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        Enabled
                      </Label>
                      <Switch
                        id={`enabled-${automation.id}`}
                        checked={isEnabled}
                        onCheckedChange={(next) =>
                          toggleMutation.mutate({
                            automationId: automation.id,
                            enabled: Boolean(next),
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditDialog(automation)}>
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        quickActionMutation.isPending &&
                        quickActionMutation.variables?.type === 'trigger' &&
                        quickActionMutation.variables?.automationId === automation.id
                      }
                      onClick={() =>
                        quickActionMutation.mutate({ type: 'trigger', automationId: automation.id })
                      }
                    >
                      {quickActionMutation.isPending &&
                      quickActionMutation.variables?.type === 'trigger' &&
                      quickActionMutation.variables?.automationId === automation.id ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Trigger
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowAllHistory(false); // Close all-history dialog if open
                        setHistoryAutomationId(automation.id);
                      }}
                    >
                      <History className="w-3.5 h-3.5 mr-1.5" />
                      History
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        quickActionMutation.mutate({
                          type: 'duplicate',
                          automationId: automation.id,
                        })
                      }
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      Duplicate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleExportSingle(automation)}
                    >
                      <FileJson className="w-3.5 h-3.5 mr-1.5" />
                      Export
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        quickActionMutation.mutate({ type: 'delete', automationId: automation.id })
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          void handleImportFiles(event.target.files);
        }}
      />

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) {
            setEditingAutomationId(null);
            setSelectedStepId(null);
            setTestRunId(null);
            setValidationExpanded(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-7xl" data-testid="automation-editor-dialog">
          <DialogHeader>
            <DialogTitle>
              {editingAutomationId ? 'Edit Automation' : 'Create Automation'}
            </DialogTitle>
            <DialogDescription>
              Visual editor for metadata, triggers, steps, and test runs
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[72vh] overflow-y-auto space-y-4 pr-1">
            {(editorValidation.errors.length > 0 || editorValidation.warnings.length > 0) && (
              <Collapsible open={validationExpanded} onOpenChange={setValidationExpanded}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-sm text-left flex-1 min-w-0"
                      aria-expanded={validationExpanded}
                    >
                      <ChevronRight
                        className={cn(
                          'w-4 h-4 transition-transform',
                          validationExpanded && 'rotate-90'
                        )}
                      />
                      <span className="font-medium">
                        {buildValidationSummary(
                          editorValidation.errors.length,
                          editorValidation.warnings.length
                        )}
                      </span>
                    </button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                  <div className="mt-2 px-3 py-2 rounded-md border border-border/60 text-sm space-y-1">
                    {editorValidation.errors.map((error, index) => (
                      <p key={`error-${index}`} className="text-destructive">
                        {error}
                      </p>
                    ))}
                    {editorValidation.warnings.map((warning, index) => (
                      <p key={`warning-${index}`} className="text-amber-600">
                        {warning}
                      </p>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Metadata</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="automation-id">Automation ID</Label>
                      <Input
                        id="automation-id"
                        value={editor.id}
                        onChange={(event) =>
                          setEditor((prev) => ({ ...prev, id: event.target.value }))
                        }
                        disabled={Boolean(editingAutomationId)}
                        placeholder="nightly-sync"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="automation-name">Name</Label>
                      <Input
                        id="automation-name"
                        value={editor.name}
                        onChange={(event) =>
                          setEditor((prev) => ({ ...prev, name: event.target.value }))
                        }
                        placeholder="Nightly Sync"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="automation-description">Description</Label>
                      <Input
                        id="automation-description"
                        value={editor.description}
                        onChange={(event) =>
                          setEditor((prev) => ({ ...prev, description: event.target.value }))
                        }
                        placeholder="Sync project status and post digest"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Scope</Label>
                      <Input value={scopeParams.scope} disabled />
                    </div>
                    <div className="space-y-2 flex items-center gap-2">
                      <Switch
                        id="automation-enabled"
                        checked={editor.enabled}
                        onCheckedChange={(next) =>
                          setEditor((prev) => ({ ...prev, enabled: Boolean(next) }))
                        }
                      />
                      <Label htmlFor="automation-enabled">Enabled</Label>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Trigger Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <Label>Trigger Type</Label>
                      <Select
                        value={editor.triggerType}
                        onValueChange={(next) =>
                          setEditor((prev) => ({
                            ...prev,
                            triggerType: next as AutomationTriggerType,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual</SelectItem>
                          <SelectItem value="event">Event</SelectItem>
                          <SelectItem value="schedule">Schedule</SelectItem>
                          <SelectItem value="webhook">Webhook</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {editor.triggerType === 'event' && (
                      <>
                        <div className="space-y-2">
                          <Label>Internal Event</Label>
                          <Select
                            value={eventSelectValue}
                            onValueChange={(next) => {
                              if (next === CUSTOM_EVENT_OPTION_VALUE) {
                                setEditor((prev) => ({ ...prev, triggerEvent: '' }));
                                return;
                              }
                              setEditor((prev) => ({ ...prev, triggerEvent: next }));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select event" />
                            </SelectTrigger>
                            <SelectContent>
                              {INTERNAL_EVENT_OPTIONS.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                              <SelectItem value={CUSTOM_EVENT_OPTION_VALUE}>
                                Custom event...
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {eventSelectValue === CUSTOM_EVENT_OPTION_VALUE && (
                          <div className="space-y-2">
                            <Label htmlFor="trigger-event">Custom Event Name</Label>
                            <Input
                              id="trigger-event"
                              value={editor.triggerEvent}
                              onChange={(event) =>
                                setEditor((prev) => ({ ...prev, triggerEvent: event.target.value }))
                              }
                              placeholder="feature_success"
                            />
                          </div>
                        )}
                      </>
                    )}

                    {editor.triggerType === 'schedule' && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="trigger-cron">Cron</Label>
                          <Input
                            id="trigger-cron"
                            value={editor.triggerCron}
                            onChange={(event) =>
                              setEditor((prev) => ({ ...prev, triggerCron: event.target.value }))
                            }
                            placeholder={DEFAULT_CRON_EXPRESSION}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="trigger-timezone">Timezone</Label>
                          <Input
                            id="trigger-timezone"
                            value={editor.triggerTimezone}
                            onChange={(event) =>
                              setEditor((prev) => ({
                                ...prev,
                                triggerTimezone: event.target.value,
                              }))
                            }
                            placeholder="America/New_York"
                          />
                        </div>
                      </>
                    )}

                    {editor.triggerType === 'date' && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="trigger-date">ISO Date</Label>
                          <Input
                            id="trigger-date"
                            type="datetime-local"
                            value={editor.triggerDate}
                            onChange={(event) =>
                              setEditor((prev) => ({ ...prev, triggerDate: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="trigger-date-timezone">Timezone</Label>
                          <Input
                            id="trigger-date-timezone"
                            value={editor.triggerTimezone}
                            onChange={(event) =>
                              setEditor((prev) => ({
                                ...prev,
                                triggerTimezone: event.target.value,
                              }))
                            }
                            placeholder="America/New_York"
                          />
                        </div>
                      </>
                    )}

                    {editor.triggerType === 'webhook' && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="trigger-webhook-url">Webhook URL</Label>
                          <div className="flex gap-2">
                            <Input
                              id="trigger-webhook-url"
                              value={webhookUrl}
                              readOnly
                              placeholder="Save with an automation ID to generate a webhook URL"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={async () => {
                                if (!webhookUrl) return;
                                await navigator.clipboard.writeText(webhookUrl);
                                toast.success('Webhook URL copied');
                              }}
                              disabled={!webhookUrl}
                              title="Copy webhook URL"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Send requests to this endpoint with optional `X-Automation-Token`
                            header.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="trigger-methods">Methods (comma-separated)</Label>
                          <Input
                            id="trigger-methods"
                            value={editor.triggerMethods}
                            onChange={(event) =>
                              setEditor((prev) => ({ ...prev, triggerMethods: event.target.value }))
                            }
                            placeholder="POST,PUT"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="trigger-secret">Secret (optional)</Label>
                          <Input
                            id="trigger-secret"
                            value={editor.triggerSecret}
                            onChange={(event) =>
                              setEditor((prev) => ({ ...prev, triggerSecret: event.target.value }))
                            }
                            placeholder="my-webhook-secret"
                          />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Test Run</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      variant="outline"
                      onClick={() => testRunMutation.mutate()}
                      disabled={testRunMutation.isPending || !editingAutomationId}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      {testRunMutation.isPending ? 'Running...' : 'Run Test'}
                    </Button>
                    {!editingAutomationId && (
                      <p className="text-xs text-muted-foreground">
                        Save first, then run an inline test.
                      </p>
                    )}
                    {latestTestRun && (
                      <div className="text-sm rounded-md border border-border/60 p-2 space-y-1">
                        <p>
                          <span className="text-muted-foreground">Run:</span> {latestTestRun.id}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Status:</span>{' '}
                          {latestTestRun.status}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Steps:</span>{' '}
                          {latestTestRun.stepRuns.length}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Step Builder</CardTitle>
                    <CardDescription>Add, reorder, and select workflow steps</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button className="w-full" data-testid="add-step-button">
                          <Plus className="w-4 h-4 mr-1.5" />
                          Add Step
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        className="w-56 max-h-[50vh] overflow-y-auto"
                        data-testid="add-step-dropdown"
                      >
                        {(['features', 'ai', 'variables', 'integrations', 'flow'] as const).map(
                          (category) => {
                            const categorySteps = AUTOMATION_STEP_UI_DEFINITIONS.filter(
                              (def) => def.category === category
                            );
                            if (categorySteps.length === 0) return null;
                            const categoryLabel =
                              category === 'ai'
                                ? 'AI'
                                : category.charAt(0).toUpperCase() + category.slice(1);
                            return (
                              <div key={category}>
                                <DropdownMenuLabel>{categoryLabel}</DropdownMenuLabel>
                                {categorySteps.map((definition) => (
                                  <DropdownMenuItem
                                    key={definition.type}
                                    onClick={() => addStep(definition.type)}
                                    aria-label={`Add ${definition.title} step`}
                                    data-step-type={definition.type}
                                  >
                                    {definition.title}
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                              </div>
                            );
                          }
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                      {editor.steps.map((step, index) => {
                        const definition = getAutomationStepUiDefinition(step.type);
                        const isSelected = step.id === selectedStepId;
                        return (
                          <div
                            key={step.id}
                            data-testid="step-item"
                            data-step-type={step.type}
                            className={`rounded-md border p-2 space-y-2 ${isSelected ? 'border-brand-500 bg-brand-500/5' : 'border-border/60'}`}
                          >
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                className="text-left min-w-0 flex-1"
                                onClick={() => setSelectedStepId(step.id)}
                              >
                                <p className="text-sm font-medium truncate">
                                  {index + 1}. {step.name || definition?.title || step.type}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {getStepSummary(step)}
                                </p>
                              </button>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => moveStep(step.id, 'up')}
                                  disabled={index === 0}
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => moveStep(step.id, 'down')}
                                  disabled={index === editor.steps.length - 1}
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => removeStep(step.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                            {(step.type === 'if' || step.type === 'loop') && (
                              <div className="ml-3 border-l border-border/60 pl-2 text-xs text-muted-foreground space-y-1">
                                {step.type === 'if' && (
                                  <>
                                    <p>
                                      Then steps:{' '}
                                      {Array.isArray(step.config?.thenSteps)
                                        ? step.config.thenSteps.length
                                        : 0}
                                    </p>
                                    <p>
                                      Else steps:{' '}
                                      {Array.isArray(step.config?.elseSteps)
                                        ? step.config.elseSteps.length
                                        : 0}
                                    </p>
                                  </>
                                )}
                                {step.type === 'loop' && (
                                  <p>
                                    Nested steps:{' '}
                                    {Array.isArray(step.config?.steps)
                                      ? step.config.steps.length
                                      : 0}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Step Editor</CardTitle>
                    <CardDescription>
                      Configure the selected step and insert variables
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedStep ? (
                      <>
                        <div className="space-y-2">
                          <Label>Step Name</Label>
                          <Input
                            value={selectedStep.name ?? ''}
                            onChange={(event) =>
                              updateStep(selectedStep.id, { name: event.target.value })
                            }
                            placeholder={selectedStepDefinition?.title ?? selectedStep.type}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Step Type</Label>
                          <Select
                            value={selectedStep.type}
                            onValueChange={(next) =>
                              updateStep(selectedStep.id, {
                                type: next,
                                config: selectedStep.config ?? {},
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AUTOMATION_STEP_UI_DEFINITIONS.map((definition) => (
                                <SelectItem key={definition.type} value={definition.type}>
                                  {definition.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {StepEditorComponent ? (
                          <StepEditorComponent
                            config={selectedStep.config ?? {}}
                            onConfigChange={(nextConfig) =>
                              updateStepConfig(selectedStep.id, nextConfig)
                            }
                            workflowVariables={workflowVariables}
                            stepOutputs={stepOutputsForSelectedEditor}
                            automations={automationsQuery.data}
                            currentAutomationId={editor.id}
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No editor is registered for this step type.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Select a step to edit its configuration.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Variable Picker</CardTitle>
                    <CardDescription>
                      System, project, workflow, and step output variables
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <VariableBrowser
                      className="h-[260px]"
                      workflowVariables={workflowVariables}
                      stepOutputs={editor.steps.map((step) => ({
                        stepId: step.id,
                        stepName: step.name,
                      }))}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditorOpen(false);
                setEditingAutomationId(null);
                setSelectedStepId(null);
                setTestRunId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createOrUpdateMutation.mutate()}
              disabled={createOrUpdateMutation.isPending || editorValidation.errors.length > 0}
            >
              {createOrUpdateMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog
        open={historyAutomationId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryAutomationId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Run History:{' '}
              {automationsQuery.data?.find((a) => a.id === historyAutomationId)?.name ??
                historyAutomationId ??
                ''}
            </DialogTitle>
            <DialogDescription>
              View run history and upcoming scheduled runs for this automation
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
            {historyAutomationId && (
              <AutomationRunHistoryView automationId={historyAutomationId} hideHeader />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* All Run History Dialog */}
      <Dialog
        open={showAllHistory}
        onOpenChange={(open) => {
          if (!open) {
            setShowAllHistory(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              All Run History
            </DialogTitle>
            <DialogDescription>
              View run history and upcoming scheduled runs for all automations
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
            <AutomationRunHistoryView hideHeader />
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Automation Generator Dialog */}
      <AiAutomationGenerator
        open={aiGeneratorOpen}
        onOpenChange={setAiGeneratorOpen}
        automationId={generateNextAutomationId(automationsQuery.data ?? [])}
        onAccept={(definition) => {
          openEditorWith(definition, null);
        }}
      />
    </div>
  );
}
