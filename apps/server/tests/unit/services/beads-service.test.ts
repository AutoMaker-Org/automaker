/**
 * Unit tests for BeadsService
 *
 * Tests the service layer that wraps the Beads CLI (bd).
 * Uses mocks to avoid spawning actual child processes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BeadsService } from '@/services/beads-service.js';

describe('BeadsService', () => {
  let beadsService: BeadsService;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDatabasePath', () => {
    beforeEach(() => {
      beadsService = new BeadsService();
    });

    it('should return correct database path', () => {
      const path = beadsService.getDatabasePath('/my/project');
      expect(path).toBe('/my/project/.beads/beads.db');
    });

    it('should handle paths with trailing slash', () => {
      const path = beadsService.getDatabasePath('/my/project/');
      expect(path).toBe('/my/project/.beads/beads.db');
    });
  });

  describe('isNotInitializedError', () => {
    it('should detect database not found error', () => {
      beadsService = new BeadsService();
      // Access private method through type assertion for testing
      const service = beadsService as any;
      expect(service.isNotInitializedError('Error: no such file or directory')).toBe(true);
      expect(service.isNotInitializedError('database not found')).toBe(true);
      expect(service.isNotInitializedError('beads not initialized')).toBe(true);
      expect(service.isNotInitializedError('permission denied')).toBe(false);
    });
  });
});
