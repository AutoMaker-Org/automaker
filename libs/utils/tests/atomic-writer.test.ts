import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { secureFs } from '@automaker/platform';
import {
  atomicWriteJson,
  readJsonFile,
  updateJsonAtomically,
  readJsonWithRecovery,
} from '../src/atomic-writer';

// Mock secureFs
vi.mock('@automaker/platform', () => ({
  secureFs: {
    writeFile: vi.fn(),
    readFile: vi.fn(),
    rename: vi.fn(),
    unlink: vi.fn(),
    readdir: vi.fn(),
    copyFile: vi.fn(),
    access: vi.fn(),
    lstat: vi.fn(),
    mkdir: vi.fn(),
  },
}));

// Mock logger to suppress output during tests
vi.mock('../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('atomic-writer.ts', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for integration tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-writer-test-'));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('atomicWriteJson', () => {
    it('should write JSON data atomically', async () => {
      const filePath = path.join(tempDir, 'test.json');
      const data = { key: 'value', number: 42 };

      (secureFs.writeFile as unknown as MockInstance).mockResolvedValue(undefined);
      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);

      await atomicWriteJson(filePath, data);

      // Verify writeFile was called with temp file path and JSON content
      // Format: .tmp.{timestamp}.{random-hex}
      expect(secureFs.writeFile).toHaveBeenCalledTimes(1);
      const writeCall = (secureFs.writeFile as unknown as MockInstance).mock.calls[0];
      expect(writeCall[0]).toMatch(/\.tmp\.\d+\.[a-f0-9]+$/);
      expect(writeCall[1]).toBe(JSON.stringify(data, null, 2));
      expect(writeCall[2]).toBe('utf-8');

      // Verify rename was called with temp -> target
      expect(secureFs.rename).toHaveBeenCalledTimes(1);
      const renameCall = (secureFs.rename as unknown as MockInstance).mock.calls[0];
      expect(renameCall[0]).toMatch(/\.tmp\.\d+\.[a-f0-9]+$/);
      expect(renameCall[1]).toBe(path.resolve(filePath));
    });

    it('should use custom indentation', async () => {
      const filePath = path.join(tempDir, 'test.json');
      const data = { key: 'value' };

      (secureFs.writeFile as unknown as MockInstance).mockResolvedValue(undefined);
      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);

      await atomicWriteJson(filePath, data, { indent: 4 });

      const writeCall = (secureFs.writeFile as unknown as MockInstance).mock.calls[0];
      expect(writeCall[1]).toBe(JSON.stringify(data, null, 4));
    });

    it('should clean up temp file on write failure', async () => {
      const filePath = path.join(tempDir, 'test.json');
      const data = { key: 'value' };

      const writeError = new Error('Write failed');
      (secureFs.writeFile as unknown as MockInstance).mockRejectedValue(writeError);
      (secureFs.unlink as unknown as MockInstance).mockResolvedValue(undefined);

      await expect(atomicWriteJson(filePath, data)).rejects.toThrow('Write failed');

      expect(secureFs.unlink).toHaveBeenCalledTimes(1);
    });

    it('should clean up temp file on rename failure', async () => {
      const filePath = path.join(tempDir, 'test.json');
      const data = { key: 'value' };

      const renameError = new Error('Rename failed');
      (secureFs.writeFile as unknown as MockInstance).mockResolvedValue(undefined);
      (secureFs.rename as unknown as MockInstance).mockRejectedValue(renameError);
      (secureFs.unlink as unknown as MockInstance).mockResolvedValue(undefined);

      await expect(atomicWriteJson(filePath, data)).rejects.toThrow('Rename failed');

      expect(secureFs.unlink).toHaveBeenCalledTimes(1);
    });

    it('should ignore cleanup errors', async () => {
      const filePath = path.join(tempDir, 'test.json');
      const data = { key: 'value' };

      const writeError = new Error('Write failed');
      const unlinkError = new Error('Unlink failed');
      (secureFs.writeFile as unknown as MockInstance).mockRejectedValue(writeError);
      (secureFs.unlink as unknown as MockInstance).mockRejectedValue(unlinkError);

      // Should still throw the original error, not the cleanup error
      await expect(atomicWriteJson(filePath, data)).rejects.toThrow('Write failed');
    });

    it('should resolve relative paths', async () => {
      const relativePath = 'test.json';
      const data = { key: 'value' };

      (secureFs.writeFile as unknown as MockInstance).mockResolvedValue(undefined);
      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);

      await atomicWriteJson(relativePath, data);

      const renameCall = (secureFs.rename as unknown as MockInstance).mock.calls[0];
      expect(renameCall[1]).toBe(path.resolve(relativePath));
    });

    it('should handle arrays as data', async () => {
      const filePath = path.join(tempDir, 'array.json');
      const data = [1, 2, 3, { nested: 'value' }];

      (secureFs.writeFile as unknown as MockInstance).mockResolvedValue(undefined);
      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);

      await atomicWriteJson(filePath, data);

      const writeCall = (secureFs.writeFile as unknown as MockInstance).mock.calls[0];
      expect(writeCall[1]).toBe(JSON.stringify(data, null, 2));
    });

    it('should handle null and primitive values', async () => {
      const filePath = path.join(tempDir, 'primitive.json');

      (secureFs.writeFile as unknown as MockInstance).mockResolvedValue(undefined);
      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);

      await atomicWriteJson(filePath, null);
      expect((secureFs.writeFile as unknown as MockInstance).mock.calls[0][1]).toBe('null');

      await atomicWriteJson(filePath, 'string');
      expect((secureFs.writeFile as unknown as MockInstance).mock.calls[1][1]).toBe('"string"');

      await atomicWriteJson(filePath, 123);
      expect((secureFs.writeFile as unknown as MockInstance).mock.calls[2][1]).toBe('123');
    });

    it('should create directories when createDirs is true', async () => {
      const filePath = path.join(tempDir, 'nested', 'deep', 'test.json');
      const data = { key: 'value' };

      (secureFs.writeFile as unknown as MockInstance).mockResolvedValue(undefined);
      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);
      // Mock lstat to indicate directory already exists
      (secureFs.lstat as unknown as MockInstance).mockResolvedValue({
        isDirectory: () => true,
        isSymbolicLink: () => false,
      });

      await atomicWriteJson(filePath, data, { createDirs: true });

      expect(secureFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('readJsonFile', () => {
    it('should read and parse JSON file', async () => {
      const filePath = path.join(tempDir, 'read.json');
      const data = { key: 'value', count: 5 };

      (secureFs.readFile as unknown as MockInstance).mockResolvedValue(JSON.stringify(data));

      const result = await readJsonFile(filePath, {});

      expect(result).toEqual(data);
      expect(secureFs.readFile).toHaveBeenCalledWith(path.resolve(filePath), 'utf-8');
    });

    it('should return default value when file does not exist', async () => {
      const filePath = path.join(tempDir, 'nonexistent.json');
      const defaultValue = { default: true };

      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      (secureFs.readFile as unknown as MockInstance).mockRejectedValue(enoentError);

      const result = await readJsonFile(filePath, defaultValue);

      expect(result).toEqual(defaultValue);
    });

    it('should return default value when JSON is invalid', async () => {
      const filePath = path.join(tempDir, 'invalid.json');
      const defaultValue = { default: true };

      (secureFs.readFile as unknown as MockInstance).mockResolvedValue('not valid json');

      const result = await readJsonFile(filePath, defaultValue);

      expect(result).toEqual(defaultValue);
    });

    it('should return default value for other read errors', async () => {
      const filePath = path.join(tempDir, 'error.json');
      const defaultValue = { default: true };

      const accessError = new Error('Access denied') as NodeJS.ErrnoException;
      accessError.code = 'EACCES';
      (secureFs.readFile as unknown as MockInstance).mockRejectedValue(accessError);

      const result = await readJsonFile(filePath, defaultValue);

      expect(result).toEqual(defaultValue);
    });

    it('should handle empty object as default', async () => {
      const filePath = path.join(tempDir, 'nonexistent.json');

      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      (secureFs.readFile as unknown as MockInstance).mockRejectedValue(enoentError);

      const result = await readJsonFile<Record<string, unknown>>(filePath, {});

      expect(result).toEqual({});
    });

    it('should handle array as default', async () => {
      const filePath = path.join(tempDir, 'nonexistent.json');

      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      (secureFs.readFile as unknown as MockInstance).mockRejectedValue(enoentError);

      const result = await readJsonFile<string[]>(filePath, []);

      expect(result).toEqual([]);
    });

    it('should parse nested objects correctly', async () => {
      const filePath = path.join(tempDir, 'nested.json');
      const data = {
        level1: {
          level2: {
            value: 'deep',
            array: [1, 2, { nested: true }],
          },
        },
      };

      (secureFs.readFile as unknown as MockInstance).mockResolvedValue(JSON.stringify(data));

      const result = await readJsonFile(filePath, {});

      expect(result).toEqual(data);
    });
  });

  describe('updateJsonAtomically', () => {
    it('should read, update, and write file atomically', async () => {
      const filePath = path.join(tempDir, 'update.json');
      const initialData = { count: 5 };
      const defaultValue = { count: 0 };

      (secureFs.readFile as unknown as MockInstance).mockResolvedValue(JSON.stringify(initialData));
      (secureFs.writeFile as unknown as MockInstance).mockResolvedValue(undefined);
      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);

      await updateJsonAtomically(filePath, defaultValue, (data) => ({
        ...data,
        count: data.count + 1,
      }));

      // Verify the write was called with updated data
      const writeCall = (secureFs.writeFile as unknown as MockInstance).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1]);
      expect(writtenData.count).toBe(6);
    });

    it('should use default value when file does not exist', async () => {
      const filePath = path.join(tempDir, 'new.json');
      const defaultValue = { count: 0 };

      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      (secureFs.readFile as unknown as MockInstance).mockRejectedValue(enoentError);
      (secureFs.writeFile as unknown as MockInstance).mockResolvedValue(undefined);
      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);

      await updateJsonAtomically(filePath, defaultValue, (data) => ({
        ...data,
        count: data.count + 1,
      }));

      const writeCall = (secureFs.writeFile as unknown as MockInstance).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1]);
      expect(writtenData.count).toBe(1);
    });

    it('should support async updater function', async () => {
      const filePath = path.join(tempDir, 'async.json');
      const initialData = { value: 'initial' };

      (secureFs.readFile as unknown as MockInstance).mockResolvedValue(JSON.stringify(initialData));
      (secureFs.writeFile as unknown as MockInstance).mockResolvedValue(undefined);
      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);

      await updateJsonAtomically(filePath, {}, async (data) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { ...data, value: 'updated' };
      });

      const writeCall = (secureFs.writeFile as unknown as MockInstance).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1]);
      expect(writtenData.value).toBe('updated');
    });

    it('should pass through options to atomicWriteJson', async () => {
      const filePath = path.join(tempDir, 'options.json');

      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      (secureFs.readFile as unknown as MockInstance).mockRejectedValue(enoentError);
      (secureFs.writeFile as unknown as MockInstance).mockResolvedValue(undefined);
      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);

      await updateJsonAtomically(filePath, { key: 'value' }, (d) => d, { indent: 4 });

      const writeCall = (secureFs.writeFile as unknown as MockInstance).mock.calls[0];
      expect(writeCall[1]).toBe(JSON.stringify({ key: 'value' }, null, 4));
    });
  });

  describe('readJsonWithRecovery', () => {
    it('should return main file data when available', async () => {
      const filePath = path.join(tempDir, 'main.json');
      const data = { main: true };

      (secureFs.readFile as unknown as MockInstance).mockResolvedValue(JSON.stringify(data));

      const result = await readJsonWithRecovery(filePath, {});

      expect(result.data).toEqual(data);
      expect(result.recovered).toBe(false);
      expect(result.source).toBe('main');
      expect(result.error).toBeUndefined();
    });

    it('should recover from temp file when main file is missing', async () => {
      const filePath = path.join(tempDir, 'data.json');
      const tempData = { fromTemp: true };
      const fileName = path.basename(filePath);

      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      (secureFs.readFile as unknown as MockInstance)
        .mockRejectedValueOnce(enoentError) // Main file
        .mockResolvedValueOnce(JSON.stringify(tempData)); // Temp file

      (secureFs.readdir as unknown as MockInstance).mockResolvedValue([
        `${fileName}.tmp.1234567890`,
        'other-file.json',
      ]);

      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);

      const result = await readJsonWithRecovery(filePath, {});

      expect(result.data).toEqual(tempData);
      expect(result.recovered).toBe(true);
      expect(result.source).toBe('temp');
      expect(result.error).toBe('File does not exist');
    });

    it('should recover from backup file when main and temp are unavailable', async () => {
      const filePath = path.join(tempDir, 'data.json');
      const backupData = { fromBackup: true };

      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      (secureFs.readFile as unknown as MockInstance)
        .mockRejectedValueOnce(enoentError) // Main file
        .mockRejectedValueOnce(enoentError) // backup1
        .mockResolvedValueOnce(JSON.stringify(backupData)); // backup2

      (secureFs.readdir as unknown as MockInstance).mockResolvedValue([]); // No temp files

      (secureFs.copyFile as unknown as MockInstance).mockResolvedValue(undefined);

      const result = await readJsonWithRecovery(filePath, {});

      expect(result.data).toEqual(backupData);
      expect(result.recovered).toBe(true);
      expect(result.source).toBe('backup');
    });

    it('should return default when all recovery attempts fail', async () => {
      const filePath = path.join(tempDir, 'data.json');
      const defaultValue = { default: true };

      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      (secureFs.readFile as unknown as MockInstance).mockRejectedValue(enoentError);
      (secureFs.readdir as unknown as MockInstance).mockResolvedValue([]);

      const result = await readJsonWithRecovery(filePath, defaultValue);

      expect(result.data).toEqual(defaultValue);
      expect(result.recovered).toBe(true);
      expect(result.source).toBe('default');
      expect(result.error).toBe('File does not exist');
    });

    it('should try multiple temp files in order', async () => {
      const filePath = path.join(tempDir, 'data.json');
      const fileName = path.basename(filePath);
      const validTempData = { valid: true };

      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      (secureFs.readFile as unknown as MockInstance)
        .mockRejectedValueOnce(enoentError) // Main file
        .mockResolvedValueOnce('invalid json') // First temp file (invalid)
        .mockResolvedValueOnce(JSON.stringify(validTempData)); // Second temp file

      (secureFs.readdir as unknown as MockInstance).mockResolvedValue([
        `${fileName}.tmp.9999999999`, // Most recent
        `${fileName}.tmp.1111111111`, // Older
      ]);

      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);

      const result = await readJsonWithRecovery(filePath, {});

      expect(result.data).toEqual(validTempData);
      expect(result.source).toBe('temp');
    });

    it('should try multiple backup files in order', async () => {
      const filePath = path.join(tempDir, 'data.json');
      const backupData = { backup2: true };

      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      (secureFs.readFile as unknown as MockInstance)
        .mockRejectedValueOnce(enoentError) // Main file
        .mockRejectedValueOnce(enoentError) // .bak1
        .mockResolvedValueOnce(JSON.stringify(backupData)); // .bak2

      (secureFs.readdir as unknown as MockInstance).mockResolvedValue([]);

      (secureFs.copyFile as unknown as MockInstance).mockResolvedValue(undefined);

      const result = await readJsonWithRecovery(filePath, {});

      expect(result.data).toEqual(backupData);
      expect(result.source).toBe('backup');

      // Verify it tried .bak1 first
      expect(secureFs.readFile).toHaveBeenNthCalledWith(
        2,
        `${path.resolve(filePath)}.bak1`,
        'utf-8'
      );
    });

    it('should respect maxBackups option', async () => {
      const filePath = path.join(tempDir, 'data.json');
      const defaultValue = { default: true };

      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      (secureFs.readFile as unknown as MockInstance).mockRejectedValue(enoentError);
      (secureFs.readdir as unknown as MockInstance).mockResolvedValue([]);

      const result = await readJsonWithRecovery(filePath, defaultValue, { maxBackups: 1 });

      expect(result.source).toBe('default');
      // Should only have tried main + 1 backup
      expect(secureFs.readFile).toHaveBeenCalledTimes(2);
    });

    it('should not auto-restore when autoRestore is false', async () => {
      const filePath = path.join(tempDir, 'data.json');
      const fileName = path.basename(filePath);
      const tempData = { fromTemp: true };

      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      (secureFs.readFile as unknown as MockInstance)
        .mockRejectedValueOnce(enoentError)
        .mockResolvedValueOnce(JSON.stringify(tempData));

      (secureFs.readdir as unknown as MockInstance).mockResolvedValue([`${fileName}.tmp.123`]);

      const result = await readJsonWithRecovery(filePath, {}, { autoRestore: false });

      expect(result.data).toEqual(tempData);
      expect(secureFs.rename).not.toHaveBeenCalled();
      expect(secureFs.copyFile).not.toHaveBeenCalled();
    });

    it('should handle directory read errors gracefully', async () => {
      const filePath = path.join(tempDir, 'data.json');
      const backupData = { backup: true };

      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      (secureFs.readFile as unknown as MockInstance)
        .mockRejectedValueOnce(enoentError) // Main file
        .mockResolvedValueOnce(JSON.stringify(backupData)); // backup1

      (secureFs.readdir as unknown as MockInstance).mockRejectedValue(new Error('Dir read failed'));
      (secureFs.copyFile as unknown as MockInstance).mockResolvedValue(undefined);

      const result = await readJsonWithRecovery(filePath, {});

      // Should skip temp files and go to backups
      expect(result.data).toEqual(backupData);
      expect(result.source).toBe('backup');
    });

    it('should handle corrupted main file with valid error message', async () => {
      const filePath = path.join(tempDir, 'corrupted.json');
      const defaultValue = { default: true };

      const parseError = new SyntaxError('Unexpected token');
      (secureFs.readFile as unknown as MockInstance).mockResolvedValueOnce('{{invalid');
      (secureFs.readdir as unknown as MockInstance).mockResolvedValue([]);

      // Mock to actually throw parse error
      (secureFs.readFile as unknown as MockInstance).mockImplementationOnce(() => {
        return Promise.resolve('{{invalid json');
      });

      const result = await readJsonWithRecovery(filePath, defaultValue);

      expect(result.recovered).toBe(true);
      expect(result.error).toContain('Failed to parse');
    });

    it('should handle restore failures gracefully', async () => {
      const filePath = path.join(tempDir, 'data.json');
      const fileName = path.basename(filePath);
      const tempData = { fromTemp: true };

      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      (secureFs.readFile as unknown as MockInstance)
        .mockRejectedValueOnce(enoentError)
        .mockResolvedValueOnce(JSON.stringify(tempData));

      (secureFs.readdir as unknown as MockInstance).mockResolvedValue([`${fileName}.tmp.123`]);
      (secureFs.rename as unknown as MockInstance).mockRejectedValue(new Error('Restore failed'));

      const result = await readJsonWithRecovery(filePath, {});

      // Should still return data even if restore failed
      expect(result.data).toEqual(tempData);
      expect(result.source).toBe('temp');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty file path gracefully', async () => {
      (secureFs.readFile as unknown as MockInstance).mockRejectedValue(new Error('Invalid path'));

      const result = await readJsonFile('', { default: true });

      expect(result).toEqual({ default: true });
    });

    it('should handle special characters in file path', async () => {
      const filePath = path.join(tempDir, 'file with spaces & special!.json');
      const data = { special: 'chars' };

      (secureFs.writeFile as unknown as MockInstance).mockResolvedValue(undefined);
      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);

      await atomicWriteJson(filePath, data);

      expect(secureFs.writeFile).toHaveBeenCalled();
    });

    it('should handle very large objects', async () => {
      const filePath = path.join(tempDir, 'large.json');
      const largeArray = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        data: `item-${i}`,
      }));

      (secureFs.writeFile as unknown as MockInstance).mockResolvedValue(undefined);
      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);

      await atomicWriteJson(filePath, largeArray);

      const writeCall = (secureFs.writeFile as unknown as MockInstance).mock.calls[0];
      expect(JSON.parse(writeCall[1])).toEqual(largeArray);
    });

    it('should handle unicode content', async () => {
      const filePath = path.join(tempDir, 'unicode.json');
      const data = { emoji: '🎉', japanese: 'こんにちは', chinese: '你好' };

      (secureFs.writeFile as unknown as MockInstance).mockResolvedValue(undefined);
      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);

      await atomicWriteJson(filePath, data);

      const writeCall = (secureFs.writeFile as unknown as MockInstance).mock.calls[0];
      expect(JSON.parse(writeCall[1])).toEqual(data);
    });

    it('should handle circular reference error in JSON', async () => {
      const filePath = path.join(tempDir, 'circular.json');
      const circular: Record<string, unknown> = { key: 'value' };
      circular.self = circular;

      await expect(atomicWriteJson(filePath, circular)).rejects.toThrow();
    });
  });

  describe('Type safety', () => {
    interface TestConfig {
      version: number;
      settings: {
        enabled: boolean;
        name: string;
      };
    }

    it('should preserve types in readJsonFile', async () => {
      const filePath = path.join(tempDir, 'config.json');
      const expected: TestConfig = {
        version: 1,
        settings: { enabled: true, name: 'test' },
      };

      (secureFs.readFile as unknown as MockInstance).mockResolvedValue(JSON.stringify(expected));

      const result = await readJsonFile<TestConfig>(filePath, {
        version: 0,
        settings: { enabled: false, name: '' },
      });

      expect(result.version).toBe(1);
      expect(result.settings.enabled).toBe(true);
      expect(result.settings.name).toBe('test');
    });

    it('should preserve types in updateJsonAtomically', async () => {
      const filePath = path.join(tempDir, 'counter.json');

      interface Counter {
        count: number;
      }

      (secureFs.readFile as unknown as MockInstance).mockResolvedValue(
        JSON.stringify({ count: 5 })
      );
      (secureFs.writeFile as unknown as MockInstance).mockResolvedValue(undefined);
      (secureFs.rename as unknown as MockInstance).mockResolvedValue(undefined);

      await updateJsonAtomically<Counter>(filePath, { count: 0 }, (data) => ({
        count: data.count + 1,
      }));

      const writeCall = (secureFs.writeFile as unknown as MockInstance).mock.calls[0];
      const writtenData: Counter = JSON.parse(writeCall[1]);
      expect(writtenData.count).toBe(6);
    });
  });
});
