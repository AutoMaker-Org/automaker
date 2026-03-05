/**
 * Route: AI-powered automation generation
 *
 * - POST /api/automation/generate - Generate an automation definition from natural language
 * - POST /api/automation/generate/refine - Refine an existing automation definition with follow-up instructions
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { simpleQuery } from '../../../providers/simple-query-service.js';
import type {
  AutomationDefinition,
  AutomationStep,
  BuiltInAutomationStepType,
} from '@automaker/types';

const logger = createLogger('automation-generate');

/** Step types available for AI to use in generated automations */
const AVAILABLE_STEP_TYPES: {
  type: BuiltInAutomationStepType;
  description: string;
  configFields: string;
}[] = [
  {
    type: 'create-feature',
    description: 'Creates a new feature/task in the project',
    configFields: 'title (string), description (string), category (string)',
  },
  {
    type: 'manage-feature',
    description: 'Starts, stops, edits, or deletes an existing feature',
    configFields: 'action (enum: start|stop|edit|delete, required), featureId (string, required)',
  },
  {
    type: 'run-ai-prompt',
    description: 'Executes an AI prompt with configurable model',
    configFields: 'prompt (string, required), model (string, e.g. "sonnet")',
  },
  {
    type: 'run-typescript-code',
    description: 'Executes TypeScript/JavaScript in a sandbox',
    configFields: 'code (string, required)',
  },
  {
    type: 'define-variable',
    description: 'Creates or updates a workflow variable',
    configFields: 'name (string), value (any JSON value)',
  },
  {
    type: 'set-variable',
    description: 'Sets a workflow variable (alias for define-variable)',
    configFields: 'name (string), value (any JSON value)',
  },
  {
    type: 'call-http-endpoint',
    description: 'Makes HTTP requests to external APIs',
    configFields:
      'method (enum: GET|POST|PUT|DELETE), url (string, required), headers (JSON object), body (string/JSON)',
  },
  {
    type: 'run-script-exec',
    description: 'Executes shell commands or scripts',
    configFields: 'command (string, required), allowDangerousCommands (boolean)',
  },
  {
    type: 'emit-event',
    description: 'Emits an internal event',
    configFields: 'eventType (string, required)',
  },
  {
    type: 'write-file',
    description: 'Writes content to a file on disk',
    configFields:
      'filePath (string, required), content (string, required), encoding (enum: utf8|ascii|base64|binary), createDirs (boolean), append (boolean)',
  },
  {
    type: 'if',
    description: 'Conditional branching based on an expression',
    configFields:
      'condition (string, required), thenSteps (array of step objects), elseSteps (array of step objects)',
  },
  {
    type: 'loop',
    description: 'Repeats nested steps over items or a count',
    configFields: 'count (number) OR items (string reference), steps (array of step objects)',
  },
  {
    type: 'call-automation',
    description: 'Invokes another automation by ID',
    configFields: 'automationId (string, required)',
  },
  {
    type: 'git-status',
    description: 'Gets current git status',
    configFields: '(none required)',
  },
  {
    type: 'git-commit',
    description: 'Creates a git commit',
    configFields: 'message (string, required), files (string[])',
  },
  {
    type: 'git-push',
    description: 'Pushes to remote',
    configFields: 'remote (string), branch (string)',
  },
  {
    type: 'git-pull',
    description: 'Pulls from remote',
    configFields: 'remote (string), branch (string)',
  },
  {
    type: 'git-checkout',
    description: 'Switches branches',
    configFields: 'branch (string, required), create (boolean)',
  },
  {
    type: 'git-branch',
    description: 'Lists, creates, or deletes branches',
    configFields: 'action (enum: list|create|delete|current), name (string)',
  },
];

const STEP_TYPES_REFERENCE = AVAILABLE_STEP_TYPES.map(
  (s) => `- "${s.type}": ${s.description}. Config: ${s.configFields}`
).join('\n');

function buildGenerationSystemPrompt(defaultModel?: Record<string, unknown>): string {
  const defaultModelInstruction = defaultModel
    ? `\n9. For "run-ai-prompt" steps, set config.model to ${JSON.stringify(defaultModel)} unless the user explicitly specifies a different model`
    : '';

  return `You are an expert automation builder for Automaker, an AI development studio. You generate structured automation definitions from natural language descriptions.

AVAILABLE STEP TYPES:
${STEP_TYPES_REFERENCE}

TRIGGER TYPES:
- "manual": Triggered manually by the user
- "event": Triggered by internal events (feature_created, feature_success, feature_error, auto_mode_complete, auto_mode_error, or custom events)
- "schedule": Cron-based scheduling (e.g., "0 9 * * *" for 9 AM daily)
- "webhook": HTTP endpoint trigger with optional secret token
- "date": One-time execution at a specific datetime

VARIABLE SYSTEM:
- Reference system variables: {{system.now}}, {{system.projectPath}}, {{system.platform}}, etc.
- Reference previous step outputs: {{steps.step-1.output}}, {{steps.step-2.output}}, etc.
- Reference workflow variables: {{workflow.variableName}}
- Define variables with define-variable or set-variable steps

RULES:
1. Generate valid JSON matching the AutomationDefinition schema
2. Step IDs must be sequential: "step-1", "step-2", "step-3", etc.
3. Each step must have: id, type, name, and config (object)
4. Choose the most appropriate trigger type based on the description
5. Use meaningful step names that describe what each step does
6. If a described action doesn't map to any known step type, use "run-ai-prompt" with a prompt that describes the desired action, and set the step name to indicate it needs review
7. When referencing output from previous steps, use the {{steps.step-N.output}} syntax
8. For ambiguous descriptions, make reasonable assumptions and generate a best-guess automation${defaultModelInstruction}

OUTPUT FORMAT:
Return ONLY a valid JSON object with this structure (no markdown, no explanation):
{
  "name": "Human-readable automation name",
  "description": "Brief description of what this automation does",
  "trigger": { "type": "manual" },
  "steps": [
    { "id": "step-1", "type": "step-type", "name": "Step Name", "config": {} }
  ],
  "warnings": ["Optional array of warnings about ambiguous or uncertain mappings"]
}`;
}

function buildRefinementSystemPrompt(defaultModel?: Record<string, unknown>): string {
  const defaultModelInstruction = defaultModel
    ? `\n8. For new "run-ai-prompt" steps, set config.model to ${JSON.stringify(defaultModel)} unless the user explicitly specifies a different model`
    : '';

  return `You are an expert automation builder for Automaker. You refine existing automation definitions based on follow-up instructions.

AVAILABLE STEP TYPES:
${STEP_TYPES_REFERENCE}

RULES:
1. Preserve the existing automation structure as much as possible
2. Only modify steps that are directly affected by the refinement instruction
3. When adding new steps, continue the sequential step ID numbering
4. When removing steps, renumber remaining step IDs sequentially
5. Update step references ({{steps.step-N.output}}) if step IDs change
6. If the instruction is unclear, make minimal changes and add a warning
7. Maintain all existing step configurations that are not being changed${defaultModelInstruction}

OUTPUT FORMAT:
Return ONLY a valid JSON object with this structure (no markdown, no explanation):
{
  "name": "Updated automation name (or keep existing)",
  "description": "Updated description (or keep existing)",
  "trigger": { "type": "trigger-type", ...triggerConfig },
  "steps": [
    { "id": "step-1", "type": "step-type", "name": "Step Name", "config": {} }
  ],
  "warnings": ["Optional array of warnings about changes made"],
  "changes": ["Brief list of what was changed"]
}`;
}

const KNOWN_STEP_TYPES = new Set<string>(AVAILABLE_STEP_TYPES.map((s) => s.type));

function validateAndNormalizeSteps(steps: unknown[]): AutomationStep[] {
  return steps.map((rawStep, index) => {
    const step = rawStep as Record<string, unknown>;
    const id = typeof step.id === 'string' ? step.id : `step-${index + 1}`;
    const type = typeof step.type === 'string' ? step.type : 'define-variable';
    const name = typeof step.name === 'string' ? step.name : type;
    const config = (
      typeof step.config === 'object' && step.config !== null ? step.config : {}
    ) as Record<string, unknown>;

    // Mark unknown step types with a warning in the name
    const normalizedName = KNOWN_STEP_TYPES.has(type) ? name : `[Unknown Type] ${name}`;

    return {
      id,
      type: KNOWN_STEP_TYPES.has(type) ? type : 'run-ai-prompt',
      name: normalizedName,
      config: KNOWN_STEP_TYPES.has(type)
        ? config
        : { ...config, prompt: config.prompt || `TODO: Implement "${name}"` },
    };
  });
}

function parseGeneratedAutomation(text: string): {
  definition: Omit<AutomationDefinition, 'version' | 'id' | 'scope'>;
  warnings: string[];
  changes?: string[];
} {
  // Try to extract JSON from the response (handle potential markdown wrapping)
  let jsonText = text.trim();
  const jsonMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  // Also handle case where response starts/ends with non-JSON text
  const braceStart = jsonText.indexOf('{');
  const braceEnd = jsonText.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    jsonText = jsonText.slice(braceStart, braceEnd + 1);
  }

  const parsed = JSON.parse(jsonText);

  const name = typeof parsed.name === 'string' ? parsed.name : 'Generated Automation';
  const description = typeof parsed.description === 'string' ? parsed.description : '';
  const trigger =
    parsed.trigger && typeof parsed.trigger === 'object' ? parsed.trigger : { type: 'manual' };
  const steps = Array.isArray(parsed.steps) ? validateAndNormalizeSteps(parsed.steps) : [];
  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((w: unknown) => typeof w === 'string')
    : [];
  const changes = Array.isArray(parsed.changes)
    ? parsed.changes.filter((c: unknown) => typeof c === 'string')
    : undefined;

  // Validate trigger type
  const validTriggerTypes = ['manual', 'event', 'schedule', 'webhook', 'date'];
  if (!validTriggerTypes.includes(trigger.type)) {
    trigger.type = 'manual';
    warnings.push(`Unknown trigger type was reset to "manual".`);
  }

  if (steps.length === 0) {
    steps.push({
      id: 'step-1',
      type: 'define-variable',
      name: 'Placeholder Step',
      config: { name: 'placeholder', value: 'TODO: Add automation steps' },
    });
    warnings.push('No valid steps were generated. A placeholder step was added.');
  }

  return {
    definition: {
      name,
      description,
      enabled: true,
      trigger,
      steps,
    },
    warnings,
    changes,
  };
}

export function createGenerateRoute(): Router {
  const router = Router();

  // POST /api/automation/generate - Generate automation from natural language
  router.post('/generate', async (req: Request, res: Response) => {
    try {
      const { prompt, model, defaultModel } = req.body as {
        prompt?: string;
        model?: string;
        defaultModel?: Record<string, unknown>;
      };

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({
          success: false,
          error: 'A prompt describing the desired automation is required.',
        });
        return;
      }

      const trimmedPrompt = prompt.trim();
      if (trimmedPrompt.length > 5000) {
        res.status(400).json({
          success: false,
          error: 'Prompt must be 5000 characters or fewer.',
        });
        return;
      }

      logger.info(`Generating automation from prompt: "${trimmedPrompt.slice(0, 80)}..."`);

      const result = await simpleQuery({
        prompt: `Generate an automation definition for the following description:\n\n${trimmedPrompt}`,
        systemPrompt: buildGenerationSystemPrompt(defaultModel),
        model: model || 'claude-sonnet-4-6',
        cwd: process.cwd(),
        maxTurns: 1,
        allowedTools: [],
      });

      const { definition, warnings } = parseGeneratedAutomation(result.text);

      res.json({
        success: true,
        definition,
        warnings,
      });
    } catch (error) {
      logger.error('Failed to generate automation:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate automation';
      res.status(500).json({ success: false, error: message });
    }
  });

  // POST /api/automation/generate/refine - Refine an existing automation with follow-up
  router.post('/generate/refine', async (req: Request, res: Response) => {
    try {
      const { prompt, currentDefinition, model, defaultModel } = req.body as {
        prompt?: string;
        currentDefinition?: Record<string, unknown>;
        model?: string;
        defaultModel?: Record<string, unknown>;
      };

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({
          success: false,
          error: 'A refinement instruction is required.',
        });
        return;
      }

      if (!currentDefinition || typeof currentDefinition !== 'object') {
        res.status(400).json({
          success: false,
          error: 'Current automation definition is required for refinement.',
        });
        return;
      }

      const trimmedPrompt = prompt.trim();

      logger.info(`Refining automation with instruction: "${trimmedPrompt.slice(0, 80)}..."`);

      const currentDefinitionJson = JSON.stringify(currentDefinition, null, 2);

      const result = await simpleQuery({
        prompt: `Here is the current automation definition:\n\n${currentDefinitionJson}\n\nApply the following refinement:\n\n${trimmedPrompt}`,
        systemPrompt: buildRefinementSystemPrompt(defaultModel),
        model: model || 'claude-sonnet-4-6',
        cwd: process.cwd(),
        maxTurns: 1,
        allowedTools: [],
      });

      const { definition, warnings, changes } = parseGeneratedAutomation(result.text);

      res.json({
        success: true,
        definition,
        warnings,
        changes,
      });
    } catch (error) {
      logger.error('Failed to refine automation:', error);
      const message = error instanceof Error ? error.message : 'Failed to refine automation';
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
