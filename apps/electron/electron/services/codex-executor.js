/**
 * Codex CLI Execution Wrapper
 *
 * This module handles spawning and managing Codex CLI processes
 * for executing OpenAI model queries.
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const readline = require('readline');
const path = require('path');
const CodexCliDetector = require('./codex-cli-detector');
const codexConfigManager = require('./codex-config-manager');

/**
 * Message types from Codex CLI JSON output
 */
const CODEX_EVENT_TYPES = {
  THREAD_STARTED: 'thread.started',
  ITEM_STARTED: 'item.started',
  ITEM_COMPLETED: 'item.completed',
  THREAD_COMPLETED: 'thread.completed',
  ERROR: 'error'
};

/**
 * Codex Executor - Manages Codex CLI process execution
 */
class CodexExecutor extends EventEmitter {
  constructor() {
    super();
    this.currentProcess = null;
    this.codexPath = null;
  }

  /**
   * Find and cache the Codex CLI path
   * @returns {string|null} Path to codex executable
   */
  findCodexPath() {
    if (this.codexPath) {
      return this.codexPath;
    }

    const installation = CodexCliDetector.detectCodexInstallation();
    if (installation.installed && installation.path) {
      this.codexPath = installation.path;
      return this.codexPath;
    }

    return null;
  }

  /**
   * Execute a Codex CLI query
   * @param {Object} options Execution options
   * @param {string} options.prompt The prompt to execute
   * @param {string} options.model Model to use (default: gpt-5.1-codex-max)
   * @param {string} options.cwd Working directory
   * @param {string} options.systemPrompt System prompt (optional, will be prepended to prompt)
   * @param {number} options.maxTurns Not used - Codex CLI doesn't support this parameter
   * @param {string[]} options.allowedTools Not used - Codex CLI doesn't support this parameter
   * @param {Object} options.env Environment variables
   * @param {Object} options.mcpServers MCP servers configuration (for configuring Codex TOML)
   * @returns {AsyncGenerator} Generator yielding messages
   */
  async *execute(options) {
    const {
      prompt,
      model = 'gpt-5.1-codex-max',
      cwd = process.cwd(),
      systemPrompt,
      maxTurns, // Not used by Codex CLI
      allowedTools, // Not used by Codex CLI
      env = {},
      mcpServers = null
    } = options;

    const codexPath = this.findCodexPath();
    if (!codexPath) {
      yield {
        type: 'error',
        error: 'Codex CLI not found. Please install it with: npm install -g @openai/codex@latest'
      };
      return;
    }

    // Configure MCP server if provided
    if (mcpServers && mcpServers['automaker-tools']) {
      try {
        // Get the absolute path to the MCP server script
        const mcpServerScriptPath = path.resolve(__dirname, 'mcp-server-stdio.js');
        
        // Verify the script exists
        const fs = require('fs');
        if (!fs.existsSync(mcpServerScriptPath)) {
          console.warn(`[CodexExecutor] MCP server script not found at ${mcpServerScriptPath}, skipping MCP configuration`);
        } else {
          // Configure Codex TOML to use the MCP server
          await codexConfigManager.configureMcpServer(cwd, mcpServerScriptPath);
          console.log('[CodexExecutor] Configured automaker-tools MCP server for Codex CLI');
        }
      } catch (error) {
        console.error('[CodexExecutor] Failed to configure MCP server:', error);
        // Continue execution even if MCP config fails - Codex will work without MCP tools
      }
    }

    // Combine system prompt with main prompt if provided
    // Codex CLI doesn't support --system-prompt argument, so we prepend it to the prompt
    let combinedPrompt = prompt;
    console.log('[CodexExecutor] Original prompt length:', prompt?.length || 0);
    if (systemPrompt) {
      combinedPrompt = `${systemPrompt}\n\n---\n\n${prompt}`;
      console.log('[CodexExecutor] System prompt prepended to main prompt');
      console.log('[CodexExecutor] System prompt length:', systemPrompt.length);
      console.log('[CodexExecutor] Combined prompt length:', combinedPrompt.length);
    }

    // Build command arguments
    // Note: maxTurns and allowedTools are not supported by Codex CLI
    console.log('[CodexExecutor] Building command arguments...');
    const args = this.buildArgs({
      prompt: combinedPrompt,
      model
    });

    console.log('[CodexExecutor] Executing command:', codexPath);
    console.log('[CodexExecutor] Number of args:', args.length);
    console.log('[CodexExecutor] Args (without prompt):', args.slice(0, -1).join(' '));
    console.log('[CodexExecutor] Prompt length in args:', args[args.length - 1]?.length || 0);
    console.log('[CodexExecutor] Prompt preview (first 200 chars):', args[args.length - 1]?.substring(0, 200));
    console.log('[CodexExecutor] Working directory:', cwd);

    // Spawn the process
    const processEnv = {
      ...process.env,
      ...env,
      // Ensure OPENAI_API_KEY is available
      OPENAI_API_KEY: env.OPENAI_API_KEY || process.env.OPENAI_API_KEY
    };

    // Log API key status (without exposing the key)
    if (processEnv.OPENAI_API_KEY) {
      console.log('[CodexExecutor] OPENAI_API_KEY is set (length:', processEnv.OPENAI_API_KEY.length, ')');
    } else {
      console.warn('[CodexExecutor] WARNING: OPENAI_API_KEY is not set!');
    }

    console.log('[CodexExecutor] Spawning process...');
    const proc = spawn(codexPath, args, {
      cwd,
      env: processEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.currentProcess = proc;
    console.log('[CodexExecutor] Process spawned with PID:', proc.pid);

    // Track process events
    proc.on('error', (error) => {
      console.error('[CodexExecutor] Process error:', error);
    });

    proc.on('spawn', () => {
      console.log('[CodexExecutor] Process spawned successfully');
    });

    // Collect stderr output as it comes in
    let stderr = '';
    let hasOutput = false;
    let stdoutChunks = [];
    let stderrChunks = [];
    
    proc.stderr.on('data', (data) => {
      const errorText = data.toString();
      stderr += errorText;
      stderrChunks.push(errorText);
      hasOutput = true;
      console.error('[CodexExecutor] stderr chunk received (', data.length, 'bytes):', errorText.substring(0, 200));
    });

    proc.stderr.on('end', () => {
      console.log('[CodexExecutor] stderr stream ended. Total chunks:', stderrChunks.length, 'Total length:', stderr.length);
    });

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdoutChunks.push(text);
      hasOutput = true;
      console.log('[CodexExecutor] stdout chunk received (', data.length, 'bytes):', text.substring(0, 200));
    });

    proc.stdout.on('end', () => {
      console.log('[CodexExecutor] stdout stream ended. Total chunks:', stdoutChunks.length);
    });

    // Create readline interface for parsing JSONL output
    console.log('[CodexExecutor] Creating readline interface...');
    const rl = readline.createInterface({
      input: proc.stdout,
      crlfDelay: Infinity
    });

    // Track accumulated content for converting to Claude format
    let accumulatedText = '';
    let toolUses = [];
    let lastOutputTime = Date.now();
    const OUTPUT_TIMEOUT = 30000; // 30 seconds timeout for no output
    let lineCount = 0;
    let jsonParseErrors = 0;

    // Set up timeout check
    const checkTimeout = setInterval(() => {
      const timeSinceLastOutput = Date.now() - lastOutputTime;
      if (timeSinceLastOutput > OUTPUT_TIMEOUT && !hasOutput) {
        console.warn('[CodexExecutor] No output received for', timeSinceLastOutput, 'ms. Process still alive:', !proc.killed);
      }
    }, 5000);

    console.log('[CodexExecutor] Starting to read lines from stdout...');

    // Process stdout line by line (JSONL format)
    try {
      for await (const line of rl) {
        hasOutput = true;
        lastOutputTime = Date.now();
        lineCount++;
        
        console.log('[CodexExecutor] Line', lineCount, 'received (length:', line.length, '):', line.substring(0, 100));
        
        if (!line.trim()) {
          console.log('[CodexExecutor] Skipping empty line');
          continue;
        }

        try {
          const event = JSON.parse(line);
          console.log('[CodexExecutor] Successfully parsed JSON event. Type:', event.type, 'Keys:', Object.keys(event));
          
          const convertedMsg = this.convertToClaudeFormat(event);
          console.log('[CodexExecutor] Converted message:', convertedMsg ? { type: convertedMsg.type } : 'null');

          if (convertedMsg) {
            // Accumulate text content
            if (convertedMsg.type === 'assistant' && convertedMsg.message?.content) {
              for (const block of convertedMsg.message.content) {
                if (block.type === 'text') {
                  accumulatedText += block.text;
                  console.log('[CodexExecutor] Accumulated text block (total length:', accumulatedText.length, ')');
                } else if (block.type === 'tool_use') {
                  toolUses.push(block);
                  console.log('[CodexExecutor] Tool use detected:', block.name);
                }
              }
            }
            console.log('[CodexExecutor] Yielding message of type:', convertedMsg.type);
            yield convertedMsg;
          } else {
            console.log('[CodexExecutor] Converted message is null, skipping');
          }
        } catch (parseError) {
          jsonParseErrors++;
          // Non-JSON output, yield as text
          console.log('[CodexExecutor] JSON parse error (', jsonParseErrors, 'total):', parseError.message);
          console.log('[CodexExecutor] Non-JSON line content:', line.substring(0, 200));
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: line + '\n' }]
            }
          };
        }
      }
      
      console.log('[CodexExecutor] Finished reading all lines. Total lines:', lineCount, 'JSON errors:', jsonParseErrors);
    } catch (readError) {
      console.error('[CodexExecutor] Error reading from readline:', readError);
      throw readError;
    } finally {
      clearInterval(checkTimeout);
      console.log('[CodexExecutor] Cleaned up timeout checker');
    }

    // Handle process completion
    console.log('[CodexExecutor] Waiting for process to close...');
    const exitCode = await new Promise((resolve) => {
      proc.on('close', (code, signal) => {
        console.log('[CodexExecutor] Process closed with code:', code, 'signal:', signal);
        resolve(code);
      });
    });

    this.currentProcess = null;
    console.log('[CodexExecutor] Process completed. Exit code:', exitCode, 'Has output:', hasOutput, 'Stderr length:', stderr.length);

    // Wait a bit for any remaining stderr data to be collected
    console.log('[CodexExecutor] Waiting 200ms for any remaining stderr data...');
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log('[CodexExecutor] Final stderr length:', stderr.length, 'Final stdout chunks:', stdoutChunks.length);

    if (exitCode !== 0) {
      const errorMessage = stderr.trim() 
        ? `Codex CLI exited with code ${exitCode}.\n\nError output:\n${stderr}`
        : `Codex CLI exited with code ${exitCode}. No error output captured.`;
      
      console.error('[CodexExecutor] Process failed with exit code', exitCode);
      console.error('[CodexExecutor] Error message:', errorMessage);
      console.error('[CodexExecutor] Stderr chunks:', stderrChunks.length, 'Stdout chunks:', stdoutChunks.length);
      
      yield {
        type: 'error',
        error: errorMessage
      };
    } else if (!hasOutput && !stderr) {
      // Process exited successfully but produced no output - might be API key issue
      const warningMessage = 'Codex CLI completed but produced no output. This might indicate:\n' +
        '- Missing or invalid OPENAI_API_KEY\n' +
        '- Codex CLI configuration issue\n' +
        '- The process completed without generating any response\n\n' +
        `Debug info: Exit code ${exitCode}, stdout chunks: ${stdoutChunks.length}, stderr chunks: ${stderrChunks.length}, lines read: ${lineCount}`;
      
      console.warn('[CodexExecutor] No output detected:', warningMessage);
      console.warn('[CodexExecutor] Stdout chunks:', stdoutChunks);
      console.warn('[CodexExecutor] Stderr chunks:', stderrChunks);
      
      yield {
        type: 'error',
        error: warningMessage
      };
    } else {
      console.log('[CodexExecutor] Process completed successfully. Exit code:', exitCode, 'Lines processed:', lineCount);
    }
  }

  /**
   * Build command arguments for Codex CLI
   * Only includes supported arguments based on Codex CLI help:
   * - --model: Model to use
   * - --json: JSON output format
   * - --full-auto: Non-interactive automatic execution
   * 
   * Note: Codex CLI does NOT support:
   * - --system-prompt (system prompt is prepended to main prompt)
   * - --max-turns (not available in CLI)
   * - --tools (not available in CLI)
   * 
   * @param {Object} options Options
   * @returns {string[]} Command arguments
   */
  buildArgs(options) {
    const { prompt, model } = options;

    console.log('[CodexExecutor] buildArgs called with model:', model, 'prompt length:', prompt?.length || 0);

    const args = ['exec'];

    // Add model (required for most use cases)
    if (model) {
      args.push('--model', model);
      console.log('[CodexExecutor] Added model argument:', model);
    }

    // Add JSON output flag for structured parsing
    args.push('--json');
    console.log('[CodexExecutor] Added --json flag');

    // Add full-auto mode (non-interactive)
    // This enables automatic execution with workspace-write sandbox
    args.push('--full-auto');
    console.log('[CodexExecutor] Added --full-auto flag');

    // Add the prompt at the end
    args.push(prompt);
    console.log('[CodexExecutor] Added prompt (length:', prompt?.length || 0, ')');

    console.log('[CodexExecutor] Final args count:', args.length);
    return args;
  }

  /**
   * Map Claude tool names to Codex tool names
   * @param {string[]} tools Array of tool names
   * @returns {string[]} Mapped tool names
   */
  mapToolsToCodex(tools) {
    const toolMap = {
      'Read': 'read',
      'Write': 'write',
      'Edit': 'edit',
      'Bash': 'bash',
      'Glob': 'glob',
      'Grep': 'grep',
      'WebSearch': 'web-search',
      'WebFetch': 'web-fetch'
    };

    return tools
      .map(tool => toolMap[tool] || tool.toLowerCase())
      .filter(tool => tool); // Remove undefined
  }

  /**
   * Convert Codex JSONL event to Claude SDK message format
   * @param {Object} event Codex event object
   * @returns {Object|null} Claude-format message or null
   */
  convertToClaudeFormat(event) {
    console.log('[CodexExecutor] Converting event:', JSON.stringify(event).substring(0, 200));
    const { type, data, item, thread_id } = event;

    switch (type) {
      case CODEX_EVENT_TYPES.THREAD_STARTED:
      case 'thread.started':
        // Session initialization
        return {
          type: 'session_start',
          sessionId: thread_id || data?.thread_id || event.thread_id
        };

      case CODEX_EVENT_TYPES.ITEM_COMPLETED:
      case 'item.completed':
        // Codex uses 'item' field, not 'data'
        return this.convertItemCompleted(item || data);

      case CODEX_EVENT_TYPES.ITEM_STARTED:
      case 'item.started':
        // Convert item.started events - these indicate tool/command usage
        const startedItem = item || data;
        if (startedItem?.type === 'command_execution' && startedItem?.command) {
          return {
            type: 'assistant',
            message: {
              content: [{
                type: 'tool_use',
                name: 'bash',
                input: { command: startedItem.command }
              }]
            }
          };
        }
        // For other item.started types, return null (we'll show the completed version)
        return null;

      case CODEX_EVENT_TYPES.THREAD_COMPLETED:
      case 'thread.completed':
        return {
          type: 'complete',
          sessionId: thread_id || data?.thread_id || event.thread_id
        };

      case CODEX_EVENT_TYPES.ERROR:
      case 'error':
        return {
          type: 'error',
          error: data?.message || item?.message || event.message || 'Unknown error from Codex CLI'
        };

      case 'turn.started':
        // Turn started - just a marker, no need to convert
        return null;

      default:
        // Pass through other events
        console.log('[CodexExecutor] Unhandled event type:', type);
        return null;
    }
  }

  /**
   * Convert item.completed event to Claude format
   * @param {Object} item Event item data
   * @returns {Object|null} Claude-format message
   */
  convertItemCompleted(item) {
    if (!item) {
      console.log('[CodexExecutor] convertItemCompleted: item is null/undefined');
      return null;
    }

    const itemType = item.type || item.item_type;
    console.log('[CodexExecutor] convertItemCompleted: itemType =', itemType, 'item keys:', Object.keys(item));

    switch (itemType) {
      case 'reasoning':
        // Thinking/reasoning output - Codex uses 'text' field
        const reasoningText = item.text || item.content || '';
        console.log('[CodexExecutor] Converting reasoning, text length:', reasoningText.length);
        return {
          type: 'assistant',
          message: {
            content: [{
              type: 'thinking',
              thinking: reasoningText
            }]
          }
        };

      case 'agent_message':
      case 'message':
        // Assistant text message
        const messageText = item.content || item.text || '';
        console.log('[CodexExecutor] Converting message, text length:', messageText.length);
        return {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: messageText
            }]
          }
        };

      case 'command_execution':
        // Command execution - show both the command and its output
        const command = item.command || '';
        const output = item.aggregated_output || item.output || '';
        console.log('[CodexExecutor] Converting command_execution, command:', command.substring(0, 50), 'output length:', output.length);
        
        // Return as text message showing the command and output
        return {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: `\`\`\`bash\n${command}\n\`\`\`\n\n${output}`
            }]
          }
        };

      case 'tool_use':
        // Tool use
        return {
          type: 'assistant',
          message: {
            content: [{
              type: 'tool_use',
              name: item.tool || item.command || 'unknown',
              input: item.input || item.args || {}
            }]
          }
        };

      case 'tool_result':
        // Tool result
        return {
          type: 'tool_result',
          tool_use_id: item.tool_use_id,
          content: item.output || item.result
        };

      case 'todo_list':
        // Todo list - convert to text format
        const todos = item.items || [];
        const todoText = todos.map((t, i) => `${i + 1}. ${t.text || t}`).join('\n');
        console.log('[CodexExecutor] Converting todo_list, items:', todos.length);
        return {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: `**Todo List:**\n${todoText}`
            }]
          }
        };

      default:
        // Generic text output
        const text = item.text || item.content || item.aggregated_output;
        if (text) {
          console.log('[CodexExecutor] Converting default item type, text length:', text.length);
          return {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: String(text)
              }]
            }
          };
        }
        console.log('[CodexExecutor] convertItemCompleted: No text content found, returning null');
        return null;
    }
  }

  /**
   * Abort current execution
   */
  abort() {
    if (this.currentProcess) {
      console.log('[CodexExecutor] Aborting current process');
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
  }

  /**
   * Check if execution is in progress
   * @returns {boolean} Whether execution is in progress
   */
  isRunning() {
    return this.currentProcess !== null;
  }
}

// Singleton instance
const codexExecutor = new CodexExecutor();

module.exports = codexExecutor;
