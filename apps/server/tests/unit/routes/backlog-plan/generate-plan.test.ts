import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BacklogPlanResult, ProviderMessage } from '@automaker/types';

const {
  mockGetAll,
  mockExecuteQuery,
  mockSaveBacklogPlan,
  mockSetRunningState,
  mockSetRunningDetails,
  mockGetPromptCustomization,
  mockGetAutoLoadClaudeMdSetting,
  mockGetUseClaudeCodeSystemPromptSetting,
} = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
  mockExecuteQuery: vi.fn(),
  mockSaveBacklogPlan: vi.fn(),
  mockSetRunningState: vi.fn(),
  mockSetRunningDetails: vi.fn(),
  mockGetPromptCustomization: vi.fn(),
  mockGetAutoLoadClaudeMdSetting: vi.fn(),
  mockGetUseClaudeCodeSystemPromptSetting: vi.fn(),
}));

vi.mock('@/services/feature-loader.js', () => ({
  FeatureLoader: class {
    getAll = mockGetAll;
  },
}));

vi.mock('@/providers/provider-factory.js', () => ({
  ProviderFactory: {
    getProviderForModel: vi.fn(() => ({
      executeQuery: mockExecuteQuery,
    })),
  },
}));

vi.mock('@/routes/backlog-plan/common.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  setRunningState: mockSetRunningState,
  setRunningDetails: mockSetRunningDetails,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  saveBacklogPlan: mockSaveBacklogPlan,
}));

vi.mock('@/lib/settings-helpers.js', () => ({
  getPromptCustomization: mockGetPromptCustomization,
  getAutoLoadClaudeMdSetting: mockGetAutoLoadClaudeMdSetting,
  getUseClaudeCodeSystemPromptSetting: mockGetUseClaudeCodeSystemPromptSetting,
  getPhaseModelWithOverrides: vi.fn(),
}));

import { generateBacklogPlan } from '@/routes/backlog-plan/generate-plan.js';

function createMockEvents() {
  return {
    emit: vi.fn(),
  };
}

describe('generateBacklogPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetAll.mockResolvedValue([]);
    mockGetPromptCustomization.mockResolvedValue({
      backlogPlan: {
        systemPrompt: 'System instructions',
        userPromptTemplate:
          'Current features:\n{{currentFeatures}}\n\nUser request:\n{{userRequest}}',
      },
    });
    mockGetAutoLoadClaudeMdSetting.mockResolvedValue(false);
    mockGetUseClaudeCodeSystemPromptSetting.mockResolvedValue(true);
  });

  it('salvages valid streamed JSON when Claude process exits with code 1', async () => {
    const partialResult: BacklogPlanResult = {
      changes: [
        {
          type: 'add',
          feature: {
            title: 'Add signup form',
            description: 'Create signup UI and validation',
            category: 'frontend',
          },
          reason: 'Required for user onboarding',
        },
      ],
      summary: 'Adds signup feature to the backlog',
      dependencyUpdates: [],
    };

    const responseJson = JSON.stringify(partialResult);

    async function* streamWithExitError(): AsyncGenerator<ProviderMessage> {
      yield {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: responseJson }],
        },
      };
      throw new Error('Claude Code process exited with code 1');
    }

    mockExecuteQuery.mockReturnValueOnce(streamWithExitError());

    const events = createMockEvents();
    const abortController = new AbortController();

    const result = await generateBacklogPlan(
      '/tmp/project',
      'Please add a signup feature',
      events as any,
      abortController,
      undefined,
      'claude-opus'
    );

    expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
    expect(result).toEqual(partialResult);
    expect(mockSaveBacklogPlan).toHaveBeenCalledWith(
      '/tmp/project',
      expect.objectContaining({
        prompt: 'Please add a signup feature',
        model: 'claude-opus-4-6',
        result: partialResult,
      })
    );
    expect(events.emit).toHaveBeenCalledWith('backlog-plan:event', {
      type: 'backlog_plan_complete',
      result: partialResult,
    });
    expect(mockSetRunningState).toHaveBeenCalledWith(false, null);
    expect(mockSetRunningDetails).toHaveBeenCalledWith(null);
  });

  it('prefers parseable provider result over longer non-JSON accumulated text on exit', async () => {
    const recoveredResult: BacklogPlanResult = {
      changes: [
        {
          type: 'add',
          feature: {
            title: 'Add reset password flow',
            description: 'Implement reset password request and token validation UI',
            category: 'frontend',
          },
          reason: 'Supports account recovery',
        },
      ],
      summary: 'Adds password reset capability',
      dependencyUpdates: [],
    };

    const validProviderResult = JSON.stringify(recoveredResult);
    const invalidAccumulatedText = `${validProviderResult}\n\nAdditional commentary that breaks raw JSON parsing.`;

    async function* streamWithResultThenExit(): AsyncGenerator<ProviderMessage> {
      yield {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: invalidAccumulatedText }],
        },
      };
      yield {
        type: 'result',
        subtype: 'success',
        duration_ms: 10,
        duration_api_ms: 10,
        is_error: false,
        num_turns: 1,
        result: validProviderResult,
        session_id: 'session-1',
        total_cost_usd: 0,
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          output_tokens: 10,
          server_tool_use: {
            web_search_requests: 0,
          },
          service_tier: 'standard',
        },
      };
      throw new Error('Claude Code process exited with code 1');
    }

    mockExecuteQuery.mockReturnValueOnce(streamWithResultThenExit());

    const events = createMockEvents();
    const abortController = new AbortController();

    const result = await generateBacklogPlan(
      '/tmp/project',
      'Add password reset support',
      events as any,
      abortController,
      undefined,
      'claude-opus'
    );

    expect(result).toEqual(recoveredResult);
    expect(mockSaveBacklogPlan).toHaveBeenCalledWith(
      '/tmp/project',
      expect.objectContaining({
        result: recoveredResult,
      })
    );
  });
});
