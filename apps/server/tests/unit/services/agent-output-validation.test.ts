import { describe, it, expect } from 'vitest';

/**
 * Contract tests verifying the tool marker format used by agent-executor
 * (which writes agent output) and execution-service (which reads it to
 * determine if the agent did meaningful work).
 *
 * The agent-executor writes: `\n🔧 Tool: ${block.name}\n`
 * The execution-service checks: `agentOutput.includes('🔧 Tool:')`
 *
 * These tests ensure the marker format contract stays consistent and
 * document the exact detection logic used for status determination.
 */

// The exact marker prefix that execution-service searches for
const TOOL_MARKER = '🔧 Tool:';

// Minimum output length threshold for "meaningful work"
const MIN_OUTPUT_LENGTH = 200;

/**
 * Simulates the agent-executor's tool_use output format.
 * See: agent-executor.ts line ~293
 */
function formatToolUseBlock(toolName: string, input?: Record<string, unknown>): string {
  let output = `\n${TOOL_MARKER} ${toolName}\n`;
  if (input) output += `Input: ${JSON.stringify(input, null, 2)}\n`;
  return output;
}

/**
 * Simulates the execution-service's output validation logic.
 * See: execution-service.ts lines ~427-429
 */
function validateAgentOutput(
  agentOutput: string,
  skipTests: boolean
): 'verified' | 'waiting_approval' {
  const hasToolUsage = agentOutput.includes(TOOL_MARKER);
  const hasMinimalOutput = agentOutput.trim().length < MIN_OUTPUT_LENGTH;
  const agentDidWork = hasToolUsage && !hasMinimalOutput;

  if (skipTests) return 'waiting_approval';
  if (!agentDidWork) return 'waiting_approval';
  return 'verified';
}

describe('Agent Output Validation - Contract Tests', () => {
  describe('tool marker format contract', () => {
    it('agent-executor tool format contains the expected marker', () => {
      const toolOutput = formatToolUseBlock('Read', { file_path: '/src/index.ts' });
      expect(toolOutput).toContain(TOOL_MARKER);
    });

    it('agent-executor tool format includes tool name after marker', () => {
      const toolOutput = formatToolUseBlock('Edit', {
        file_path: '/src/app.ts',
        old_string: 'foo',
        new_string: 'bar',
      });
      expect(toolOutput).toContain('🔧 Tool: Edit');
    });

    it('agent-executor tool format includes JSON input', () => {
      const input = { file_path: '/src/index.ts' };
      const toolOutput = formatToolUseBlock('Read', input);
      expect(toolOutput).toContain('Input: ');
      expect(toolOutput).toContain('"file_path": "/src/index.ts"');
    });

    it('agent-executor tool format works without input', () => {
      const toolOutput = formatToolUseBlock('Bash');
      expect(toolOutput).toContain('🔧 Tool: Bash');
      expect(toolOutput).not.toContain('Input:');
    });

    it('marker includes colon and space to avoid false positives', () => {
      // Ensure the marker is specific enough to avoid matching other emoji patterns
      expect(TOOL_MARKER).toBe('🔧 Tool:');
      expect(TOOL_MARKER).toContain(':');
    });
  });

  describe('output validation logic', () => {
    it('verified: tool usage + sufficient output', () => {
      const output =
        'Starting implementation of the new feature...\n' +
        formatToolUseBlock('Read', { file_path: '/src/index.ts' }) +
        'I can see the existing code. Let me make the needed changes.\n' +
        formatToolUseBlock('Edit', { file_path: '/src/index.ts' }) +
        'Changes complete. The implementation adds new validation logic and tests.';
      expect(output.trim().length).toBeGreaterThanOrEqual(MIN_OUTPUT_LENGTH);

      expect(validateAgentOutput(output, false)).toBe('verified');
    });

    it('waiting_approval: no tool markers regardless of length', () => {
      const longOutput = 'I analyzed the codebase. '.repeat(50);
      expect(longOutput.trim().length).toBeGreaterThan(MIN_OUTPUT_LENGTH);

      expect(validateAgentOutput(longOutput, false)).toBe('waiting_approval');
    });

    it('waiting_approval: tool markers but insufficient length', () => {
      const shortOutput = formatToolUseBlock('Read', { file_path: '/src/a.ts' });
      expect(shortOutput.trim().length).toBeLessThan(MIN_OUTPUT_LENGTH);

      expect(validateAgentOutput(shortOutput, false)).toBe('waiting_approval');
    });

    it('waiting_approval: empty output', () => {
      expect(validateAgentOutput('', false)).toBe('waiting_approval');
    });

    it('waiting_approval: skipTests always overrides', () => {
      const goodOutput =
        'Starting...\n' +
        formatToolUseBlock('Read', { file_path: '/src/index.ts' }) +
        formatToolUseBlock('Edit', { file_path: '/src/index.ts' }) +
        'Done implementing. '.repeat(15);
      expect(goodOutput.trim().length).toBeGreaterThanOrEqual(MIN_OUTPUT_LENGTH);

      expect(validateAgentOutput(goodOutput, true)).toBe('waiting_approval');
    });

    it('boundary: exactly MIN_OUTPUT_LENGTH chars with tool is verified', () => {
      const tool = formatToolUseBlock('Read');
      const padding = 'x'.repeat(MIN_OUTPUT_LENGTH - tool.trim().length);
      const output = tool + padding;
      expect(output.trim().length).toBeGreaterThanOrEqual(MIN_OUTPUT_LENGTH);

      expect(validateAgentOutput(output, false)).toBe('verified');
    });

    it('boundary: MIN_OUTPUT_LENGTH - 1 chars with tool is waiting_approval', () => {
      const marker = `${TOOL_MARKER} Read\n`;
      const padding = 'x'.repeat(MIN_OUTPUT_LENGTH - 1 - marker.length);
      const output = marker + padding;
      expect(output.trim().length).toBe(MIN_OUTPUT_LENGTH - 1);

      expect(validateAgentOutput(output, false)).toBe('waiting_approval');
    });
  });

  describe('realistic provider scenarios', () => {
    it('Claude SDK agent with multiple tools → verified', () => {
      let output = "I'll implement the feature.\n\n";
      output += formatToolUseBlock('Read', { file_path: '/src/components/App.tsx' });
      output += 'I see the component. Let me update it.\n\n';
      output += formatToolUseBlock('Edit', {
        file_path: '/src/components/App.tsx',
        old_string: 'const App = () => {',
        new_string: 'const App: React.FC = () => {',
      });
      output += 'Done. The component is now typed correctly.\n';

      expect(validateAgentOutput(output, false)).toBe('verified');
    });

    it('Cursor CLI quick exit (no tools) → waiting_approval', () => {
      const output = 'Task received. Processing...\nResult: completed successfully.';
      expect(validateAgentOutput(output, false)).toBe('waiting_approval');
    });

    it('Codex CLI with brief acknowledgment → waiting_approval', () => {
      const output = 'Understood the task. Starting implementation.\nDone.';
      expect(validateAgentOutput(output, false)).toBe('waiting_approval');
    });

    it('Agent that only reads but makes no edits (single Read tool, short output) → waiting_approval', () => {
      const output = formatToolUseBlock('Read', { file_path: '/src/index.ts' }) + 'File read.';
      expect(output.trim().length).toBeLessThan(MIN_OUTPUT_LENGTH);
      expect(validateAgentOutput(output, false)).toBe('waiting_approval');
    });

    it('Agent with extensive tool usage and explanation → verified', () => {
      let output = 'Analyzing the codebase for the authentication feature.\n\n';
      for (let i = 0; i < 5; i++) {
        output += formatToolUseBlock('Read', { file_path: `/src/auth/handler${i}.ts` });
        output += `Found handler ${i}. `;
      }
      output += formatToolUseBlock('Edit', {
        file_path: '/src/auth/handler0.ts',
        old_string: 'function login() {}',
        new_string: 'async function login(creds: Credentials) { ... }',
      });
      output += 'Implementation complete with all authentication changes applied.\n';

      expect(validateAgentOutput(output, false)).toBe('verified');
    });
  });
});
