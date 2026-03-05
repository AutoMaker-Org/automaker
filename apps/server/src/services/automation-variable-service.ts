/**
 * Automation Variable Service - Manages variables across all scopes
 *
 * This service provides a unified interface for working with automation variables
 * across three scopes:
 * - System: Read-only variables provided by automaker (runtime info, paths, etc.)
 * - Project: User-defined variables stored per-project in .automaker/settings.json
 * - Workflow: Variables defined within an automation definition
 *
 * Variables are resolved using template syntax (e.g., {{project.variableName}})
 */

import os from 'os';
import path from 'path';
import { createLogger } from '@automaker/utils';
import { getAutomakerDir, getProjectAutomationVariablesPath } from '@automaker/platform';
import * as secureFs from '../lib/secure-fs.js';
import type {
  AutomationVariableValue,
  VariableDescriptor,
  VariableBrowserGroup,
  ListVariablesOptions,
  ListVariablesResult,
  ProjectVariable,
  SetProjectVariableRequest,
  WorkflowVariableDefinition,
} from '@automaker/types';

const logger = createLogger('AutomationVariableService');

// Package version - will be replaced by build process if available
const PACKAGE_VERSION = process.env.npm_package_version || '0.0.0';

/**
 * Curated allowlist of safe environment variable names exposed via the `env` system variable.
 * Exposing process.env directly risks leaking API keys, credentials, and other secrets.
 */
const SAFE_ENV_KEYS = [
  'PATH',
  'HOME',
  'SHELL',
  'USER',
  'LOGNAME',
  'LANG',
  'TERM',
  'TMPDIR',
] as const;

/**
 * System variable definitions with their providers
 */
const SYSTEM_VARIABLE_DEFINITIONS: Array<{
  name: string;
  description: string;
  example?: string;
  typeHint?: VariableDescriptor['typeHint'];
  provider: (projectPath?: string) => AutomationVariableValue | Promise<AutomationVariableValue>;
}> = [
  {
    name: 'now',
    description: 'Current timestamp in ISO 8601 format',
    example: '2024-01-15T10:30:00.000Z',
    typeHint: 'string',
    provider: () => new Date().toISOString(),
  },
  {
    name: 'today',
    description: 'Current date in YYYY-MM-DD format',
    example: '2024-01-15',
    typeHint: 'string',
    provider: () => new Date().toISOString().split('T')[0],
  },
  {
    name: 'year',
    description: 'Current year (4 digits)',
    example: '2024',
    typeHint: 'number',
    provider: () => new Date().getFullYear(),
  },
  {
    name: 'month',
    description: 'Current month (1-12)',
    example: '1',
    typeHint: 'number',
    provider: () => new Date().getMonth() + 1,
  },
  {
    name: 'day',
    description: 'Current day of month (1-31)',
    example: '15',
    typeHint: 'number',
    provider: () => new Date().getDate(),
  },
  {
    name: 'weekday',
    description: 'Current day of week (0-6, 0 = Sunday)',
    example: '1',
    typeHint: 'number',
    provider: () => new Date().getDay(),
  },
  {
    name: 'hour',
    description: 'Current hour (0-23)',
    example: '10',
    typeHint: 'number',
    provider: () => new Date().getHours(),
  },
  {
    name: 'minute',
    description: 'Current minute (0-59)',
    example: '30',
    typeHint: 'number',
    provider: () => new Date().getMinutes(),
  },
  {
    name: 'timestamp',
    description: 'Unix timestamp in milliseconds',
    example: '1705315800000',
    typeHint: 'number',
    provider: () => Date.now(),
  },
  {
    name: 'platform',
    description: 'Operating system platform',
    example: 'darwin',
    typeHint: 'string',
    provider: () => process.platform,
  },
  {
    name: 'arch',
    description: 'CPU architecture',
    example: 'arm64',
    typeHint: 'string',
    provider: () => process.arch,
  },
  {
    name: 'hostname',
    description: 'Machine hostname',
    example: 'MacBook-Pro',
    typeHint: 'string',
    provider: () => os.hostname(),
  },
  {
    name: 'username',
    description: 'Current system username',
    example: 'developer',
    typeHint: 'string',
    provider: () => os.userInfo().username,
  },
  {
    name: 'homedir',
    description: 'User home directory path',
    example: '/Users/developer',
    typeHint: 'string',
    provider: () => os.homedir(),
  },
  {
    name: 'tmpdir',
    description: 'System temporary directory path',
    example: '/var/folders/...',
    typeHint: 'string',
    provider: () => os.tmpdir(),
  },
  {
    name: 'pid',
    description: 'Current process ID',
    example: '12345',
    typeHint: 'number',
    provider: () => process.pid,
  },
  {
    name: 'nodeVersion',
    description: 'Node.js version',
    example: 'v20.10.0',
    typeHint: 'string',
    provider: () => process.version,
  },
  {
    name: 'automakerVersion',
    description: 'Automaker server version',
    example: '0.11.0',
    typeHint: 'string',
    provider: () => PACKAGE_VERSION,
  },
  {
    name: 'projectPath',
    description: 'Absolute path to the current project directory',
    example: '/Users/developer/projects/my-app',
    typeHint: 'string',
    provider: (projectPath) => projectPath || null,
  },
  {
    name: 'projectName',
    description: 'Name of the current project (directory name)',
    example: 'my-app',
    typeHint: 'string',
    provider: (projectPath) => (projectPath ? path.basename(projectPath) : null),
  },
  {
    name: 'automakerDir',
    description: 'Path to the .automaker directory for the current project',
    example: '/Users/developer/projects/my-app/.automaker',
    typeHint: 'string',
    provider: (projectPath) => (projectPath ? getAutomakerDir(projectPath) : null),
  },
  {
    name: 'env',
    description:
      'Object containing safe, non-sensitive environment variables (PATH, HOME, SHELL, USER, LANG, TERM)',
    example: '{"PATH": "/usr/bin", "HOME": "/Users/dev"}',
    typeHint: 'object',
    provider: () => {
      const safe: Record<string, string> = {};
      for (const key of SAFE_ENV_KEYS) {
        const val = process.env[key];
        if (val !== undefined) safe[key] = val;
      }
      return safe;
    },
  },
];

/**
 * Automation Variable Service
 *
 * Provides methods for:
 * - Listing available variables across all scopes
 * - Getting system variable values
 * - Managing project-level variables (CRUD operations)
 * - Building variable contexts for automation execution
 */
export class AutomationVariableService {
  private projectVariablesCache = new Map<string, ProjectVariable[]>();

  /**
   * Get all system variable values for the given project context
   */
  async getSystemVariables(projectPath?: string): Promise<Record<string, AutomationVariableValue>> {
    const result: Record<string, AutomationVariableValue> = {};

    for (const def of SYSTEM_VARIABLE_DEFINITIONS) {
      try {
        const value = await def.provider(projectPath);
        result[def.name] = value;
      } catch (error) {
        logger.warn(`Failed to get system variable ${def.name}:`, error);
        result[def.name] = null;
      }
    }

    return result;
  }

  /**
   * Get system variable descriptors (metadata only, no values)
   */
  getSystemVariableDescriptors(): VariableDescriptor[] {
    return SYSTEM_VARIABLE_DEFINITIONS.map((def) => ({
      name: def.name,
      scope: 'system' as const,
      description: def.description,
      example: def.example,
      readOnly: true,
      typeHint: def.typeHint,
    }));
  }

  /**
   * Load project variables from storage
   */
  async loadProjectVariables(projectPath: string): Promise<ProjectVariable[]> {
    const cached = this.projectVariablesCache.get(projectPath);
    if (cached) {
      return cached;
    }

    try {
      const filePath = getProjectAutomationVariablesPath(projectPath);
      const content = await secureFs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content as string) as {
        version: number;
        variables: ProjectVariable[];
      };

      if (data.version === 1 && Array.isArray(data.variables)) {
        this.projectVariablesCache.set(projectPath, data.variables);
        return data.variables;
      }

      logger.warn(`Invalid project variables file format: ${filePath}`);
      return [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      logger.error(`Failed to load project variables for ${projectPath}:`, error);
      return [];
    }
  }

  /**
   * Save project variables to storage
   */
  async saveProjectVariables(projectPath: string, variables: ProjectVariable[]): Promise<void> {
    const filePath = getProjectAutomationVariablesPath(projectPath);
    const automakerDir = getAutomakerDir(projectPath);

    await secureFs.mkdir(automakerDir, { recursive: true });

    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      variables,
    };

    await secureFs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    this.projectVariablesCache.set(projectPath, variables);
  }

  /**
   * Get project variables as a simple key-value record
   */
  async getProjectVariables(projectPath: string): Promise<Record<string, AutomationVariableValue>> {
    const variables = await this.loadProjectVariables(projectPath);
    const result: Record<string, AutomationVariableValue> = {};

    for (const variable of variables) {
      result[variable.name] = variable.value;
    }

    return result;
  }

  /**
   * Get project variable descriptors (metadata only)
   */
  async getProjectVariableDescriptors(projectPath: string): Promise<VariableDescriptor[]> {
    const variables = await this.loadProjectVariables(projectPath);

    return variables.map((v) => ({
      name: v.name,
      scope: 'project' as const,
      description: v.description || 'Project variable',
      readOnly: false,
      typeHint: this.inferTypeHint(v.value),
    }));
  }

  /**
   * Set a project variable
   */
  async setProjectVariable(
    projectPath: string,
    request: SetProjectVariableRequest
  ): Promise<ProjectVariable> {
    const variables = await this.loadProjectVariables(projectPath);
    const now = new Date().toISOString();
    const existingIndex = variables.findIndex((v) => v.name === request.name);

    let variable: ProjectVariable;

    if (existingIndex >= 0) {
      // Update existing variable
      variable = {
        name: request.name,
        value: request.value,
        description: request.description ?? variables[existingIndex].description,
        createdAt: variables[existingIndex].createdAt,
        updatedAt: now,
      };
      variables[existingIndex] = variable;
    } else {
      // Create new variable
      variable = {
        name: request.name,
        value: request.value,
        description: request.description,
        createdAt: now,
        updatedAt: now,
      };
      variables.push(variable);
    }

    await this.saveProjectVariables(projectPath, variables);
    return variable;
  }

  /**
   * Delete a project variable
   */
  async deleteProjectVariable(projectPath: string, name: string): Promise<boolean> {
    const variables = await this.loadProjectVariables(projectPath);
    const index = variables.findIndex((v) => v.name === name);

    if (index < 0) {
      return false;
    }

    variables.splice(index, 1);
    await this.saveProjectVariables(projectPath, variables);
    return true;
  }

  /**
   * Get workflow variable descriptors from an automation definition
   */
  getWorkflowVariableDescriptors(
    workflowVariables?: WorkflowVariableDefinition[]
  ): VariableDescriptor[] {
    if (!workflowVariables || workflowVariables.length === 0) {
      return [];
    }

    return workflowVariables.map((v) => ({
      name: v.name,
      scope: 'workflow' as const,
      description: v.description || 'Workflow variable',
      readOnly: false,
      typeHint: this.inferTypeHint(v.defaultValue),
      example: v.defaultValue !== undefined ? JSON.stringify(v.defaultValue) : undefined,
    }));
  }

  /**
   * Get step output variable descriptors
   */
  getStepOutputDescriptors(
    steps?: Array<{ stepId: string; stepName?: string }>
  ): VariableDescriptor[] {
    if (!steps || steps.length === 0) {
      return [];
    }

    return steps.map((step) => ({
      name: `${step.stepId}.output`,
      scope: 'steps' as const,
      description: step.stepName
        ? `Output from step "${step.stepName}"`
        : `Output from step ${step.stepId}`,
      readOnly: true,
      typeHint: 'string' as const,
      example: `{{steps.${step.stepId}.output}}`,
    }));
  }

  /**
   * List all available variables for the variable browser
   */
  async listAvailableVariables(options: ListVariablesOptions): Promise<ListVariablesResult> {
    const groups: VariableBrowserGroup[] = [];
    let total = 0;

    // System variables
    if (options.includeSystem !== false) {
      const systemVars = this.getSystemVariableDescriptors();
      groups.push({
        name: 'system',
        label: 'System Variables',
        variables: systemVars,
      });
      total += systemVars.length;
    }

    // Project variables
    if (options.includeProject !== false && options.projectPath) {
      const projectVars = await this.getProjectVariableDescriptors(options.projectPath);
      groups.push({
        name: 'project',
        label: 'Project Variables',
        variables: projectVars,
      });
      total += projectVars.length;
    }

    // Workflow variables
    if (options.workflowVariables && options.workflowVariables.length > 0) {
      const workflowVars = this.getWorkflowVariableDescriptors(options.workflowVariables);
      groups.push({
        name: 'workflow',
        label: 'Workflow Variables',
        variables: workflowVars,
      });
      total += workflowVars.length;
    }

    // Step outputs
    if (options.stepOutputs && options.stepOutputs.length > 0) {
      const stepVars = this.getStepOutputDescriptors(options.stepOutputs);
      groups.push({
        name: 'steps',
        label: 'Step Outputs',
        variables: stepVars,
      });
      total += stepVars.length;
    }

    return { groups, total };
  }

  /**
   * Clear the project variables cache
   */
  clearCache(projectPath?: string): void {
    if (projectPath) {
      this.projectVariablesCache.delete(projectPath);
    } else {
      this.projectVariablesCache.clear();
    }
  }

  /**
   * Infer type hint from a value
   */
  private inferTypeHint(value: unknown): VariableDescriptor['typeHint'] {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    switch (typeof value) {
      case 'string':
        return 'string';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'object':
        return 'object';
      default:
        return undefined;
    }
  }
}

// Singleton instance for convenience
let instance: AutomationVariableService | null = null;

export function getAutomationVariableService(): AutomationVariableService {
  if (!instance) {
    instance = new AutomationVariableService();
  }
  return instance;
}
