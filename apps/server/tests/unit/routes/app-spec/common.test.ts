import { describe, it, expect, beforeEach } from 'vitest';
import {
  setRunningState,
  getErrorMessage,
  getSpecRegenerationStatus,
} from '@/routes/app-spec/common.js';

const TEST_PROJECT_PATH = '/tmp/automaker-test-project';

describe('app-spec/common.ts', () => {
  beforeEach(() => {
    // Reset state before each test
    setRunningState(TEST_PROJECT_PATH, false, null);
  });

  describe('setRunningState', () => {
    it('should set isRunning to true when running is true', () => {
      setRunningState(TEST_PROJECT_PATH, true);
      expect(getSpecRegenerationStatus(TEST_PROJECT_PATH).isRunning).toBe(true);
    });

    it('should set isRunning to false when running is false', () => {
      setRunningState(TEST_PROJECT_PATH, true);
      setRunningState(TEST_PROJECT_PATH, false);
      expect(getSpecRegenerationStatus(TEST_PROJECT_PATH).isRunning).toBe(false);
    });

    it('should set currentAbortController when provided', () => {
      const controller = new AbortController();
      setRunningState(TEST_PROJECT_PATH, true, controller);
      expect(getSpecRegenerationStatus(TEST_PROJECT_PATH).currentAbortController).toBe(controller);
    });

    it('should set currentAbortController to null when not provided', () => {
      const controller = new AbortController();
      setRunningState(TEST_PROJECT_PATH, true, controller);
      setRunningState(TEST_PROJECT_PATH, false);
      expect(getSpecRegenerationStatus(TEST_PROJECT_PATH).currentAbortController).toBe(null);
    });

    it('should keep currentAbortController when explicitly passed null while running', () => {
      const controller = new AbortController();
      setRunningState(TEST_PROJECT_PATH, true, controller);
      setRunningState(TEST_PROJECT_PATH, true, null);
      expect(getSpecRegenerationStatus(TEST_PROJECT_PATH).currentAbortController).toBe(controller);
    });

    it('should update state multiple times correctly', () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      setRunningState(TEST_PROJECT_PATH, true, controller1);
      expect(getSpecRegenerationStatus(TEST_PROJECT_PATH).isRunning).toBe(true);
      expect(getSpecRegenerationStatus(TEST_PROJECT_PATH).currentAbortController).toBe(controller1);

      setRunningState(TEST_PROJECT_PATH, true, controller2);
      expect(getSpecRegenerationStatus(TEST_PROJECT_PATH).isRunning).toBe(true);
      expect(getSpecRegenerationStatus(TEST_PROJECT_PATH).currentAbortController).toBe(controller2);

      setRunningState(TEST_PROJECT_PATH, false, null);
      expect(getSpecRegenerationStatus(TEST_PROJECT_PATH).isRunning).toBe(false);
      expect(getSpecRegenerationStatus(TEST_PROJECT_PATH).currentAbortController).toBe(null);
    });
  });

  describe('getErrorMessage', () => {
    it('should return message from Error instance', () => {
      const error = new Error('Test error message');
      expect(getErrorMessage(error)).toBe('Test error message');
    });

    it("should return 'Unknown error' for non-Error objects", () => {
      expect(getErrorMessage('string error')).toBe('Unknown error');
      expect(getErrorMessage(123)).toBe('Unknown error');
      expect(getErrorMessage(null)).toBe('Unknown error');
      expect(getErrorMessage(undefined)).toBe('Unknown error');
      expect(getErrorMessage({})).toBe('Unknown error');
      expect(getErrorMessage([])).toBe('Unknown error');
    });

    it('should return message from Error with empty message', () => {
      const error = new Error('');
      expect(getErrorMessage(error)).toBe('');
    });

    it('should handle Error objects with custom properties', () => {
      const error = new Error('Base message');
      (error as any).customProp = 'custom value';
      expect(getErrorMessage(error)).toBe('Base message');
    });

    it('should handle Error objects created with different constructors', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const customError = new CustomError('Custom error message');
      expect(getErrorMessage(customError)).toBe('Custom error message');
    });
  });
});
