import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { CodexUsageService } from '@/services/codex-usage-service.js';
import { spawn } from 'child_process';
import { findCodexCliPath } from '@automaker/platform';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('@automaker/platform', () => ({
  findCodexCliPath: vi.fn(),
}));

const CODEX_COMMAND = 'codex';
const CODEX_PATH = '/usr/local/bin/codex';
const EXIT_SUCCESS_CODE = 0;
const EXIT_ERROR_CODE = 1;
const PRIMARY_USED_PERCENT = 25;
const PRIMARY_WINDOW_MINS = 60;
const PRIMARY_RESETS_AT = 123456;
const SECONDARY_USED_PERCENT = 10;
const INVALID_PLAN_TYPE = 10;
const INVALID_BALANCE = 5;
const INVALID_RATE_LIMITS = 123;
const NON_OBJECT_JSON = 123;
const INVALID_JSON_LINE = '{invalid json';
const SPAWN_ERROR_MESSAGE = 'spawn failed';
const STDERR_MESSAGE = 'fatal error';
const ERROR_TIMEOUT = 'Codex usage request timed out';
const ERROR_NO_RESPONSE = 'Codex usage response missing';
const ERROR_COMMAND_FAILED = 'Codex app server failed';
const ERROR_INVALID_RESPONSE = 'Codex usage response was invalid';
const ERROR_MESSAGE = 'Codex reported an error';
const RATE_LIMITS_REQUEST_ID = 2;
const COMMAND_TIMEOUT_MS = 20000;
const TEST_PLAN_TYPE = 'business';

const createMockProcess = (options?: {
  hasStdout?: boolean;
  hasStdin?: boolean;
  hasStderr?: boolean;
}) => {
  const process = new EventEmitter() as EventEmitter & {
    stdout?: PassThrough | null;
    stderr?: PassThrough | null;
    stdin?: PassThrough | null;
    kill: ReturnType<typeof vi.fn>;
  };
  const hasStdout = options?.hasStdout ?? true;
  const hasStdin = options?.hasStdin ?? true;
  const hasStderr = options?.hasStderr ?? true;

  process.stdout = hasStdout ? new PassThrough() : null;
  process.stderr = hasStderr ? new PassThrough() : null;
  process.stdin = hasStdin ? new PassThrough() : null;
  process.kill = vi.fn();

  return process;
};

const writeLine = (process: { stdout?: PassThrough | null }, value: string) => {
  process.stdout?.write(`${value}\n`);
};

const buildRateLimitsPayload = (overrides?: Record<string, unknown>) => ({
  rateLimits: {
    primary: {
      usedPercent: PRIMARY_USED_PERCENT,
      windowDurationMins: PRIMARY_WINDOW_MINS,
      resetsAt: PRIMARY_RESETS_AT,
    },
    secondary: {
      usedPercent: SECONDARY_USED_PERCENT,
      windowDurationMins: null,
      resetsAt: null,
    },
    credits: {
      balance: '12.5',
      hasCredits: true,
      unlimited: false,
    },
    planType: TEST_PLAN_TYPE,
    ...overrides,
  },
});

const flushPromises = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('codex-usage-service.ts', () => {
  let service: CodexUsageService;
  let spawnMock: MockedFunction<typeof spawn>;
  let findCodexMock: MockedFunction<typeof findCodexCliPath>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CodexUsageService();
    spawnMock = vi.mocked(spawn);
    findCodexMock = vi.mocked(findCodexCliPath);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isAvailable', () => {
    it('should resolve true when the check command exits successfully', async () => {
      const checkProcess = new EventEmitter() as EventEmitter;
      spawnMock.mockReturnValue(checkProcess as any);

      const availablePromise = service.isAvailable();
      checkProcess.emit('close', EXIT_SUCCESS_CODE);

      await expect(availablePromise).resolves.toBe(true);
      expect(spawnMock).toHaveBeenCalledWith(expect.any(String), [CODEX_COMMAND]);
    });

    it('should resolve false when the check command errors', async () => {
      const checkProcess = new EventEmitter() as EventEmitter;
      spawnMock.mockReturnValue(checkProcess as any);

      const availablePromise = service.isAvailable();
      checkProcess.emit('error', new Error(SPAWN_ERROR_MESSAGE));

      await expect(availablePromise).resolves.toBe(false);
    });
  });

  describe('fetchUsageData', () => {
    it('should parse rate limits from a valid response', async () => {
      const serverProcess = createMockProcess();
      findCodexMock.mockResolvedValue(CODEX_PATH);
      spawnMock.mockReturnValue(serverProcess as any);

      const usagePromise = service.fetchUsageData();
      await flushPromises();

      writeLine(serverProcess, '');
      writeLine(serverProcess, INVALID_JSON_LINE);
      writeLine(serverProcess, JSON.stringify(NON_OBJECT_JSON));
      writeLine(serverProcess, JSON.stringify({ id: 1, result: {} }));
      writeLine(
        serverProcess,
        JSON.stringify({
          id: RATE_LIMITS_REQUEST_ID,
          result: buildRateLimitsPayload({
            secondary: null,
            credits: { balance: INVALID_BALANCE },
            planType: INVALID_PLAN_TYPE,
          }),
        })
      );

      const usage = await usagePromise;

      expect(usage.rateLimits.primary?.usedPercent).toBe(25);
      expect(usage.rateLimits.secondary).toBeNull();
      expect(usage.rateLimits.credits).toBeNull();
      expect(usage.rateLimits.planType).toBeNull();
      expect(spawnMock).toHaveBeenCalledWith(CODEX_PATH, ['app-server'], expect.any(Object));
    });

    it('should use snake_case rate limits when provided', async () => {
      const serverProcess = createMockProcess();
      findCodexMock.mockResolvedValue(null);
      spawnMock.mockReturnValue(serverProcess as any);

      const usagePromise = service.fetchUsageData();
      await flushPromises();

      writeLine(
        serverProcess,
        JSON.stringify({
          id: RATE_LIMITS_REQUEST_ID,
          result: {
            rate_limits: buildRateLimitsPayload({
              planType: 'Business',
            }).rateLimits,
          },
        })
      );

      const usage = await usagePromise;

      expect(usage.rateLimits.planType).toBe(TEST_PLAN_TYPE);
      expect(spawnMock).toHaveBeenCalledWith(CODEX_COMMAND, ['app-server'], expect.any(Object));
    });

    it('should reject when the app server stdout is missing', async () => {
      const serverProcess = createMockProcess({ hasStdout: false });
      findCodexMock.mockResolvedValue(CODEX_PATH);
      spawnMock.mockReturnValue(serverProcess as any);

      await expect(service.fetchUsageData()).rejects.toThrow(ERROR_COMMAND_FAILED);
    });

    it('should reject when the app server stdin is missing', async () => {
      const serverProcess = createMockProcess({ hasStdin: false });
      findCodexMock.mockResolvedValue(CODEX_PATH);
      spawnMock.mockReturnValue(serverProcess as any);

      await expect(service.fetchUsageData()).rejects.toThrow(ERROR_COMMAND_FAILED);
    });

    it('should reject when the app server emits an error with a message', async () => {
      const serverProcess = createMockProcess();
      findCodexMock.mockResolvedValue(CODEX_PATH);
      spawnMock.mockReturnValue(serverProcess as any);

      const usagePromise = service.fetchUsageData();
      await flushPromises();
      serverProcess.emit('error', new Error(ERROR_MESSAGE));

      await expect(usagePromise).rejects.toThrow(ERROR_MESSAGE);
    });

    it('should reject when the app server emits an error with no message', async () => {
      const serverProcess = createMockProcess();
      findCodexMock.mockResolvedValue(CODEX_PATH);
      spawnMock.mockReturnValue(serverProcess as any);

      const usagePromise = service.fetchUsageData();
      await flushPromises();
      const error = new Error('');
      error.message = '';
      serverProcess.emit('error', error);

      await expect(usagePromise).rejects.toThrow(ERROR_COMMAND_FAILED);
    });

    it('should reject with stderr output when the app server exits with an error', async () => {
      const serverProcess = createMockProcess();
      findCodexMock.mockResolvedValue(CODEX_PATH);
      spawnMock.mockReturnValue(serverProcess as any);

      const usagePromise = service.fetchUsageData();
      await flushPromises();
      serverProcess.stderr?.write(STDERR_MESSAGE);
      serverProcess.emit('exit', EXIT_ERROR_CODE);

      await expect(usagePromise).rejects.toThrow(STDERR_MESSAGE);
    });

    it('should reject with no response when the app server exits cleanly', async () => {
      const serverProcess = createMockProcess();
      findCodexMock.mockResolvedValue(CODEX_PATH);
      spawnMock.mockReturnValue(serverProcess as any);

      const usagePromise = service.fetchUsageData();
      await flushPromises();
      serverProcess.emit('exit', EXIT_SUCCESS_CODE);

      await expect(usagePromise).rejects.toThrow(ERROR_NO_RESPONSE);
    });

    it('should reject when the response contains an error object', async () => {
      const serverProcess = createMockProcess();
      findCodexMock.mockResolvedValue(CODEX_PATH);
      spawnMock.mockReturnValue(serverProcess as any);

      const usagePromise = service.fetchUsageData();
      await flushPromises();
      writeLine(
        serverProcess,
        JSON.stringify({
          id: RATE_LIMITS_REQUEST_ID,
          error: {
            message: ERROR_MESSAGE,
          },
        })
      );

      await expect(usagePromise).rejects.toThrow(ERROR_MESSAGE);
    });

    it('should reject when the response error message is invalid', async () => {
      const serverProcess = createMockProcess();
      findCodexMock.mockResolvedValue(CODEX_PATH);
      spawnMock.mockReturnValue(serverProcess as any);

      const usagePromise = service.fetchUsageData();
      await flushPromises();
      writeLine(
        serverProcess,
        JSON.stringify({
          id: RATE_LIMITS_REQUEST_ID,
          error: {
            message: 123,
          },
        })
      );

      await expect(usagePromise).rejects.toThrow(ERROR_COMMAND_FAILED);
    });

    it('should reject when the response is missing a result', async () => {
      const serverProcess = createMockProcess();
      findCodexMock.mockResolvedValue(CODEX_PATH);
      spawnMock.mockReturnValue(serverProcess as any);

      const usagePromise = service.fetchUsageData();
      await flushPromises();
      writeLine(serverProcess, JSON.stringify({ id: RATE_LIMITS_REQUEST_ID }));

      await expect(usagePromise).rejects.toThrow(ERROR_INVALID_RESPONSE);
    });

    it('should reject when the rate limits payload is invalid', async () => {
      const serverProcess = createMockProcess();
      findCodexMock.mockResolvedValue(CODEX_PATH);
      spawnMock.mockReturnValue(serverProcess as any);

      const usagePromise = service.fetchUsageData();
      await flushPromises();
      writeLine(
        serverProcess,
        JSON.stringify({
          id: RATE_LIMITS_REQUEST_ID,
          result: { rateLimits: INVALID_RATE_LIMITS },
        })
      );

      await expect(usagePromise).rejects.toThrow(ERROR_INVALID_RESPONSE);
    });

    it('should reject on timeout when the app server does not respond', async () => {
      vi.useFakeTimers();
      const serverProcess = createMockProcess();
      findCodexMock.mockResolvedValue(CODEX_PATH);
      spawnMock.mockReturnValue(serverProcess as any);

      const usagePromise = service.fetchUsageData();
      const rejectionExpectation = expect(usagePromise).rejects.toThrow(ERROR_TIMEOUT);

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS + 1);

      await rejectionExpectation;
    });
  });
});
