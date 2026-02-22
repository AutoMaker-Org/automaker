import { describe, it, expect } from 'vitest';
import { CursorProvider } from '@/providers/cursor-provider.js';

describe('cursor-provider.ts', () => {
  describe('buildCliArgs', () => {
    it('adds --resume when sdkSessionId is provided', () => {
      const provider = Object.create(CursorProvider.prototype) as CursorProvider & {
        cliPath?: string;
      };
      provider.cliPath = '/usr/local/bin/cursor-agent';

      const args = provider.buildCliArgs({
        prompt: 'Continue the task',
        model: 'gpt-5',
        cwd: '/tmp/project',
        sdkSessionId: 'cursor-session-123',
      });

      const resumeIndex = args.indexOf('--resume');
      expect(resumeIndex).toBeGreaterThan(-1);
      expect(args[resumeIndex + 1]).toBe('cursor-session-123');
    });

    it('does not add --resume when sdkSessionId is omitted', () => {
      const provider = Object.create(CursorProvider.prototype) as CursorProvider & {
        cliPath?: string;
      };
      provider.cliPath = '/usr/local/bin/cursor-agent';

      const args = provider.buildCliArgs({
        prompt: 'Start a new task',
        model: 'gpt-5',
        cwd: '/tmp/project',
      });

      expect(args).not.toContain('--resume');
    });
  });
});
