import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  writeValidation,
  readValidation,
  getAllValidations,
  deleteValidation,
  isValidationStale,
  getValidationWithFreshness,
  markValidationViewed,
  getUnviewedValidationsCount,
  type StoredValidation,
} from '@/lib/validation-storage.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('validation-storage.ts', () => {
  let testProjectPath: string;

  beforeEach(async () => {
    testProjectPath = path.join(os.tmpdir(), `validation-storage-test-${Date.now()}`);
    await fs.mkdir(testProjectPath, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testProjectPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const createMockValidation = (overrides: Partial<StoredValidation> = {}): StoredValidation => ({
    issueNumber: 123,
    issueTitle: 'Test Issue',
    validatedAt: new Date().toISOString(),
    model: 'haiku',
    result: {
      verdict: 'valid',
      confidence: 'high',
      reasoning: 'Test reasoning',
    },
    ...overrides,
  });

  describe('writeValidation', () => {
    it('should write validation to storage', async () => {
      const validation = createMockValidation();

      await writeValidation(testProjectPath, 123, validation);

      // Verify file was created
      const validationPath = path.join(
        testProjectPath,
        '.automaker',
        'validations',
        '123',
        'validation.json'
      );
      const content = await fs.readFile(validationPath, 'utf-8');
      expect(JSON.parse(content)).toEqual(validation);
    });

    it('should create nested directories if they do not exist', async () => {
      const validation = createMockValidation({ issueNumber: 456 });

      await writeValidation(testProjectPath, 456, validation);

      const validationPath = path.join(
        testProjectPath,
        '.automaker',
        'validations',
        '456',
        'validation.json'
      );
      const content = await fs.readFile(validationPath, 'utf-8');
      expect(JSON.parse(content)).toEqual(validation);
    });
  });

  describe('readValidation', () => {
    it('should read validation from storage', async () => {
      const validation = createMockValidation();
      await writeValidation(testProjectPath, 123, validation);

      const result = await readValidation(testProjectPath, 123);

      expect(result).toEqual(validation);
    });

    it('should return null when validation does not exist', async () => {
      const result = await readValidation(testProjectPath, 999);

      expect(result).toBeNull();
    });
  });

  describe('getAllValidations', () => {
    it('should return all validations for a project', async () => {
      const validation1 = createMockValidation({ issueNumber: 1, issueTitle: 'Issue 1' });
      const validation2 = createMockValidation({ issueNumber: 2, issueTitle: 'Issue 2' });
      const validation3 = createMockValidation({ issueNumber: 3, issueTitle: 'Issue 3' });

      await writeValidation(testProjectPath, 1, validation1);
      await writeValidation(testProjectPath, 2, validation2);
      await writeValidation(testProjectPath, 3, validation3);

      const result = await getAllValidations(testProjectPath);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(validation1);
      expect(result[1]).toEqual(validation2);
      expect(result[2]).toEqual(validation3);
    });

    it('should return empty array when no validations exist', async () => {
      const result = await getAllValidations(testProjectPath);

      expect(result).toEqual([]);
    });

    it('should skip non-numeric directories', async () => {
      const validation = createMockValidation({ issueNumber: 1 });
      await writeValidation(testProjectPath, 1, validation);

      // Create a non-numeric directory
      const invalidDir = path.join(testProjectPath, '.automaker', 'validations', 'invalid');
      await fs.mkdir(invalidDir, { recursive: true });

      const result = await getAllValidations(testProjectPath);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(validation);
    });
  });

  describe('deleteValidation', () => {
    it('should delete validation from storage', async () => {
      const validation = createMockValidation();
      await writeValidation(testProjectPath, 123, validation);

      const result = await deleteValidation(testProjectPath, 123);

      expect(result).toBe(true);

      const readResult = await readValidation(testProjectPath, 123);
      expect(readResult).toBeNull();
    });

    it('should return true even when validation does not exist', async () => {
      const result = await deleteValidation(testProjectPath, 999);

      expect(result).toBe(true);
    });
  });

  describe('isValidationStale', () => {
    it('should return false for recent validation', () => {
      const validation = createMockValidation({
        validatedAt: new Date().toISOString(),
      });

      const result = isValidationStale(validation);

      expect(result).toBe(false);
    });

    it('should return true for validation older than 24 hours', () => {
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 25); // 25 hours ago

      const validation = createMockValidation({
        validatedAt: oldDate.toISOString(),
      });

      const result = isValidationStale(validation);

      expect(result).toBe(true);
    });

    it('should return false for validation exactly at 24 hours', () => {
      const exactDate = new Date();
      exactDate.setHours(exactDate.getHours() - 24);

      const validation = createMockValidation({
        validatedAt: exactDate.toISOString(),
      });

      const result = isValidationStale(validation);

      expect(result).toBe(false);
    });
  });

  describe('getValidationWithFreshness', () => {
    it('should return validation with isStale false for recent validation', async () => {
      const validation = createMockValidation({
        validatedAt: new Date().toISOString(),
      });
      await writeValidation(testProjectPath, 123, validation);

      const result = await getValidationWithFreshness(testProjectPath, 123);

      expect(result).not.toBeNull();
      expect(result!.validation).toEqual(validation);
      expect(result!.isStale).toBe(false);
    });

    it('should return validation with isStale true for old validation', async () => {
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 25);

      const validation = createMockValidation({
        validatedAt: oldDate.toISOString(),
      });
      await writeValidation(testProjectPath, 123, validation);

      const result = await getValidationWithFreshness(testProjectPath, 123);

      expect(result).not.toBeNull();
      expect(result!.isStale).toBe(true);
    });

    it('should return null when validation does not exist', async () => {
      const result = await getValidationWithFreshness(testProjectPath, 999);

      expect(result).toBeNull();
    });
  });

  describe('markValidationViewed', () => {
    it('should mark validation as viewed', async () => {
      const validation = createMockValidation();
      await writeValidation(testProjectPath, 123, validation);

      const result = await markValidationViewed(testProjectPath, 123);

      expect(result).toBe(true);

      const updated = await readValidation(testProjectPath, 123);
      expect(updated).not.toBeNull();
      expect(updated!.viewedAt).toBeDefined();
    });

    it('should return false when validation does not exist', async () => {
      const result = await markValidationViewed(testProjectPath, 999);

      expect(result).toBe(false);
    });
  });

  describe('getUnviewedValidationsCount', () => {
    it('should return count of unviewed non-stale validations', async () => {
      const validation1 = createMockValidation({ issueNumber: 1 });
      const validation2 = createMockValidation({ issueNumber: 2 });
      const validation3 = createMockValidation({
        issueNumber: 3,
        viewedAt: new Date().toISOString(),
      });

      await writeValidation(testProjectPath, 1, validation1);
      await writeValidation(testProjectPath, 2, validation2);
      await writeValidation(testProjectPath, 3, validation3);

      const result = await getUnviewedValidationsCount(testProjectPath);

      expect(result).toBe(2);
    });

    it('should not count stale validations', async () => {
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 25);

      const validation1 = createMockValidation({ issueNumber: 1 });
      const validation2 = createMockValidation({
        issueNumber: 2,
        validatedAt: oldDate.toISOString(),
      });

      await writeValidation(testProjectPath, 1, validation1);
      await writeValidation(testProjectPath, 2, validation2);

      const result = await getUnviewedValidationsCount(testProjectPath);

      expect(result).toBe(1);
    });

    it('should return 0 when no validations exist', async () => {
      const result = await getUnviewedValidationsCount(testProjectPath);

      expect(result).toBe(0);
    });

    it('should return 0 when all validations are viewed', async () => {
      const validation = createMockValidation({
        issueNumber: 1,
        viewedAt: new Date().toISOString(),
      });

      await writeValidation(testProjectPath, 1, validation);

      const result = await getUnviewedValidationsCount(testProjectPath);

      expect(result).toBe(0);
    });
  });
});
