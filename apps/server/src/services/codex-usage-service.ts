import { spawn } from 'child_process';
import readline from 'readline';
import { findCodexCliPath } from '@automaker/platform';
import type {
  CodexCreditsSnapshot,
  CodexPlanType,
  CodexRateLimitWindow,
  CodexRateLimits,
  CodexUsage,
} from '../routes/codex/types.js';

const CODEX_COMMAND = 'codex';
const COMMAND_TIMEOUT_MS = 20000;
const INIT_REQUEST_ID = 1;
const RATE_LIMITS_REQUEST_ID = 2;
const INITIALIZE_METHOD = 'initialize';
const RATE_LIMITS_METHOD = 'account/rateLimits/read';
const CLIENT_NAME = 'automaker';
const CLIENT_VERSION = '0.7.3';
const EXIT_SUCCESS_CODE = 0;
const TERM_SIGNAL = 'SIGTERM';
const ERROR_TIMEOUT = 'Codex usage request timed out';
const ERROR_NO_RESPONSE = 'Codex usage response missing';
const ERROR_COMMAND_FAILED = 'Codex app server failed';
const ERROR_INVALID_RESPONSE = 'Codex usage response was invalid';
const PLAN_TYPE_DEFAULT: CodexPlanType = 'unknown';
const PLAN_TYPE_VALUES: CodexPlanType[] = [
  'free',
  'plus',
  'pro',
  'team',
  'business',
  'enterprise',
  'edu',
  'unknown',
];
const PLAN_TYPE_SET = new Set(PLAN_TYPE_VALUES);

export class CodexUsageService {
  private timeout = COMMAND_TIMEOUT_MS;

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const checkCommand = process.platform === 'win32' ? 'where' : 'which';
      const checkProcess = spawn(checkCommand, [CODEX_COMMAND]);
      checkProcess.on('close', (code) => resolve(code === EXIT_SUCCESS_CODE));
      checkProcess.on('error', () => resolve(false));
    });
  }

  async fetchUsageData(): Promise<CodexUsage> {
    const rateLimits = await this.fetchRateLimits();
    return {
      rateLimits,
      lastUpdated: new Date().toISOString(),
    };
  }

  private async fetchRateLimits(): Promise<CodexRateLimits> {
    const commandPath = (await findCodexCliPath()) || CODEX_COMMAND;

    return new Promise((resolve, reject) => {
      const serverProcess = spawn(commandPath, ['app-server'], {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (!serverProcess.stdout) {
        reject(new Error(ERROR_COMMAND_FAILED));
        return;
      }

      const lineReader = readline.createInterface({ input: serverProcess.stdout });
      let settled = false;
      let stderrOutput = '';

      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          serverProcess.kill(TERM_SIGNAL);
          reject(new Error(ERROR_TIMEOUT));
        }
      }, this.timeout);

      const cleanup = () => {
        clearTimeout(timeoutId);
        lineReader.removeAllListeners();
        serverProcess.stdout?.removeAllListeners();
        serverProcess.stderr?.removeAllListeners();
        serverProcess.removeAllListeners();
      };

      const finish = (error?: Error, result?: CodexRateLimits) => {
        if (settled) return;
        settled = true;
        cleanup();
        serverProcess.kill(TERM_SIGNAL);
        if (error) {
          reject(error);
          return;
        }
        if (!result) {
          reject(new Error(ERROR_NO_RESPONSE));
          return;
        }
        resolve(result);
      };

      serverProcess.on('error', (error) => {
        finish(new Error(error.message || ERROR_COMMAND_FAILED));
      });

      serverProcess.on('exit', (code) => {
        if (settled) return;
        if (code !== null && code !== EXIT_SUCCESS_CODE) {
          finish(new Error(stderrOutput || ERROR_COMMAND_FAILED));
          return;
        }
        finish(new Error(ERROR_NO_RESPONSE));
      });

      serverProcess.stderr?.on('data', (data: Buffer) => {
        stderrOutput += data.toString();
      });

      if (!serverProcess.stdin) {
        finish(new Error(ERROR_COMMAND_FAILED));
        return;
      }

      const send = (payload: Record<string, unknown>) => {
        serverProcess.stdin.write(`${JSON.stringify(payload)}\n`);
      };

      send({
        id: INIT_REQUEST_ID,
        method: INITIALIZE_METHOD,
        params: {
          clientInfo: {
            name: CLIENT_NAME,
            version: CLIENT_VERSION,
          },
        },
      });

      send({
        id: RATE_LIMITS_REQUEST_ID,
        method: RATE_LIMITS_METHOD,
      });

      lineReader.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let message: unknown;
        try {
          message = JSON.parse(trimmed);
        } catch {
          return;
        }

        if (!message || typeof message !== 'object') {
          return;
        }

        const record = message as Record<string, unknown>;
        const id = record.id;
        if (id !== RATE_LIMITS_REQUEST_ID) return;

        if (record.error && typeof record.error === 'object') {
          const errorRecord = record.error as Record<string, unknown>;
          const messageText =
            typeof errorRecord.message === 'string' ? errorRecord.message : ERROR_COMMAND_FAILED;
          finish(new Error(messageText));
          return;
        }

        if (!('result' in record)) {
          finish(new Error(ERROR_INVALID_RESPONSE));
          return;
        }

        const rateLimits = extractRateLimits(record.result);
        if (!rateLimits) {
          finish(new Error(ERROR_INVALID_RESPONSE));
          return;
        }

        finish(undefined, rateLimits);
      });
    });
  }
}

function extractRateLimits(result: unknown): CodexRateLimits | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const record = result as Record<string, unknown>;
  const candidate = (record.rateLimits ?? record.rate_limits) as unknown;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const limits = candidate as Record<string, unknown>;
  return {
    primary: normalizeRateLimitWindow(limits.primary),
    secondary: normalizeRateLimitWindow(limits.secondary),
    credits: normalizeCredits(limits.credits),
    planType: normalizePlanType(limits.planType),
  };
}

function normalizeRateLimitWindow(value: unknown): CodexRateLimitWindow | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const usedPercent = typeof record.usedPercent === 'number' ? record.usedPercent : null;
  if (usedPercent === null || Number.isNaN(usedPercent)) {
    return null;
  }

  return {
    usedPercent,
    windowDurationMins:
      typeof record.windowDurationMins === 'number' ? record.windowDurationMins : null,
    resetsAt: typeof record.resetsAt === 'number' ? record.resetsAt : null,
  };
}

function normalizeCredits(value: unknown): CodexCreditsSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.hasCredits !== 'boolean' || typeof record.unlimited !== 'boolean') {
    return null;
  }
  return {
    balance: typeof record.balance === 'string' ? record.balance : null,
    hasCredits: record.hasCredits,
    unlimited: record.unlimited,
  };
}

function normalizePlanType(value: unknown): CodexPlanType | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.toLowerCase();
  if (PLAN_TYPE_SET.has(normalized as CodexPlanType)) {
    return normalized as CodexPlanType;
  }
  return PLAN_TYPE_DEFAULT;
}
