import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockExpressContext } from '../../utils/mocks.js';
import fs from 'fs';
import path from 'path';

/**
 * Note: auth.ts reads AUTOMAKER_API_KEY at module load time.
 * We need to reset modules and reimport for each test to get fresh state.
 */
describe('auth.ts', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AUTOMAKER_API_KEY;
    delete process.env.AUTOMAKER_HIDE_API_KEY;
    delete process.env.NODE_ENV;
  });

  describe('authMiddleware', () => {
    it('should reject request without any authentication', async () => {
      const { authMiddleware } = await import('@/lib/auth.js');
      const { req, res, next } = createMockExpressContext();

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required.',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid API key', async () => {
      process.env.AUTOMAKER_API_KEY = 'test-secret-key';

      const { authMiddleware } = await import('@/lib/auth.js');
      const { req, res, next } = createMockExpressContext();
      req.headers['x-api-key'] = 'wrong-key';

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid API key.',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() with valid API key', async () => {
      process.env.AUTOMAKER_API_KEY = 'test-secret-key';

      const { authMiddleware } = await import('@/lib/auth.js');
      const { req, res, next } = createMockExpressContext();
      req.headers['x-api-key'] = 'test-secret-key';

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should authenticate with session token in header', async () => {
      const { authMiddleware, createSession } = await import('@/lib/auth.js');
      const token = await createSession();
      const { req, res, next } = createMockExpressContext();
      req.headers['x-session-token'] = token;

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject invalid session token in header', async () => {
      const { authMiddleware } = await import('@/lib/auth.js');
      const { req, res, next } = createMockExpressContext();
      req.headers['x-session-token'] = 'invalid-token';

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired session token.',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should authenticate with API key in query parameter', async () => {
      process.env.AUTOMAKER_API_KEY = 'test-secret-key';

      const { authMiddleware } = await import('@/lib/auth.js');
      const { req, res, next } = createMockExpressContext();
      req.query.apiKey = 'test-secret-key';

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should authenticate with session cookie', async () => {
      const { authMiddleware, createSession, getSessionCookieName } = await import('@/lib/auth.js');
      const token = await createSession();
      const cookieName = getSessionCookieName();
      const { req, res, next } = createMockExpressContext();
      req.cookies = { [cookieName]: token };

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('createSession', () => {
    it('should create a new session and return token', async () => {
      const { createSession } = await import('@/lib/auth.js');
      const token = await createSession();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should create unique tokens for each session', async () => {
      const { createSession } = await import('@/lib/auth.js');
      const token1 = await createSession();
      const token2 = await createSession();

      expect(token1).not.toBe(token2);
    });
  });

  describe('validateSession', () => {
    it('should validate a valid session token', async () => {
      const { createSession, validateSession } = await import('@/lib/auth.js');
      const token = await createSession();

      expect(validateSession(token)).toBe(true);
    });

    it('should reject invalid session token', async () => {
      const { validateSession } = await import('@/lib/auth.js');

      expect(validateSession('invalid-token')).toBe(false);
    });

    it('should reject expired session token', async () => {
      vi.useFakeTimers();
      const { createSession, validateSession } = await import('@/lib/auth.js');
      const token = await createSession();

      // Advance time past session expiration (30 days)
      vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000);

      expect(validateSession(token)).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('invalidateSession', () => {
    it('should invalidate a session token', async () => {
      const { createSession, validateSession, invalidateSession } = await import('@/lib/auth.js');
      const token = await createSession();

      expect(validateSession(token)).toBe(true);
      await invalidateSession(token);
      expect(validateSession(token)).toBe(false);
    });
  });

  describe('createWsConnectionToken', () => {
    it('should create a WebSocket connection token', async () => {
      const { createWsConnectionToken } = await import('@/lib/auth.js');
      const token = createWsConnectionToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should create unique tokens', async () => {
      const { createWsConnectionToken } = await import('@/lib/auth.js');
      const token1 = createWsConnectionToken();
      const token2 = createWsConnectionToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe('validateWsConnectionToken', () => {
    it('should validate a valid WebSocket token', async () => {
      const { createWsConnectionToken, validateWsConnectionToken } = await import('@/lib/auth.js');
      const token = createWsConnectionToken();

      expect(validateWsConnectionToken(token)).toBe(true);
    });

    it('should reject invalid WebSocket token', async () => {
      const { validateWsConnectionToken } = await import('@/lib/auth.js');

      expect(validateWsConnectionToken('invalid-token')).toBe(false);
    });

    it('should reject expired WebSocket token', async () => {
      vi.useFakeTimers();
      const { createWsConnectionToken, validateWsConnectionToken } = await import('@/lib/auth.js');
      const token = createWsConnectionToken();

      // Advance time past token expiration (5 minutes)
      vi.advanceTimersByTime(6 * 60 * 1000);

      expect(validateWsConnectionToken(token)).toBe(false);
      vi.useRealTimers();
    });

    it('should invalidate token after first use (single-use)', async () => {
      const { createWsConnectionToken, validateWsConnectionToken } = await import('@/lib/auth.js');
      const token = createWsConnectionToken();

      expect(validateWsConnectionToken(token)).toBe(true);
      // Token should be deleted after first use
      expect(validateWsConnectionToken(token)).toBe(false);
    });
  });

  describe('validateApiKey', () => {
    it('should validate correct API key', async () => {
      process.env.AUTOMAKER_API_KEY = 'test-secret-key';

      const { validateApiKey } = await import('@/lib/auth.js');

      expect(validateApiKey('test-secret-key')).toBe(true);
    });

    it('should reject incorrect API key', async () => {
      process.env.AUTOMAKER_API_KEY = 'test-secret-key';

      const { validateApiKey } = await import('@/lib/auth.js');

      expect(validateApiKey('wrong-key')).toBe(false);
    });

    it('should reject empty string', async () => {
      process.env.AUTOMAKER_API_KEY = 'test-secret-key';

      const { validateApiKey } = await import('@/lib/auth.js');

      expect(validateApiKey('')).toBe(false);
    });

    it('should reject null/undefined', async () => {
      process.env.AUTOMAKER_API_KEY = 'test-secret-key';

      const { validateApiKey } = await import('@/lib/auth.js');

      expect(validateApiKey(null as any)).toBe(false);
      expect(validateApiKey(undefined as any)).toBe(false);
    });

    it('should use timing-safe comparison for different lengths', async () => {
      process.env.AUTOMAKER_API_KEY = 'test-secret-key';

      const { validateApiKey } = await import('@/lib/auth.js');

      // Key with different length should be rejected without timing leak
      expect(validateApiKey('short')).toBe(false);
      expect(validateApiKey('very-long-key-that-does-not-match')).toBe(false);
    });
  });

  describe('getSessionCookieOptions', () => {
    it('should return cookie options with httpOnly true', async () => {
      const { getSessionCookieOptions } = await import('@/lib/auth.js');
      const options = getSessionCookieOptions();

      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('strict');
      expect(options.path).toBe('/');
      expect(options.maxAge).toBeGreaterThan(0);
    });

    it('should set secure to true in production', async () => {
      process.env.NODE_ENV = 'production';

      const { getSessionCookieOptions } = await import('@/lib/auth.js');
      const options = getSessionCookieOptions();

      expect(options.secure).toBe(true);
    });

    it('should set secure to false in non-production', async () => {
      process.env.NODE_ENV = 'development';

      const { getSessionCookieOptions } = await import('@/lib/auth.js');
      const options = getSessionCookieOptions();

      expect(options.secure).toBe(false);
    });
  });

  describe('getSessionCookieName', () => {
    it('should return the session cookie name', async () => {
      const { getSessionCookieName } = await import('@/lib/auth.js');
      const name = getSessionCookieName();

      expect(name).toBe('automaker_session');
    });
  });

  describe('isRequestAuthenticated', () => {
    it('should return true for authenticated request with API key', async () => {
      process.env.AUTOMAKER_API_KEY = 'test-secret-key';

      const { isRequestAuthenticated } = await import('@/lib/auth.js');
      const { req } = createMockExpressContext();
      req.headers['x-api-key'] = 'test-secret-key';

      expect(isRequestAuthenticated(req)).toBe(true);
    });

    it('should return false for unauthenticated request', async () => {
      const { isRequestAuthenticated } = await import('@/lib/auth.js');
      const { req } = createMockExpressContext();

      expect(isRequestAuthenticated(req)).toBe(false);
    });

    it('should return true for authenticated request with session token', async () => {
      const { isRequestAuthenticated, createSession } = await import('@/lib/auth.js');
      const token = await createSession();
      const { req } = createMockExpressContext();
      req.headers['x-session-token'] = token;

      expect(isRequestAuthenticated(req)).toBe(true);
    });
  });

  describe('checkRawAuthentication', () => {
    it('should return true for valid API key in headers', async () => {
      process.env.AUTOMAKER_API_KEY = 'test-secret-key';

      const { checkRawAuthentication } = await import('@/lib/auth.js');

      expect(checkRawAuthentication({ 'x-api-key': 'test-secret-key' }, {}, {})).toBe(true);
    });

    it('should return true for valid session token in headers', async () => {
      const { checkRawAuthentication, createSession } = await import('@/lib/auth.js');
      const token = await createSession();

      expect(checkRawAuthentication({ 'x-session-token': token }, {}, {})).toBe(true);
    });

    it('should return true for valid API key in query', async () => {
      process.env.AUTOMAKER_API_KEY = 'test-secret-key';

      const { checkRawAuthentication } = await import('@/lib/auth.js');

      expect(checkRawAuthentication({}, { apiKey: 'test-secret-key' }, {})).toBe(true);
    });

    it('should return true for valid session cookie', async () => {
      const { checkRawAuthentication, createSession, getSessionCookieName } =
        await import('@/lib/auth.js');
      const token = await createSession();
      const cookieName = getSessionCookieName();

      expect(checkRawAuthentication({}, {}, { [cookieName]: token })).toBe(true);
    });

    it('should return false for invalid credentials', async () => {
      const { checkRawAuthentication } = await import('@/lib/auth.js');

      expect(checkRawAuthentication({}, {}, {})).toBe(false);
    });
  });

  describe('isAuthEnabled', () => {
    it('should always return true (auth is always required)', async () => {
      const { isAuthEnabled } = await import('@/lib/auth.js');
      expect(isAuthEnabled()).toBe(true);
    });
  });

  describe('getAuthStatus', () => {
    it('should return enabled status with api_key_or_session method', async () => {
      const { getAuthStatus } = await import('@/lib/auth.js');
      const status = getAuthStatus();

      expect(status).toEqual({
        enabled: true,
        method: 'api_key_or_session',
      });
    });
  });
});
