import { describe, it, expect, beforeEach } from 'vitest';
import { GeminiProvider } from '@/providers/gemini-provider.js';

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
});
