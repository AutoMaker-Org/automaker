import { describe, it, expect } from 'vitest';
import {
  resolveCodexToolCall,
  extractCodexTodoItems,
  getCodexTodoToolName,
} from '@/providers/codex-tool-mapping.js';

const TOOL_NAME_BASH = 'Bash';
const TOOL_NAME_READ = 'Read';
const TOOL_NAME_EDIT = 'Edit';
const TOOL_NAME_WRITE = 'Write';
const TOOL_NAME_GREP = 'Grep';
const TOOL_NAME_GLOB = 'Glob';
const INPUT_KEY_COMMAND = 'command';
const INPUT_KEY_FILE_PATH = 'file_path';
const INPUT_KEY_PATTERN = 'pattern';

describe('codex-tool-mapping', () => {
  it('maps cat commands to Read with file_path', () => {
    const command = '/bin/bash -lc "cd /repo && cat README.md"';
    const result = resolveCodexToolCall(command);

    expect(result.name).toBe(TOOL_NAME_READ);
    expect(result.input).toEqual({ [INPUT_KEY_FILE_PATH]: 'README.md' });
  });

  it('maps rg commands to Grep with pattern', () => {
    const command = '/bin/bash -lc "rg \\"Tool\\" src"';
    const result = resolveCodexToolCall(command);

    expect(result.name).toBe(TOOL_NAME_GREP);
    expect(result.input).toEqual({ [INPUT_KEY_PATTERN]: 'Tool' });
  });

  it('maps apply_patch commands to Edit with patch file path', () => {
    const command = [
      "apply_patch <<'PATCH'",
      '*** Begin Patch',
      '*** Update File: src/app.ts',
      '*** End Patch',
      'PATCH',
    ].join('\n');
    const result = resolveCodexToolCall(command);

    expect(result.name).toBe(TOOL_NAME_EDIT);
    expect(result.input).toEqual({ [INPUT_KEY_FILE_PATH]: 'src/app.ts' });
  });

  it('maps redirection commands to Write with target file', () => {
    const command = 'cat input.txt > output.txt';
    const result = resolveCodexToolCall(command);

    expect(result.name).toBe(TOOL_NAME_WRITE);
    expect(result.input).toEqual({ [INPUT_KEY_FILE_PATH]: 'output.txt' });
  });

  it('maps ls commands to Glob', () => {
    const command = 'ls src';
    const result = resolveCodexToolCall(command);

    expect(result.name).toBe(TOOL_NAME_GLOB);
    expect(result.input).toEqual({ [INPUT_KEY_PATTERN]: 'src' });
  });

  it('defaults to Bash for unclassified commands', () => {
    const command = '/bin/bash -lc "cd /repo && npm run test"';
    const result = resolveCodexToolCall(command);

    expect(result.name).toBe(TOOL_NAME_BASH);
    expect(result.input).toEqual({ [INPUT_KEY_COMMAND]: 'cd /repo && npm run test' });
  });

  it('parses todo list content into TodoWrite items', () => {
    const todoInput = {
      content: ['- [ ] First item', '- [x] Done item', '- [~] Working item'].join('\n'),
    };

    const todos = extractCodexTodoItems(todoInput);

    expect(todos).toEqual([
      { content: 'First item', status: 'pending' },
      { content: 'Done item', status: 'completed' },
      { content: 'Working item', status: 'in_progress' },
    ]);
    expect(getCodexTodoToolName()).toBe('TodoWrite');
  });
});
