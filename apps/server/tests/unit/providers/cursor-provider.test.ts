import { describe, it, expect, beforeEach } from 'vitest';
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

  describe('normalizeEvent - result error handling', () => {
    let provider: CursorProvider;

    beforeEach(() => {
      provider = Object.create(CursorProvider.prototype) as CursorProvider;
    });

    it('returns error message from resultEvent.error when is_error=true', () => {
      const event = {
        type: 'result',
        is_error: true,
        error: 'Rate limit exceeded',
        result: '',
        subtype: 'error',
        duration_ms: 3000,
        session_id: 'sess-123',
      };

      const msg = provider.normalizeEvent(event);

      expect(msg).not.toBeNull();
      expect(msg!.type).toBe('error');
      expect(msg!.error).toBe('Rate limit exceeded');
    });

    it('falls back to resultEvent.result when error field is empty and is_error=true', () => {
      const event = {
        type: 'result',
        is_error: true,
        error: '',
        result: 'Process terminated unexpectedly',
        subtype: 'error',
        duration_ms: 5000,
        session_id: 'sess-456',
      };

      const msg = provider.normalizeEvent(event);

      expect(msg).not.toBeNull();
      expect(msg!.type).toBe('error');
      expect(msg!.error).toBe('Process terminated unexpectedly');
    });

    it('builds diagnostic fallback when both error and result are empty and is_error=true', () => {
      const event = {
        type: 'result',
        is_error: true,
        error: '',
        result: '',
        subtype: 'error',
        duration_ms: 5000,
        session_id: 'sess-789',
      };

      const msg = provider.normalizeEvent(event);

      expect(msg).not.toBeNull();
      expect(msg!.type).toBe('error');
      // Should contain diagnostic info rather than 'Unknown error'
      expect(msg!.error).toContain('5000ms');
      expect(msg!.error).toContain('sess-789');
      expect(msg!.error).not.toBe('Unknown error');
    });

    it('preserves session_id in error message', () => {
      const event = {
        type: 'result',
        is_error: true,
        error: 'Timeout occurred',
        result: '',
        subtype: 'error',
        duration_ms: 30000,
        session_id: 'my-session-id',
      };

      const msg = provider.normalizeEvent(event);

      expect(msg!.session_id).toBe('my-session-id');
    });

    it('uses "none" when session_id is missing from diagnostic fallback', () => {
      const event = {
        type: 'result',
        is_error: true,
        error: '',
        result: '',
        subtype: 'error',
        duration_ms: 5000,
        // session_id intentionally omitted
      };

      const msg = provider.normalizeEvent(event);

      expect(msg).not.toBeNull();
      expect(msg!.type).toBe('error');
      expect(msg!.error).toContain('none');
      expect(msg!.error).not.toContain('undefined');
    });

    it('returns success result when is_error=false', () => {
      const event = {
        type: 'result',
        is_error: false,
        error: '',
        result: 'Completed successfully',
        subtype: 'success',
        duration_ms: 2000,
        session_id: 'sess-ok',
      };

      const msg = provider.normalizeEvent(event);

      expect(msg).not.toBeNull();
      expect(msg!.type).toBe('result');
      expect(msg!.subtype).toBe('success');
    });
  });
});
