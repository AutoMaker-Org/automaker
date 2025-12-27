import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('sdk-options.ts', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('TOOL_PRESETS', () => {
    it('should export readOnly tools', async () => {
      const { TOOL_PRESETS } = await import('@/lib/sdk-options.js');
      expect(TOOL_PRESETS.readOnly).toEqual(['Read', 'Glob', 'Grep']);
    });

    it('should export specGeneration tools', async () => {
      const { TOOL_PRESETS } = await import('@/lib/sdk-options.js');
      expect(TOOL_PRESETS.specGeneration).toEqual(['Read', 'Glob', 'Grep']);
    });

    it('should export fullAccess tools', async () => {
      const { TOOL_PRESETS } = await import('@/lib/sdk-options.js');
      expect(TOOL_PRESETS.fullAccess).toContain('Read');
      expect(TOOL_PRESETS.fullAccess).toContain('Write');
      expect(TOOL_PRESETS.fullAccess).toContain('Edit');
      expect(TOOL_PRESETS.fullAccess).toContain('Bash');
    });

    it('should export chat tools matching fullAccess', async () => {
      const { TOOL_PRESETS } = await import('@/lib/sdk-options.js');
      expect(TOOL_PRESETS.chat).toEqual(TOOL_PRESETS.fullAccess);
    });
  });

  describe('MAX_TURNS', () => {
    it('should export turn presets', async () => {
      const { MAX_TURNS } = await import('@/lib/sdk-options.js');
      expect(MAX_TURNS.quick).toBe(50);
      expect(MAX_TURNS.standard).toBe(100);
      expect(MAX_TURNS.extended).toBe(250);
      expect(MAX_TURNS.maximum).toBe(1000);
    });
  });

  describe('getModelForUseCase', () => {
    it('should return explicit model when provided', async () => {
      const { getModelForUseCase } = await import('@/lib/sdk-options.js');
      const result = getModelForUseCase('spec', 'claude-sonnet-4-20250514');
      expect(result).toBe('claude-sonnet-4-20250514');
    });

    it('should use environment variable for spec model', async () => {
      process.env.AUTOMAKER_MODEL_SPEC = 'claude-sonnet-4-20250514';
      const { getModelForUseCase } = await import('@/lib/sdk-options.js');
      const result = getModelForUseCase('spec');
      expect(result).toBe('claude-sonnet-4-20250514');
    });

    it('should use default model for spec when no override', async () => {
      delete process.env.AUTOMAKER_MODEL_SPEC;
      delete process.env.AUTOMAKER_MODEL_DEFAULT;
      const { getModelForUseCase } = await import('@/lib/sdk-options.js');
      const result = getModelForUseCase('spec');
      expect(result).toContain('claude');
    });

    it('should fall back to AUTOMAKER_MODEL_DEFAULT', async () => {
      delete process.env.AUTOMAKER_MODEL_SPEC;
      process.env.AUTOMAKER_MODEL_DEFAULT = 'claude-sonnet-4-20250514';
      const { getModelForUseCase } = await import('@/lib/sdk-options.js');
      const result = getModelForUseCase('spec');
      expect(result).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('createSpecGenerationOptions', () => {
    it('should create options with spec generation settings', async () => {
      const { createSpecGenerationOptions, TOOL_PRESETS, MAX_TURNS } =
        await import('@/lib/sdk-options.js');

      const options = createSpecGenerationOptions({ cwd: '/test/path' });

      expect(options.cwd).toBe('/test/path');
      expect(options.maxTurns).toBe(MAX_TURNS.maximum);
      expect(options.allowedTools).toEqual([...TOOL_PRESETS.specGeneration]);
      expect(options.permissionMode).toBe('default');
    });

    it('should include system prompt when provided', async () => {
      const { createSpecGenerationOptions } = await import('@/lib/sdk-options.js');

      const options = createSpecGenerationOptions({
        cwd: '/test/path',
        systemPrompt: 'Custom prompt',
      });

      expect(options.systemPrompt).toBe('Custom prompt');
    });

    it('should include abort controller when provided', async () => {
      const { createSpecGenerationOptions } = await import('@/lib/sdk-options.js');

      const abortController = new AbortController();
      const options = createSpecGenerationOptions({
        cwd: '/test/path',
        abortController,
      });

      expect(options.abortController).toBe(abortController);
    });
  });

  describe('createFeatureGenerationOptions', () => {
    it('should create options with feature generation settings', async () => {
      const { createFeatureGenerationOptions, TOOL_PRESETS, MAX_TURNS } =
        await import('@/lib/sdk-options.js');

      const options = createFeatureGenerationOptions({ cwd: '/test/path' });

      expect(options.cwd).toBe('/test/path');
      expect(options.maxTurns).toBe(MAX_TURNS.quick);
      expect(options.allowedTools).toEqual([...TOOL_PRESETS.readOnly]);
    });
  });

  describe('createSuggestionsOptions', () => {
    it('should create options with suggestions settings', async () => {
      const { createSuggestionsOptions, TOOL_PRESETS, MAX_TURNS } =
        await import('@/lib/sdk-options.js');

      const options = createSuggestionsOptions({ cwd: '/test/path' });

      expect(options.cwd).toBe('/test/path');
      expect(options.maxTurns).toBe(MAX_TURNS.extended);
      expect(options.allowedTools).toEqual([...TOOL_PRESETS.readOnly]);
    });

    it('should include systemPrompt when provided', async () => {
      const { createSuggestionsOptions } = await import('@/lib/sdk-options.js');

      const options = createSuggestionsOptions({
        cwd: '/test/path',
        systemPrompt: 'Custom prompt',
      });

      expect(options.systemPrompt).toBe('Custom prompt');
    });

    it('should include abortController when provided', async () => {
      const { createSuggestionsOptions } = await import('@/lib/sdk-options.js');

      const abortController = new AbortController();
      const options = createSuggestionsOptions({
        cwd: '/test/path',
        abortController,
      });

      expect(options.abortController).toBe(abortController);
    });

    it('should include outputFormat when provided', async () => {
      const { createSuggestionsOptions } = await import('@/lib/sdk-options.js');

      const options = createSuggestionsOptions({
        cwd: '/test/path',
        outputFormat: { type: 'json' },
      });

      expect(options.outputFormat).toEqual({ type: 'json' });
    });
  });

  describe('createChatOptions', () => {
    it('should create options with chat settings', async () => {
      const { createChatOptions, TOOL_PRESETS, MAX_TURNS } = await import('@/lib/sdk-options.js');

      const options = createChatOptions({ cwd: '/test/path', enableSandboxMode: true });

      expect(options.cwd).toBe('/test/path');
      expect(options.maxTurns).toBe(MAX_TURNS.standard);
      expect(options.allowedTools).toEqual([...TOOL_PRESETS.chat]);
      expect(options.sandbox).toEqual({
        enabled: true,
        autoAllowBashIfSandboxed: true,
      });
    });

    it('should prefer explicit model over session model', async () => {
      const { createChatOptions, getModelForUseCase } = await import('@/lib/sdk-options.js');

      const options = createChatOptions({
        cwd: '/test/path',
        model: 'claude-opus-4-20250514',
        sessionModel: 'claude-haiku-3-5-20241022',
      });

      expect(options.model).toBe('claude-opus-4-20250514');
    });

    it('should use session model when explicit model not provided', async () => {
      const { createChatOptions } = await import('@/lib/sdk-options.js');

      const options = createChatOptions({
        cwd: '/test/path',
        sessionModel: 'claude-sonnet-4-20250514',
      });

      expect(options.model).toBe('claude-sonnet-4-20250514');
    });

    it('should not set sandbox when enableSandboxMode is false', async () => {
      const { createChatOptions } = await import('@/lib/sdk-options.js');

      const options = createChatOptions({
        cwd: '/test/path',
        enableSandboxMode: false,
      });

      expect(options.sandbox).toBeUndefined();
    });

    it('should not set sandbox when enableSandboxMode is not provided', async () => {
      const { createChatOptions } = await import('@/lib/sdk-options.js');

      const options = createChatOptions({
        cwd: '/test/path',
      });

      expect(options.sandbox).toBeUndefined();
    });
  });

  describe('createAutoModeOptions', () => {
    it('should create options with auto mode settings', async () => {
      const { createAutoModeOptions, TOOL_PRESETS, MAX_TURNS } =
        await import('@/lib/sdk-options.js');

      const options = createAutoModeOptions({ cwd: '/test/path', enableSandboxMode: true });

      expect(options.cwd).toBe('/test/path');
      expect(options.maxTurns).toBe(MAX_TURNS.maximum);
      expect(options.allowedTools).toEqual([...TOOL_PRESETS.fullAccess]);
      expect(options.sandbox).toEqual({
        enabled: true,
        autoAllowBashIfSandboxed: true,
      });
    });

    it('should include systemPrompt when provided', async () => {
      const { createAutoModeOptions } = await import('@/lib/sdk-options.js');

      const options = createAutoModeOptions({
        cwd: '/test/path',
        systemPrompt: 'Custom prompt',
      });

      expect(options.systemPrompt).toBe('Custom prompt');
    });

    it('should include abortController when provided', async () => {
      const { createAutoModeOptions } = await import('@/lib/sdk-options.js');

      const abortController = new AbortController();
      const options = createAutoModeOptions({
        cwd: '/test/path',
        abortController,
      });

      expect(options.abortController).toBe(abortController);
    });

    it('should not set sandbox when enableSandboxMode is false', async () => {
      const { createAutoModeOptions } = await import('@/lib/sdk-options.js');

      const options = createAutoModeOptions({
        cwd: '/test/path',
        enableSandboxMode: false,
      });

      expect(options.sandbox).toBeUndefined();
    });

    it('should not set sandbox when enableSandboxMode is not provided', async () => {
      const { createAutoModeOptions } = await import('@/lib/sdk-options.js');

      const options = createAutoModeOptions({
        cwd: '/test/path',
      });

      expect(options.sandbox).toBeUndefined();
    });
  });

  describe('createCustomOptions', () => {
    it('should create options with custom settings', async () => {
      const { createCustomOptions } = await import('@/lib/sdk-options.js');

      const options = createCustomOptions({
        cwd: '/test/path',
        maxTurns: 10,
        allowedTools: ['Read', 'Write'],
        sandbox: { enabled: true },
      });

      expect(options.cwd).toBe('/test/path');
      expect(options.maxTurns).toBe(10);
      expect(options.allowedTools).toEqual(['Read', 'Write']);
      expect(options.sandbox).toEqual({ enabled: true });
    });

    it('should use defaults when optional params not provided', async () => {
      const { createCustomOptions, TOOL_PRESETS, MAX_TURNS } = await import('@/lib/sdk-options.js');

      const options = createCustomOptions({ cwd: '/test/path' });

      expect(options.maxTurns).toBe(MAX_TURNS.maximum);
      expect(options.allowedTools).toEqual([...TOOL_PRESETS.readOnly]);
    });

    it('should include sandbox when provided', async () => {
      const { createCustomOptions } = await import('@/lib/sdk-options.js');

      const options = createCustomOptions({
        cwd: '/test/path',
        sandbox: { enabled: true, autoAllowBashIfSandboxed: false },
      });

      expect(options.sandbox).toEqual({
        enabled: true,
        autoAllowBashIfSandboxed: false,
      });
    });

    it('should include systemPrompt when provided', async () => {
      const { createCustomOptions } = await import('@/lib/sdk-options.js');

      const options = createCustomOptions({
        cwd: '/test/path',
        systemPrompt: 'Custom prompt',
      });

      expect(options.systemPrompt).toBe('Custom prompt');
    });

    it('should include abortController when provided', async () => {
      const { createCustomOptions } = await import('@/lib/sdk-options.js');

      const abortController = new AbortController();
      const options = createCustomOptions({
        cwd: '/test/path',
        abortController,
      });

      expect(options.abortController).toBe(abortController);
    });
  });
});
