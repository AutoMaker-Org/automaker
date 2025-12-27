/**
 * Z.ai Provider - Executes queries using Z.ai GLM models
 *
 * Integrates with Z.ai's OpenAI-compatible API to support GLM models
 * with tool calling capabilities. GLM-4.6v is the only model that supports vision.
 */

import { secureFs } from '@automaker/platform';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { BaseProvider } from './base-provider.js';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ContentBlock,
} from './types.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('ZaiProvider');

const execAsync = promisify(exec);

/**
 * Z.ai API configuration
 */
const ZAI_API_BASE = 'https://api.z.ai/api/coding/paas/v4';
const ZAI_MODEL = 'glm-4.7';

/**
 * Tool definitions for Z.ai function calling
 * Maps AutoMaker tools to Z.ai function format
 */
const ZAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file to read',
          },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Write content to a file, creating directories if needed',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file to write',
          },
          content: {
            type: 'string',
            description: 'Content to write to the file',
          },
        },
        required: ['filePath', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing old_string with new_string',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file to edit',
          },
          oldString: {
            type: 'string',
            description: 'String to replace',
          },
          newString: {
            type: 'string',
            description: 'Replacement string',
          },
        },
        required: ['filePath', 'oldString', 'newString'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'glob_search',
      description: 'Search for files matching a glob pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern (e.g., "**/*.ts")',
          },
          cwd: {
            type: 'string',
            description: 'Current working directory (defaults to project root if not provided)',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'grep_search',
      description: 'Search for content in files using regex pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Regex pattern to search for',
          },
          searchPath: {
            type: 'string',
            description: 'Path to search in (defaults to project root if not provided)',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'execute_command',
      description: 'Execute a shell command (use with caution)',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Command to execute',
          },
          cwd: {
            type: 'string',
            description:
              'Working directory for command execution (defaults to project root if not provided)',
          },
        },
        required: ['command'],
      },
    },
  },
];

/**
 * Simple glob implementation using shell
 */
async function glob(pattern: string, cwd: string): Promise<string[]> {
  try {
    // Use command string directly with shell
    const cmd = `cd "${cwd}" && ls -d ${pattern} 2>/dev/null || echo ""`;
    const { stdout } = await execAsync(cmd, {
      maxBuffer: 10 * 1024 * 1024,
    });
    const results = stdout.trim().split('\n').filter(Boolean);
    return results;
  } catch {
    return [];
  }
}

/**
 * Simple grep implementation using shell
 */
async function grep(
  pattern: string,
  searchPath: string
): Promise<Array<{ path: string; line: number; text: string }>> {
  try {
    const cmd = `grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.json" --include="*.md" "${pattern}" "${searchPath}" 2>/dev/null || echo ""`;
    const { stdout } = await execAsync(cmd, {
      maxBuffer: 10 * 1024 * 1024,
    });
    const results: Array<{ path: string; line: number; text: string }> = [];
    for (const line of stdout.trim().split('\n')) {
      if (!line) continue;
      const match = line.match(/^([^:]+):(\d+):(.+)$/);
      if (match) {
        results.push({
          path: match[1],
          line: parseInt(match[2], 10),
          text: match[3].trim(),
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Safely resolve a file path relative to baseCwd
 * For read operations, allows paths outside baseCwd (for context)
 * For write operations, restricts to within baseCwd (for security)
 */
function safeResolvePath(baseCwd: string, filePath: string, allowOutside: boolean = false): string {
  // Remove leading slash if present (indicates absolute path on Unix)
  // On Windows, this prevents paths like /home/workspace from becoming C:\home\workspace
  let normalizedPath = filePath.replace(/^\/+/, '');

  // If path starts with ./ or ../, resolve relative to baseCwd
  // If path is absolute (after removing leading slashes), still treat as relative
  const absolutePath = path.resolve(baseCwd, normalizedPath);

  // Security check: only enforce if allowOutside is false
  if (!allowOutside) {
    const relativePath = path.relative(baseCwd, absolutePath);
    if (relativePath.startsWith('..')) {
      throw new Error(`Access denied: path "${filePath}" is outside working directory`);
    }
  }

  return absolutePath;
}

/**
 * Tool execution handlers
 */
async function executeToolCall(
  toolName: string,
  toolArgs: Record<string, unknown>,
  baseCwd: string
): Promise<string> {
  switch (toolName) {
    case 'read_file': {
      const filePath = toolArgs.filePath as string;
      // Allow reading files outside worktree for context
      const absolutePath = safeResolvePath(baseCwd, filePath, true);
      const content = (await secureFs.readFile(absolutePath, 'utf-8')) as string;
      return content;
    }

    case 'write_file': {
      const filePath = toolArgs.filePath as string;
      const content = toolArgs.content as string;
      // Writes must be within worktree (security)
      const absolutePath = safeResolvePath(baseCwd, filePath, false);
      // Ensure parent directory exists
      const dir = path.dirname(absolutePath);
      await secureFs.mkdir(dir, { recursive: true });
      await secureFs.writeFile(absolutePath, content, 'utf-8');
      return `Successfully wrote to ${filePath}`;
    }

    case 'edit_file': {
      const filePath = toolArgs.filePath as string;
      const oldString = toolArgs.oldString as string;
      const newString = toolArgs.newString as string;
      // Edits must be within worktree (security)
      const absolutePath = safeResolvePath(baseCwd, filePath, false);
      const content = (await secureFs.readFile(absolutePath, 'utf-8')) as string;
      const newContent = content.replace(oldString, newString);
      if (newContent === content) {
        throw new Error(`Old string not found in ${filePath}`);
      }
      await secureFs.writeFile(absolutePath, newContent, 'utf-8');
      return `Successfully edited ${filePath}`;
    }

    case 'glob_search': {
      const pattern = toolArgs.pattern as string;
      const searchCwd = (toolArgs.cwd as string) || baseCwd;
      // Allow searching outside worktree for context
      const safeSearchCwd = safeResolvePath(baseCwd, searchCwd, true);
      const results = await glob(pattern, safeSearchCwd);
      return results.join('\n');
    }

    case 'grep_search': {
      const pattern = toolArgs.pattern as string;
      const searchPath = (toolArgs.searchPath as string) || baseCwd;
      // Allow searching outside worktree for context
      const safeSearchPath = safeResolvePath(baseCwd, searchPath, true);
      const results = await grep(pattern, safeSearchPath);
      return results.map((r) => `${r.path}:${r.line}:${r.text}`).join('\n');
    }

    case 'execute_command': {
      const command = toolArgs.command as string;
      const commandCwd = (toolArgs.cwd as string) || baseCwd;
      // For commands, allow the cwd to be anywhere (not restricted to baseCwd)
      // The model might need to run commands in the project directory or other locations
      // Only normalize Unix-style absolute paths
      let normalizedCwd = commandCwd.replace(/^\/+/, '');
      const resolvedCwd = path.isAbsolute(commandCwd)
        ? commandCwd
        : path.resolve(baseCwd, normalizedCwd);
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: resolvedCwd,
          maxBuffer: 10 * 1024 * 1024, // 10MB
          env: { ...process.env },
        });
        return stdout || stderr;
      } catch (error) {
        return `Command failed: ${(error as Error).message}`;
      }
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

export class ZaiProvider extends BaseProvider {
  private apiKey: string | null = null;

  constructor(config?: { apiKey?: string }) {
    super(config);
    // Try to get API key from config first, then environment
    this.apiKey = config?.apiKey || process.env.ZAI_API_KEY || null;
  }

  getName(): string {
    return 'zai';
  }

  /**
   * Get API key from credentials
   */
  private getApiKey(): string {
    if (this.apiKey) {
      return this.apiKey;
    }
    // Will be set via setConfig from SettingsService
    if (this.config.apiKey) {
      return this.config.apiKey;
    }
    throw new Error('ZAI_API_KEY not configured');
  }

  /**
   * Execute a query using Z.ai API with tool calling support
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const {
      prompt,
      model = ZAI_MODEL,
      cwd,
      systemPrompt,
      maxTurns = 20,
      allowedTools,
      abortController,
      conversationHistory = [],
      sdkSessionId,
      outputFormat,
    } = options;

    const apiKey = this.getApiKey();

    // Handle images for non-vision models
    // If a Zai model that doesn't support vision is selected with images,
    // use GLM-4.6v to describe the images and prepend the description to the prompt
    let finalPrompt: string | Array<{ type: string; text?: string; source?: object }> = prompt;
    const finalModel = model;

    if (!this.modelSupportsVision(model)) {
      // Check if prompt contains images
      const hasImages =
        typeof prompt === 'object' &&
        Array.isArray(prompt) &&
        prompt.some((block) => block.type === 'image' || block.source);

      if (hasImages) {
        logger.info(`Model ${model} doesn't support vision, using GLM-4.6v to describe images`);

        try {
          // Filter images - handle both ContentBlock format and ImageAttachment format
          const images = (Array.isArray(prompt) ? prompt : []).filter((block) => {
            if (typeof block !== 'object' || block === null) return false;
            // Handle ContentBlock format { type: 'image', source: {...} }
            if ('type' in block && block.type === 'image') return true;
            if ('source' in block && block.source) return true;
            // Handle ImageAttachment format { data: string, mimeType: string }
            if ('data' in block && 'mimeType' in block) return true;
            return false;
          });
          const textContent = (Array.isArray(prompt) ? prompt : []).filter((block) => {
            if (typeof block !== 'object' || block === null) return false;
            // ContentBlock format - exclude images
            if ('type' in block && block.type === 'image') return false;
            if ('source' in block && block.source) return false;
            // ImageAttachment format - exclude images
            if ('data' in block && 'mimeType' in block) return false;
            return true;
          });
          const textOnly = textContent.map((block) => block.text || '').join('\n');

          // Describe images using GLM-4.6v
          const imageDescription = await this.describeImages(images, textOnly);

          // Combine text with image description
          finalPrompt = textOnly + (imageDescription ? '\n\n' + imageDescription : '');
        } catch (error) {
          logger.warn(`Image description failed: ${(error as Error).message}`);
          // Fall back to text-only content
          finalPrompt = (prompt as Array<{ type: string; text?: string }>)
            .map((block) => block.text || '')
            .join('\n');
        }
      }
    }

    // Build messages array
    // Zai supports reasoning_content for preserved thinking mode
    const messages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
      reasoning_content?: string; // Zai thinking mode - preserved across turns
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
      tool_call_id?: string;
    }> = [];

    // Add system prompt
    if (systemPrompt) {
      if (typeof systemPrompt === 'string') {
        messages.push({ role: 'system', content: systemPrompt });
      } else if (systemPrompt.type === 'preset' && systemPrompt.preset === 'claude_code') {
        messages.push({
          role: 'system',
          content:
            'You are an AI programming assistant. You help users write code, debug issues, and build software. Use the available tools to read and edit files, search code, and execute commands.\n\n' +
            'IMPORTANT: Always use RELATIVE paths (e.g., "src/index.ts", "./config.json") for file operations. ' +
            'NEVER use absolute paths like "/home/user/file" or "C:\\Users\\file". ' +
            'All paths are relative to the current working directory.',
        });
      }
    }

    // Add base working directory info to system prompt for clarity
    if (cwd) {
      const dirInfo = `\n\nCurrent working directory: ${cwd}`;
      if (messages.length > 0 && messages[0].role === 'system') {
        const existingContent = messages[0].content;
        messages[0].content = Array.isArray(existingContent)
          ? existingContent
          : typeof existingContent === 'string'
            ? existingContent + dirInfo
            : dirInfo;
      } else {
        messages.unshift({ role: 'system', content: dirInfo.slice(2) });
      }
    }

    // When structured output is requested, add JSON output instruction
    // Z.ai requires this when using response_format: { type: 'json_object' }
    if (outputFormat) {
      const jsonInstruction =
        'You must respond with valid JSON only. Do not include any explanatory text outside the JSON structure.';
      if (messages.length > 0 && messages[0].role === 'system') {
        // Append to existing system prompt
        const existingContent = messages[0].content;
        messages[0].content = Array.isArray(existingContent)
          ? existingContent
          : typeof existingContent === 'string'
            ? `${existingContent}\n\n${jsonInstruction}`
            : jsonInstruction;
      } else {
        // Prepend new system prompt
        messages.unshift({ role: 'system', content: jsonInstruction });
      }
    }

    // Add conversation history
    for (const msg of conversationHistory) {
      if (msg.role === 'user') {
        messages.push({
          role: 'user',
          content: this.formatContent(msg.content, cwd, model),
        });
      } else if (msg.role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: this.formatContent(msg.content, '', model),
        });
      }
    }

    // Add current prompt
    messages.push({
      role: 'user',
      content: this.formatContent(finalPrompt, cwd, finalModel),
    });

    // Filter tools based on allowedTools
    const toolsToUse = allowedTools
      ? ZAI_TOOLS.filter((tool) => {
          const toolName = tool.function.name;
          // Map tool names to allowed tools
          const toolMap: Record<string, string> = {
            read_file: 'Read',
            write_file: 'Write',
            edit_file: 'Edit',
            glob_search: 'Glob',
            grep_search: 'Grep',
            execute_command: 'Bash',
          };
          return allowedTools.includes(toolMap[toolName] || toolName);
        })
      : ZAI_TOOLS;

    // Tool execution loop
    let turnCount = 0;
    // Use sdkSessionId if provided, otherwise generate a new one
    let sessionId = sdkSessionId || this.generateSessionId();

    while (turnCount < maxTurns) {
      if (abortController?.signal.aborted) {
        yield {
          type: 'error',
          error: 'Request aborted by user',
        };
        return;
      }

      turnCount++;

      try {
        // Call Z.ai API
        const response = await fetch(`${ZAI_API_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            tools: toolsToUse.length > 0 ? toolsToUse : undefined,
            tool_choice: toolsToUse.length > 0 ? 'auto' : undefined,
            stream: false,
            temperature: 0.7,
            // Z.ai thinking mode support (GLM-4.7)
            // Default to enabled thinking for GLM-4.7 if not explicitly disabled
            thinking: options.thinking || { type: 'enabled', clear_thinking: false },
            // Z.ai structured output support
            ...(outputFormat && { response_format: { type: 'json_object' } }),
          }),
          signal: abortController?.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Z.ai API error: ${response.status} - ${errorText}`);
        }

        const data = (await response.json()) as {
          choices: Array<{
            message: {
              role: string;
              content?: string;
              reasoning_content?: string; // Zai thinking mode output
              tool_calls?: Array<{
                id: string;
                type: string;
                function: { name: string; arguments: string };
              }>;
            };
            finish_reason: string;
          }>;
        };

        const choice = data.choices[0];
        const message = choice.message;

        // Add assistant message to history
        // Include reasoning_content for preserved thinking (required by Zai)
        messages.push({
          role: 'assistant',
          content: message.content,
          reasoning_content: message.reasoning_content,
          tool_calls: message.tool_calls,
        });

        // Yield reasoning content first (thinking mode)
        if (message.reasoning_content) {
          yield {
            type: 'assistant',
            session_id: sessionId,
            message: {
              role: 'assistant',
              content: [{ type: 'reasoning', reasoning_content: message.reasoning_content }],
            },
          };
        }

        // Yield text content
        if (message.content) {
          yield {
            type: 'assistant',
            session_id: sessionId,
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: message.content }],
            },
          };
        }

        // Handle tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
          for (const toolCall of message.tool_calls) {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);

            // Yield tool_use message
            yield {
              type: 'assistant',
              session_id: sessionId,
              message: {
                role: 'assistant',
                content: [
                  {
                    type: 'tool_use',
                    name: toolName,
                    input: toolArgs,
                  },
                ],
              },
            };

            // Execute tool
            try {
              const toolResult = await executeToolCall(toolName, toolArgs, cwd);

              // Add tool result to messages
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: toolResult,
              });

              // Yield tool result
              yield {
                type: 'result',
                parent_tool_use_id: toolCall.id,
                result: toolResult,
              };
            } catch (toolError) {
              const errorMsg = `Tool ${toolName} failed: ${(toolError as Error).message}`;
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: errorMsg,
              });
              yield {
                type: 'error',
                error: errorMsg,
              };
            }
          }

          // Continue loop for another response after tool execution
          continue;
        }

        // If no tool calls or finish_reason is 'stop', we're done
        if (choice.finish_reason === 'stop' || !message.tool_calls) {
          yield {
            type: 'result',
            result: 'Conversation completed',
          };
          break;
        }
      } catch (error) {
        const errorMsg = (error as Error).message;
        yield {
          type: 'error',
          error: errorMsg,
        };
        throw error;
      }
    }
  }

  /**
   * Format content for API (handle images if present)
   * For GLM-4.6v: formats images for multimodal content
   * For non-vision models: filters to text (should already be handled by image description)
   */
  private formatContent(
    content: string | Array<{ type: string; text?: string; source?: object }>,
    basePath = '',
    model = ''
  ): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
    if (typeof content === 'string') {
      return content;
    }

    // Check if any content block is an image
    const hasImage = content.some((block) => block.type === 'image' || block.source);

    if (!hasImage) {
      return content.map((block) => block.text || '').join('\n');
    }

    // Check if model supports vision (only GLM-4.6v supports vision)
    const supportsVision = this.modelSupportsVision(model);

    // For non-vision models, filter to text-only (fallback safety)
    if (!supportsVision) {
      return content.map((block) => block.text || '').join('\n');
    }

    // Format for multimodal content (GLM-4.6v supports vision)
    return content.map((block) => {
      if (block.type === 'image' && block.source) {
        // Handle image - if it's a file path, convert to data URL
        const source = block.source as { type?: string; media_type?: string; data?: string };
        if (source.type === 'base64') {
          return {
            type: 'image_url',
            image_url: {
              url: `data:${source.media_type || 'image/png'};base64,${source.data}`,
            },
          };
        }
      }
      return { type: 'text', text: block.text || '' };
    }) as Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }

  /**
   * Generate a session ID for conversation tracking
   */
  private generateSessionId(): string {
    return `zai_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Check if the given model supports vision
   * Only GLM-4.6v supports vision among Zai models
   */
  private modelSupportsVision(model: string): boolean {
    return model === 'glm-4.6v';
  }

  /**
   * Describe images using GLM-4.6v (the only vision-capable Zai model)
   * Returns a text description of the images
   */
  private async describeImages(
    images: Array<{ type: string; source?: object }>,
    originalPrompt: string
  ): Promise<string> {
    const apiKey = this.getApiKey();

    // Build image-only content for GLM-4.6v
    const imageContent = images
      .map((img) => {
        if (img.type === 'image' && img.source) {
          const source = img.source as { type?: string; media_type?: string; data?: string };
          if (source.type === 'base64') {
            return {
              type: 'image_url',
              image_url: {
                url: `data:${source.media_type || 'image/png'};base64,${source.data}`,
              },
            };
          }
        }
        return null;
      })
      .filter(Boolean);

    const promptForVision = `Please describe these images in the context of: "${originalPrompt.substring(0, 200)}...". Provide a concise description that would help someone understand the visual content.`;

    try {
      const response = await fetch(`${ZAI_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'glm-4.6v',
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: promptForVision }, ...imageContent],
            },
          ],
          stream: false,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        logger.warn('Failed to describe images, continuing without descriptions');
        return '';
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const description = data.choices?.[0]?.message?.content || '';
      return `[Image Context: ${description}]`;
    } catch (error) {
      logger.warn(`Image description failed: ${(error as Error).message}`);
      return '';
    }
  }

  /**
   * Detect if Z.ai API key is configured
   */
  async detectInstallation(): Promise<InstallationStatus> {
    try {
      const apiKey = this.getApiKey();
      const hasKey = !!apiKey && apiKey.length > 0;

      if (!hasKey) {
        return {
          installed: true,
          method: 'sdk',
          hasApiKey: false,
          authenticated: false,
          error: 'ZAI_API_KEY not configured',
        };
      }

      // Try a simple API call to verify the key works
      try {
        const response = await fetch(`${ZAI_API_BASE}/models`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (response.ok) {
          return {
            installed: true,
            method: 'sdk',
            hasApiKey: true,
            authenticated: true,
          };
        } else {
          return {
            installed: true,
            method: 'sdk',
            hasApiKey: true,
            authenticated: false,
            error: `API key validation failed: ${response.status}`,
          };
        }
      } catch {
        // Network error - consider as installed but unverified
        return {
          installed: true,
          method: 'sdk',
          hasApiKey: true,
          authenticated: true, // Assume valid if network fails
        };
      }
    } catch (error) {
      return {
        installed: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get available GLM models
   */
  getAvailableModels(): ModelDefinition[] {
    return [
      {
        id: 'glm-4.7',
        name: 'GLM-4.7',
        modelString: 'glm-4.7',
        provider: 'zai',
        description: 'Z.ai flagship model with strong reasoning capabilities and thinking mode',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsExtendedThinking: true, // All GLM models support thinking mode
        tier: 'premium',
        default: true,
      },
      {
        id: 'glm-4.6v',
        name: 'GLM-4.6v',
        modelString: 'glm-4.6v',
        provider: 'zai',
        description: 'Multimodal model with vision support and thinking mode',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsExtendedThinking: true, // All GLM models support thinking mode
        tier: 'vision',
        default: false,
      },
      {
        id: 'glm-4.6',
        name: 'GLM-4.6',
        modelString: 'glm-4.6',
        provider: 'zai',
        description: 'Balanced performance with strong reasoning and thinking mode',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsExtendedThinking: true, // All GLM models support thinking mode
        tier: 'standard',
        default: false,
      },
      {
        id: 'glm-4.5-air',
        name: 'GLM-4.5-Air',
        modelString: 'glm-4.5-air',
        provider: 'zai',
        description: 'Fast and efficient for simple tasks with thinking mode',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsTools: true,
        supportsExtendedThinking: true, // All GLM models support thinking mode
        tier: 'basic',
        default: false,
      },
    ];
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    // Zai supports: tools, text, vision (via glm-4.6v), extended thinking (via glm-4.7)
    // Zai does NOT support: mcp, browser (these are application-layer features)
    const supportedFeatures = ['tools', 'text', 'vision', 'extendedThinking'];
    return supportedFeatures.includes(feature);
  }

  /**
   * Validate the provider configuration
   */
  validateConfig(): { valid: boolean; errors: string[]; warnings?: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.getApiKey();
    } catch {
      errors.push('ZAI_API_KEY is not configured');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
