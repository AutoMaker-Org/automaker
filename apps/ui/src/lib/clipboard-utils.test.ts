/**
 * Unit tests for clipboard utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeToClipboard, readFromClipboard } from './clipboard-utils';

describe('clipboard-utils', () => {
  // Store original values to restore after tests
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore globals
    globalThis.navigator = originalNavigator;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  });

  describe('writeToClipboard', () => {
    describe('with modern Clipboard API available', () => {
      beforeEach(() => {
        // Mock secure context with clipboard API
        Object.defineProperty(globalThis, 'navigator', {
          value: {
            clipboard: {
              writeText: vi.fn().mockResolvedValue(undefined),
              readText: vi.fn().mockResolvedValue(''),
            },
          },
          writable: true,
          configurable: true,
        });
        Object.defineProperty(globalThis, 'window', {
          value: { isSecureContext: true },
          writable: true,
          configurable: true,
        });
      });

      it('should use modern Clipboard API when available', async () => {
        const result = await writeToClipboard('test text');
        expect(result).toBe(true);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test text');
      });

      it('should return true on successful write', async () => {
        const result = await writeToClipboard('hello world');
        expect(result).toBe(true);
      });

      it('should handle empty string', async () => {
        const result = await writeToClipboard('');
        expect(result).toBe(true);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('');
      });

      it('should handle special characters', async () => {
        const specialText = '{{workflow.variable}} \n\t <>&"\'';
        const result = await writeToClipboard(specialText);
        expect(result).toBe(true);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(specialText);
      });
    });

    describe('with Clipboard API failure', () => {
      beforeEach(() => {
        // Mock secure context with failing clipboard API
        Object.defineProperty(globalThis, 'navigator', {
          value: {
            clipboard: {
              writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
              readText: vi.fn().mockResolvedValue(''),
            },
          },
          writable: true,
          configurable: true,
        });
        Object.defineProperty(globalThis, 'window', {
          value: { isSecureContext: true },
          writable: true,
          configurable: true,
        });
      });

      it('should fall back to legacy approach when Clipboard API fails', async () => {
        // Mock document for legacy approach
        const mockTextarea = {
          value: '',
          style: {},
          select: vi.fn(),
          setSelectionRange: vi.fn(),
        };
        const mockBody = {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        };
        Object.defineProperty(globalThis, 'document', {
          value: {
            createElement: vi.fn().mockReturnValue(mockTextarea),
            body: mockBody,
            execCommand: vi.fn().mockReturnValue(true),
          },
          writable: true,
          configurable: true,
        });

        const result = await writeToClipboard('test text');
        expect(result).toBe(true);
        expect(document.createElement).toHaveBeenCalledWith('textarea');
        expect(document.execCommand).toHaveBeenCalledWith('copy');
      });
    });

    describe('without Clipboard API (insecure context)', () => {
      beforeEach(() => {
        // Mock insecure context (no clipboard API)
        Object.defineProperty(globalThis, 'navigator', {
          value: {},
          writable: true,
          configurable: true,
        });
        Object.defineProperty(globalThis, 'window', {
          value: { isSecureContext: false },
          writable: true,
          configurable: true,
        });
      });

      it('should use legacy approach when Clipboard API not available', async () => {
        // Mock document for legacy approach
        const mockTextarea = {
          value: '',
          style: { position: '', left: '', top: '', opacity: '' },
          select: vi.fn(),
          setSelectionRange: vi.fn(),
        };
        const mockBody = {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        };
        Object.defineProperty(globalThis, 'document', {
          value: {
            createElement: vi.fn().mockReturnValue(mockTextarea),
            body: mockBody,
            execCommand: vi.fn().mockReturnValue(true),
          },
          writable: true,
          configurable: true,
        });

        const result = await writeToClipboard('test text');
        expect(result).toBe(true);
        expect(document.createElement).toHaveBeenCalledWith('textarea');
        expect(mockBody.appendChild).toHaveBeenCalled();
        expect(mockTextarea.select).toHaveBeenCalled();
        expect(document.execCommand).toHaveBeenCalledWith('copy');
        expect(mockBody.removeChild).toHaveBeenCalled();
      });

      it('should return false when legacy approach fails', async () => {
        // Mock document for failing legacy approach
        const mockTextarea = {
          value: '',
          style: {},
          select: vi.fn(),
          setSelectionRange: vi.fn(),
        };
        const mockBody = {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        };
        Object.defineProperty(globalThis, 'document', {
          value: {
            createElement: vi.fn().mockReturnValue(mockTextarea),
            body: mockBody,
            execCommand: vi.fn().mockReturnValue(false),
          },
          writable: true,
          configurable: true,
        });

        const result = await writeToClipboard('test text');
        expect(result).toBe(false);
      });

      it('should return false when execCommand throws', async () => {
        // Mock document with throwing execCommand
        const mockTextarea = {
          value: '',
          style: {},
          select: vi.fn(),
          setSelectionRange: vi.fn(),
        };
        const mockBody = {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        };
        Object.defineProperty(globalThis, 'document', {
          value: {
            createElement: vi.fn().mockReturnValue(mockTextarea),
            body: mockBody,
            execCommand: vi.fn().mockImplementation(() => {
              throw new Error('Not allowed');
            }),
          },
          writable: true,
          configurable: true,
        });

        const result = await writeToClipboard('test text');
        expect(result).toBe(false);
        // Ensure cleanup happened even on error
        expect(mockBody.removeChild).toHaveBeenCalled();
      });
    });
  });

  describe('readFromClipboard', () => {
    describe('with modern Clipboard API available', () => {
      beforeEach(() => {
        // Mock secure context with clipboard API
        Object.defineProperty(globalThis, 'navigator', {
          value: {
            clipboard: {
              writeText: vi.fn().mockResolvedValue(undefined),
              readText: vi.fn().mockResolvedValue('clipboard content'),
            },
          },
          writable: true,
          configurable: true,
        });
        Object.defineProperty(globalThis, 'window', {
          value: { isSecureContext: true },
          writable: true,
          configurable: true,
        });
      });

      it('should use modern Clipboard API when available', async () => {
        const result = await readFromClipboard();
        expect(result).toBe('clipboard content');
        expect(navigator.clipboard.readText).toHaveBeenCalled();
      });

      it('should return empty string when clipboard is empty', async () => {
        navigator.clipboard.readText = vi.fn().mockResolvedValue('');

        const result = await readFromClipboard();
        expect(result).toBe('');
      });
    });

    describe('with Clipboard API permission denied', () => {
      beforeEach(() => {
        // Mock secure context with permission denied
        const notAllowedError = new Error('Permission denied');
        notAllowedError.name = 'NotAllowedError';

        Object.defineProperty(globalThis, 'navigator', {
          value: {
            clipboard: {
              writeText: vi.fn().mockResolvedValue(undefined),
              readText: vi.fn().mockRejectedValue(notAllowedError),
            },
          },
          writable: true,
          configurable: true,
        });
        Object.defineProperty(globalThis, 'window', {
          value: { isSecureContext: true },
          writable: true,
          configurable: true,
        });
      });

      it('should throw NotAllowedError on permission denied', async () => {
        await expect(readFromClipboard()).rejects.toThrow('Permission denied');
      });
    });
  });
});
