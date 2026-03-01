import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NtfyService } from '../../../src/services/ntfy-service.js';
import type { NtfyEndpointConfig } from '@automaker/types';

// Mock global fetch
const originalFetch = global.fetch;

describe('NtfyService', () => {
  let service: NtfyService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new NtfyService();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  /**
   * Create a valid endpoint config for testing
   */
  function createEndpoint(overrides: Partial<NtfyEndpointConfig> = {}): NtfyEndpointConfig {
    return {
      id: 'test-endpoint-id',
      name: 'Test Endpoint',
      serverUrl: 'https://ntfy.sh',
      topic: 'test-topic',
      authType: 'none',
      enabled: true,
      ...overrides,
    };
  }

  /**
   * Create a basic context for testing
   */
  function createContext() {
    return {
      featureId: 'feat-123',
      featureName: 'Test Feature',
      projectPath: '/test/project',
      projectName: 'test-project',
      timestamp: '2024-01-15T10:30:00.000Z',
      eventType: 'feature_success',
    };
  }

  describe('validateEndpoint', () => {
    it('should return null for valid endpoint with no auth', () => {
      const endpoint = createEndpoint();
      const result = service.validateEndpoint(endpoint);
      expect(result).toBeNull();
    });

    it('should return null for valid endpoint with basic auth', () => {
      const endpoint = createEndpoint({
        authType: 'basic',
        username: 'user',
        password: 'pass',
      });
      const result = service.validateEndpoint(endpoint);
      expect(result).toBeNull();
    });

    it('should return null for valid endpoint with token auth', () => {
      const endpoint = createEndpoint({
        authType: 'token',
        token: 'tk_123456',
      });
      const result = service.validateEndpoint(endpoint);
      expect(result).toBeNull();
    });

    it('should return error when serverUrl is missing', () => {
      const endpoint = createEndpoint({ serverUrl: '' });
      const result = service.validateEndpoint(endpoint);
      expect(result).toBe('Server URL is required');
    });

    it('should return error when serverUrl is invalid', () => {
      const endpoint = createEndpoint({ serverUrl: 'not-a-valid-url' });
      const result = service.validateEndpoint(endpoint);
      expect(result).toBe('Invalid server URL format');
    });

    it('should return error when topic is missing', () => {
      const endpoint = createEndpoint({ topic: '' });
      const result = service.validateEndpoint(endpoint);
      expect(result).toBe('Topic is required');
    });

    it('should return error when topic contains spaces', () => {
      const endpoint = createEndpoint({ topic: 'invalid topic' });
      const result = service.validateEndpoint(endpoint);
      expect(result).toBe('Topic cannot contain spaces');
    });

    it('should return error when topic contains tabs', () => {
      const endpoint = createEndpoint({ topic: 'invalid\ttopic' });
      const result = service.validateEndpoint(endpoint);
      expect(result).toBe('Topic cannot contain spaces');
    });

    it('should return error when basic auth is missing username', () => {
      const endpoint = createEndpoint({
        authType: 'basic',
        username: '',
        password: 'pass',
      });
      const result = service.validateEndpoint(endpoint);
      expect(result).toBe('Username and password are required for basic authentication');
    });

    it('should return error when basic auth is missing password', () => {
      const endpoint = createEndpoint({
        authType: 'basic',
        username: 'user',
        password: '',
      });
      const result = service.validateEndpoint(endpoint);
      expect(result).toBe('Username and password are required for basic authentication');
    });

    it('should return error when token auth is missing token', () => {
      const endpoint = createEndpoint({
        authType: 'token',
        token: '',
      });
      const result = service.validateEndpoint(endpoint);
      expect(result).toBe('Access token is required for token authentication');
    });
  });

  describe('sendNotification', () => {
    it('should return error when endpoint is disabled', async () => {
      const endpoint = createEndpoint({ enabled: false });
      const result = await service.sendNotification(endpoint, {}, createContext());
      expect(result.success).toBe(false);
      expect(result.error).toBe('Endpoint is disabled');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return error when endpoint validation fails', async () => {
      const endpoint = createEndpoint({ serverUrl: '' });
      const result = await service.sendNotification(endpoint, {}, createContext());
      expect(result.success).toBe(false);
      expect(result.error).toBe('Server URL is required');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send notification with default values', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const endpoint = createEndpoint();
      const result = await service.sendNotification(endpoint, {}, createContext());

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://ntfy.sh/test-topic');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('text/plain; charset=utf-8');
      expect(options.headers['Title']).toContain('Feature Completed');
      expect(options.headers['Priority']).toBe('3');
    });

    it('should send notification with custom title and body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const endpoint = createEndpoint();
      const result = await service.sendNotification(
        endpoint,
        {
          title: 'Custom Title',
          body: 'Custom body message',
        },
        createContext()
      );

      expect(result.success).toBe(true);
      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Title']).toBe('Custom Title');
      expect(options.body).toBe('Custom body message');
    });

    it('should send notification with tags and emoji', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const endpoint = createEndpoint();
      const result = await service.sendNotification(
        endpoint,
        {
          tags: 'warning,skull',
          emoji: 'tada',
        },
        createContext()
      );

      expect(result.success).toBe(true);
      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Tags']).toBe('tada,warning,skull');
    });

    it('should send notification with priority', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const endpoint = createEndpoint();
      const result = await service.sendNotification(endpoint, { priority: 5 }, createContext());

      expect(result.success).toBe(true);
      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Priority']).toBe('5');
    });

    it('should send notification with click URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const endpoint = createEndpoint();
      const result = await service.sendNotification(
        endpoint,
        { clickUrl: 'https://example.com/feature/123' },
        createContext()
      );

      expect(result.success).toBe(true);
      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Click']).toBe('https://example.com/feature/123');
    });

    it('should use endpoint default tags and emoji when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const endpoint = createEndpoint({
        defaultTags: 'default-tag',
        defaultEmoji: 'rocket',
      });
      const result = await service.sendNotification(endpoint, {}, createContext());

      expect(result.success).toBe(true);
      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Tags']).toBe('rocket,default-tag');
    });

    it('should use endpoint default click URL when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const endpoint = createEndpoint({
        defaultClickUrl: 'https://default.example.com',
      });
      const result = await service.sendNotification(endpoint, {}, createContext());

      expect(result.success).toBe(true);
      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Click']).toBe('https://default.example.com');
    });

    it('should send notification with basic authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const endpoint = createEndpoint({
        authType: 'basic',
        username: 'testuser',
        password: 'testpass',
      });
      const result = await service.sendNotification(endpoint, {}, createContext());

      expect(result.success).toBe(true);
      const options = mockFetch.mock.calls[0][1];
      // Basic auth should be base64 encoded
      const expectedAuth = Buffer.from('testuser:testpass').toString('base64');
      expect(options.headers['Authorization']).toBe(`Basic ${expectedAuth}`);
    });

    it('should send notification with token authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const endpoint = createEndpoint({
        authType: 'token',
        token: 'tk_test_token_123',
      });
      const result = await service.sendNotification(endpoint, {}, createContext());

      expect(result.success).toBe(true);
      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Authorization']).toBe('Bearer tk_test_token_123');
    });

    it('should return error on HTTP error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden - invalid token'),
      });

      const endpoint = createEndpoint();
      const result = await service.sendNotification(endpoint, {}, createContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('403');
      expect(result.error).toContain('Forbidden');
    });

    it('should return error on timeout', async () => {
      mockFetch.mockImplementationOnce(() => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        throw error;
      });

      const endpoint = createEndpoint();
      const result = await service.sendNotification(endpoint, {}, createContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Request timed out');
    });

    it('should return error on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const endpoint = createEndpoint();
      const result = await service.sendNotification(endpoint, {}, createContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle server URL with trailing slash', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const endpoint = createEndpoint({ serverUrl: 'https://ntfy.sh/' });
      await service.sendNotification(endpoint, {}, createContext());

      const url = mockFetch.mock.calls[0][0];
      expect(url).toBe('https://ntfy.sh/test-topic');
    });

    it('should URL encode the topic', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const endpoint = createEndpoint({ topic: 'test/topic#special' });
      await service.sendNotification(endpoint, {}, createContext());

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('test%2Ftopic%23special');
    });
  });

  describe('variable substitution', () => {
    it('should substitute {{featureId}} in title', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      await service.sendNotification(
        endpoint,
        { title: 'Feature {{featureId}} completed' },
        createContext()
      );

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Title']).toBe('Feature feat-123 completed');
    });

    it('should substitute {{featureName}} in body', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      await service.sendNotification(
        endpoint,
        { body: 'The feature "{{featureName}}" is done!' },
        createContext()
      );

      const options = mockFetch.mock.calls[0][1];
      expect(options.body).toBe('The feature "Test Feature" is done!');
    });

    it('should substitute {{projectName}} in title', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      await service.sendNotification(
        endpoint,
        { title: '[{{projectName}}] Event: {{eventType}}' },
        createContext()
      );

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Title']).toBe('[test-project] Event: feature_success');
    });

    it('should substitute {{timestamp}} in body', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      await service.sendNotification(
        endpoint,
        { body: 'Completed at: {{timestamp}}' },
        createContext()
      );

      const options = mockFetch.mock.calls[0][1];
      expect(options.body).toBe('Completed at: 2024-01-15T10:30:00.000Z');
    });

    it('should substitute {{error}} in body for error events', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      const context = {
        ...createContext(),
        eventType: 'feature_error',
        error: 'Something went wrong',
      };
      await service.sendNotification(endpoint, { title: 'Error: {{error}}' }, context);

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Title']).toBe('Error: Something went wrong');
    });

    it('should substitute multiple variables', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      await service.sendNotification(
        endpoint,
        {
          title: '[{{projectName}}] {{featureName}}',
          body: 'Feature {{featureId}} completed at {{timestamp}}',
        },
        createContext()
      );

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Title']).toBe('[test-project] Test Feature');
      expect(options.body).toBe('Feature feat-123 completed at 2024-01-15T10:30:00.000Z');
    });

    it('should replace unknown variables with empty string', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      await service.sendNotification(
        endpoint,
        { title: 'Value: {{unknownVariable}}' },
        createContext()
      );

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Title']).toBe('Value: ');
    });
  });

  describe('default title generation', () => {
    it('should generate title with feature name for feature_success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      await service.sendNotification(endpoint, {}, createContext());

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Title']).toBe('Feature Completed: Test Feature');
    });

    it('should generate title without feature name when missing', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      const context = { ...createContext(), featureName: undefined };
      await service.sendNotification(endpoint, {}, context);

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Title']).toBe('Feature Completed');
    });

    it('should generate correct title for feature_created', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      const context = { ...createContext(), eventType: 'feature_created' };
      await service.sendNotification(endpoint, {}, context);

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Title']).toBe('Feature Created: Test Feature');
    });

    it('should generate correct title for feature_error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      const context = { ...createContext(), eventType: 'feature_error' };
      await service.sendNotification(endpoint, {}, context);

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Title']).toBe('Feature Failed: Test Feature');
    });

    it('should generate correct title for auto_mode_complete', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      const context = {
        ...createContext(),
        eventType: 'auto_mode_complete',
        featureName: undefined,
      };
      await service.sendNotification(endpoint, {}, context);

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Title']).toBe('Auto Mode Complete');
    });

    it('should generate correct title for auto_mode_error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      const context = { ...createContext(), eventType: 'auto_mode_error', featureName: undefined };
      await service.sendNotification(endpoint, {}, context);

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Title']).toBe('Auto Mode Error');
    });
  });

  describe('default body generation', () => {
    it('should generate body with feature info', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      await service.sendNotification(endpoint, {}, createContext());

      const options = mockFetch.mock.calls[0][1];
      expect(options.body).toContain('Feature: Test Feature');
      expect(options.body).toContain('ID: feat-123');
      expect(options.body).toContain('Project: test-project');
      expect(options.body).toContain('Time: 2024-01-15T10:30:00.000Z');
    });

    it('should include error in body for error events', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      const context = {
        ...createContext(),
        eventType: 'feature_error',
        error: 'Build failed',
      };
      await service.sendNotification(endpoint, {}, context);

      const options = mockFetch.mock.calls[0][1];
      expect(options.body).toContain('Error: Build failed');
    });
  });

  describe('emoji and tags handling', () => {
    it('should handle emoji shortcode with colons', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      await service.sendNotification(endpoint, { emoji: ':tada:' }, createContext());

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Tags']).toBe('tada');
    });

    it('should handle emoji without colons', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      await service.sendNotification(endpoint, { emoji: 'warning' }, createContext());

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Tags']).toBe('warning');
    });

    it('should combine emoji and tags correctly', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      await service.sendNotification(
        endpoint,
        { emoji: 'rotating_light', tags: 'urgent,alert' },
        createContext()
      );

      const options = mockFetch.mock.calls[0][1];
      // Emoji comes first, then tags
      expect(options.headers['Tags']).toBe('rotating_light,urgent,alert');
    });

    it('should ignore emoji with spaces', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const endpoint = createEndpoint();
      await service.sendNotification(
        endpoint,
        { emoji: 'multi word emoji', tags: 'test' },
        createContext()
      );

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Tags']).toBe('test');
    });
  });
});
