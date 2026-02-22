import { describe, it, expect, beforeEach } from 'vitest';
import { GeminiProvider } from '@/providers/gemini-provider.js';

describe('gemini-provider.ts', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    provider = new GeminiProvider();
  });

  describe('buildCliArgs', () => {
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
  });
});
