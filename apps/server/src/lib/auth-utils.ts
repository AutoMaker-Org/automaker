/**
 * Secure authentication utilities that avoid environment variable race conditions
 */

import { spawn } from 'child_process';
import { createLogger } from '@automaker/utils';

const logger = createLogger('AuthUtils');

export interface SecureAuthEnv {
  [key: string]: string | undefined;
}

export interface AuthValidationResult {
  isValid: boolean;
  error?: string;
  normalizedKey?: string;
}

/**
 * Validates API key format without modifying process.env
 */
export function validateApiKey(
  key: string,
  provider: 'anthropic' | 'openai' | 'cursor'
): AuthValidationResult {
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    return { isValid: false, error: 'API key is required' };
  }

  const trimmedKey = key.trim();

  switch (provider) {
    case 'anthropic':
      if (!trimmedKey.startsWith('sk-ant-')) {
        return {
          isValid: false,
          error: 'Invalid Anthropic API key format. Should start with "sk-ant-"',
        };
      }
      if (trimmedKey.length < 20) {
        return { isValid: false, error: 'Anthropic API key too short' };
      }
      break;

    case 'openai':
      if (!trimmedKey.startsWith('sk-')) {
        return { isValid: false, error: 'Invalid OpenAI API key format. Should start with "sk-"' };
      }
      if (trimmedKey.length < 20) {
        return { isValid: false, error: 'OpenAI API key too short' };
      }
      break;

    case 'cursor':
      // Cursor API keys might have different format
      if (trimmedKey.length < 10) {
        return { isValid: false, error: 'Cursor API key too short' };
      }
      break;
  }

  return { isValid: true, normalizedKey: trimmedKey };
}

/**
 * Creates a secure environment object for authentication testing
 * without modifying the global process.env
 */
export function createSecureAuthEnv(
  authMethod: 'cli' | 'api_key',
  apiKey?: string,
  provider: 'anthropic' | 'openai' | 'cursor' = 'anthropic'
): SecureAuthEnv {
  const env: SecureAuthEnv = { ...process.env };

  if (authMethod === 'cli') {
    // For CLI auth, remove the API key to force CLI authentication
    const envKey = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
    delete env[envKey];
  } else if (authMethod === 'api_key' && apiKey) {
    // For API key auth, validate and set the provided key
    const validation = validateApiKey(apiKey, provider);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }
    const envKey = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
    env[envKey] = validation.normalizedKey;
  }

  return env;
}

/**
 * Creates a temporary environment override for the current process
 * WARNING: This should only be used in isolated contexts and immediately cleaned up
 */
export function createTempEnvOverride(authEnv: SecureAuthEnv): () => void {
  const originalEnv = { ...process.env };

  // Apply the auth environment
  Object.assign(process.env, authEnv);

  // Return cleanup function
  return () => {
    // Restore original environment
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  };
}

/**
 * Spawns a process with secure environment isolation
 */
export function spawnSecureAuth(
  command: string,
  args: string[],
  authEnv: SecureAuthEnv,
  options: {
    cwd?: string;
    timeout?: number;
  } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const { cwd = process.cwd(), timeout = 30000 } = options;

    logger.debug(`Spawning secure auth process: ${command} ${args.join(' ')}`);

    const child = spawn(command, args, {
      cwd,
      env: authEnv,
      stdio: 'pipe',
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let isResolved = false;

    const timeoutId = setTimeout(() => {
      if (!isResolved) {
        child.kill('SIGTERM');
        isResolved = true;
        reject(new Error('Authentication process timed out'));
      }
    }, timeout);

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      if (!isResolved) {
        isResolved = true;
        resolve({ stdout, stderr, exitCode: code });
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      if (!isResolved) {
        isResolved = true;
        reject(error);
      }
    });
  });
}

/**
 * Safely extracts environment variable without race conditions
 */
export function safeGetEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * Checks if an environment variable would be modified without actually modifying it
 */
export function wouldModifyEnv(key: string, newValue: string): boolean {
  const currentValue = safeGetEnv(key);
  return currentValue !== newValue;
}

/**
 * Secure auth session management
 */
export class AuthSessionManager {
  private static activeSessions = new Map<string, SecureAuthEnv>();

  static createSession(
    sessionId: string,
    authMethod: 'cli' | 'api_key',
    apiKey?: string,
    provider: 'anthropic' | 'openai' | 'cursor' = 'anthropic'
  ): SecureAuthEnv {
    const env = createSecureAuthEnv(authMethod, apiKey, provider);
    this.activeSessions.set(sessionId, env);
    return env;
  }

  static getSession(sessionId: string): SecureAuthEnv | undefined {
    return this.activeSessions.get(sessionId);
  }

  static destroySession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }

  static cleanup(): void {
    this.activeSessions.clear();
  }
}

/**
 * Rate limiting for auth attempts to prevent abuse
 */
export class AuthRateLimiter {
  private attempts = new Map<string, { count: number; lastAttempt: number }>();

  constructor(
    private maxAttempts = 5,
    private windowMs = 60000
  ) {}

  canAttempt(identifier: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(identifier);

    if (!record || now - record.lastAttempt > this.windowMs) {
      this.attempts.set(identifier, { count: 1, lastAttempt: now });
      return true;
    }

    if (record.count >= this.maxAttempts) {
      return false;
    }

    record.count++;
    record.lastAttempt = now;
    return true;
  }

  getRemainingAttempts(identifier: string): number {
    const record = this.attempts.get(identifier);
    if (!record) return this.maxAttempts;
    return Math.max(0, this.maxAttempts - record.count);
  }

  getResetTime(identifier: string): Date | null {
    const record = this.attempts.get(identifier);
    if (!record) return null;
    return new Date(record.lastAttempt + this.windowMs);
  }
}
