import { describe, it, expect, beforeEach } from 'vitest';
import { GeminiProvider } from '@/providers/gemini-provider.js';
import type { ProviderMessage } from '@automaker/types';

describe('gemini-provider.ts', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    provider = new GeminiProvider();
  });

  describe('buildCliArgs', () => {
    it('should include --prompt with empty string to force headless mode', () => {
      const args = provider.buildCliArgs({
        prompt: 'Hello from Gemini',
        model: '2.5-flash',
        cwd: '/tmp/project',
      });

      const promptIndex = args.indexOf('--prompt');
      expect(promptIndex).toBeGreaterThan(-1);
      expect(args[promptIndex + 1]).toBe('');
    });

    it('should include --resume when sdkSessionId is provided', () => {
      const args = provider.buildCliArgs({
        prompt: 'Hello',
        model: '2.5-flash',
        cwd: '/tmp/project',
        sdkSessionId: 'gemini-session-123',
      });

      const resumeIndex = args.indexOf('--resume');
      expect(resumeIndex).toBeGreaterThan(-1);
      expect(args[resumeIndex + 1]).toBe('gemini-session-123');
    });

    it('should not include --resume when sdkSessionId is missing', () => {
      const args = provider.buildCliArgs({
        prompt: 'Hello',
        model: '2.5-flash',
        cwd: '/tmp/project',
      });

      expect(args).not.toContain('--resume');
    });

    it('should include --sandbox false for faster execution', () => {
      const args = provider.buildCliArgs({
        prompt: 'Hello',
        model: '2.5-flash',
        cwd: '/tmp/project',
      });

      const sandboxIndex = args.indexOf('--sandbox');
      expect(sandboxIndex).toBeGreaterThan(-1);
      expect(args[sandboxIndex + 1]).toBe('false');
    });

    it('should include --approval-mode yolo for non-interactive use', () => {
      const args = provider.buildCliArgs({
        prompt: 'Hello',
        model: '2.5-flash',
        cwd: '/tmp/project',
      });

      const approvalIndex = args.indexOf('--approval-mode');
      expect(approvalIndex).toBeGreaterThan(-1);
      expect(args[approvalIndex + 1]).toBe('yolo');
    });

    it('should include --output-format stream-json', () => {
      const args = provider.buildCliArgs({
        prompt: 'Hello',
        model: '2.5-flash',
        cwd: '/tmp/project',
      });

      const formatIndex = args.indexOf('--output-format');
      expect(formatIndex).toBeGreaterThan(-1);
      expect(args[formatIndex + 1]).toBe('stream-json');
    });

    it('should include --include-directories with cwd', () => {
      const args = provider.buildCliArgs({
        prompt: 'Hello',
        model: '2.5-flash',
        cwd: '/tmp/my-project',
      });

      const dirIndex = args.indexOf('--include-directories');
      expect(dirIndex).toBeGreaterThan(-1);
      expect(args[dirIndex + 1]).toBe('/tmp/my-project');
    });

    it('should add gemini- prefix to bare model names', () => {
      const args = provider.buildCliArgs({
        prompt: 'Hello',
        model: '2.5-flash',
        cwd: '/tmp/project',
      });

      const modelIndex = args.indexOf('--model');
      expect(modelIndex).toBeGreaterThan(-1);
      expect(args[modelIndex + 1]).toBe('gemini-2.5-flash');
    });

    it('should not double-prefix model names that already have gemini-', () => {
      const args = provider.buildCliArgs({
        prompt: 'Hello',
        model: 'gemini-2.5-pro',
        cwd: '/tmp/project',
      });

      const modelIndex = args.indexOf('--model');
      expect(modelIndex).toBeGreaterThan(-1);
      expect(args[modelIndex + 1]).toBe('gemini-2.5-pro');
    });
  });

  describe('normalizeEvent - error handling', () => {
    it('returns error from result event when status=error and error field is set', () => {
      const event = {
        type: 'result',
        status: 'error',
        error: 'Model overloaded',
        session_id: 'sess-gemini-1',
        stats: { duration_ms: 4000, total_tokens: 0 },
      };

      const msg = provider.normalizeEvent(event) as ProviderMessage;

      expect(msg).not.toBeNull();
      expect(msg.type).toBe('error');
      expect(msg.error).toBe('Model overloaded');
      expect(msg.session_id).toBe('sess-gemini-1');
    });

    it('builds diagnostic fallback when result event has status=error but empty error field', () => {
      const event = {
        type: 'result',
        status: 'error',
        error: '',
        session_id: 'sess-gemini-2',
        stats: { duration_ms: 7500, total_tokens: 0 },
      };

      const msg = provider.normalizeEvent(event) as ProviderMessage;

      expect(msg).not.toBeNull();
      expect(msg.type).toBe('error');
      // Diagnostic info should be present instead of 'Unknown error'
      expect(msg.error).toContain('7500ms');
      expect(msg.error).toContain('sess-gemini-2');
      expect(msg.error).not.toBe('Unknown error');
    });

    it('builds fallback with "unknown" duration when stats are missing', () => {
      const event = {
        type: 'result',
        status: 'error',
        error: '',
        session_id: 'sess-gemini-nostats',
        // no stats field
      };

      const msg = provider.normalizeEvent(event) as ProviderMessage;

      expect(msg).not.toBeNull();
      expect(msg.type).toBe('error');
      expect(msg.error).toContain('unknown');
    });

    it('returns error from standalone error event with error field set', () => {
      const event = {
        type: 'error',
        error: 'API key invalid',
        session_id: 'sess-gemini-3',
      };

      const msg = provider.normalizeEvent(event) as ProviderMessage;

      expect(msg).not.toBeNull();
      expect(msg.type).toBe('error');
      expect(msg.error).toBe('API key invalid');
    });

    it('builds diagnostic fallback when standalone error event has empty error field', () => {
      const event = {
        type: 'error',
        error: '',
        session_id: 'sess-gemini-empty',
      };

      const msg = provider.normalizeEvent(event) as ProviderMessage;

      expect(msg).not.toBeNull();
      expect(msg.type).toBe('error');
      // Should include session_id, not just 'Unknown error'
      expect(msg.error).toContain('sess-gemini-empty');
      expect(msg.error).not.toBe('Unknown error');
    });

    it('builds fallback mentioning "none" when session_id is missing from error event', () => {
      const event = {
        type: 'error',
        error: '',
        // no session_id
      };

      const msg = provider.normalizeEvent(event) as ProviderMessage;

      expect(msg).not.toBeNull();
      expect(msg.type).toBe('error');
      expect(msg.error).toContain('none');
    });

    it('uses consistent "Gemini agent failed" label for both result and error event fallbacks', () => {
      const resultEvent = {
        type: 'result',
        status: 'error',
        error: '',
        session_id: 'sess-r',
        stats: { duration_ms: 1000 },
      };
      const errorEvent = {
        type: 'error',
        error: '',
        session_id: 'sess-e',
      };

      const resultMsg = provider.normalizeEvent(resultEvent) as ProviderMessage;
      const errorMsg = provider.normalizeEvent(errorEvent) as ProviderMessage;

      // Both fallback messages should use the same "Gemini agent failed" prefix
      expect(resultMsg.error).toContain('Gemini agent failed');
      expect(errorMsg.error).toContain('Gemini agent failed');
    });

    it('returns success result when result event has status=success', () => {
      const event = {
        type: 'result',
        status: 'success',
        error: '',
        session_id: 'sess-gemini-ok',
        stats: { duration_ms: 1200, total_tokens: 500 },
      };

      const msg = provider.normalizeEvent(event) as ProviderMessage;

      expect(msg).not.toBeNull();
      expect(msg.type).toBe('result');
      expect(msg.subtype).toBe('success');
    });
  });
});
