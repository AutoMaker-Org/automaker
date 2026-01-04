import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createVerifyCodexAuthHandler } from '@/routes/setup/routes/verify-codex-auth.js';
import { ProviderFactory } from '@/providers/provider-factory.js';
import { createMockExpressContext } from '../../../utils/mocks.js';
import { getCodexAuthIndicators } from '@automaker/platform';

vi.mock('@/providers/provider-factory.js', () => ({
  ProviderFactory: {
    getProviderForModel: vi.fn(),
  },
}));

vi.mock('@automaker/platform', () => ({
  getCodexAuthIndicators: vi.fn(),
}));

const ERROR_CLI_AUTH_REQUIRED =
  "CLI authentication failed. Please run 'codex login' to authenticate.";

describe('verify-codex-auth', () => {
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();
    const context = createMockExpressContext();
    req = context.req;
    res = context.res;
    vi.mocked(getCodexAuthIndicators).mockResolvedValue({
      hasAuthFile: true,
      hasOAuthToken: true,
      hasApiKey: false,
    });
  });

  it('returns cli auth required when no Codex auth token is available', async () => {
    vi.mocked(getCodexAuthIndicators).mockResolvedValue({
      hasAuthFile: false,
      hasOAuthToken: false,
      hasApiKey: false,
    });

    req.body = { authMethod: 'cli' };
    const handler = createVerifyCodexAuthHandler();
    await handler(req, res);

    expect(ProviderFactory.getProviderForModel).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      authenticated: false,
      error: ERROR_CLI_AUTH_REQUIRED,
    });
  });

  it('returns billing error when credits are exhausted', async () => {
    vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue({
      executeQuery: () =>
        (async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Insufficient credits available' }],
            },
          };
        })(),
    } as any);

    req.body = { authMethod: 'cli' };
    const handler = createVerifyCodexAuthHandler();
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      authenticated: true, // Auth succeeded, but billing issue
      error: 'Credit balance is too low. Please add credits to your OpenAI account.',
    });
  });

  it('returns rate limit error when usage limits are hit', async () => {
    vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue({
      executeQuery: () =>
        (async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Rate limit reached, try later' }],
            },
          };
        })(),
    } as any);

    req.body = { authMethod: 'cli' };
    const handler = createVerifyCodexAuthHandler();
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      authenticated: true, // Auth succeeded, but rate limited
      error: 'Rate limit reached. Please wait a while before trying again or upgrade your plan.',
    });
  });

  it('returns authenticated when Codex responds', async () => {
    vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue({
      executeQuery: () =>
        (async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'ok' }],
            },
          };
        })(),
    } as any);

    req.body = { authMethod: 'cli' };
    const handler = createVerifyCodexAuthHandler();
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      authenticated: true,
    });
  });

  it('returns cli auth error when stderr contains auth-related errors', async () => {
    // Simulate the exact error from the bug report
    const stderrError =
      '2026-01-04T12:08:06.694240Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Auth(TokenRefreshFailed("Failed to parse server response"))';

    vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue({
      executeQuery: () =>
        (async function* () {
          yield {
            type: 'error',
            error: stderrError,
          };
        })(),
    } as any);

    req.body = { authMethod: 'cli' };
    const handler = createVerifyCodexAuthHandler();
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      authenticated: false,
      error: ERROR_CLI_AUTH_REQUIRED,
      details: stderrError, // Now includes the detailed error
    });
  });
});
