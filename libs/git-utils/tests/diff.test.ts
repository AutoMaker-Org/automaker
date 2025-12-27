import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateSyntheticDiffForNewFile,
  appendUntrackedFileDiffs,
  listAllFilesInDirectory,
  generateDiffsForNonGitDirectory,
  getGitRepositoryDiffs,
} from '../src/diff';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('diff.ts', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-utils-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('generateSyntheticDiffForNewFile', () => {
    it('should generate diff for binary file', async () => {
      const fileName = 'test.png';
      const filePath = path.join(tempDir, fileName);
      await fs.writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      const diff = await generateSyntheticDiffForNewFile(tempDir, fileName);

      expect(diff).toContain(`diff --git a/${fileName} b/${fileName}`);
      expect(diff).toContain('new file mode 100644');
      expect(diff).toContain(`Binary file ${fileName} added`);
    });

    it('should generate diff for large text file', async () => {
      const fileName = 'large.txt';
      const filePath = path.join(tempDir, fileName);
      // Create a file > 1MB
      const largeContent = 'x'.repeat(1024 * 1024 + 100);
      await fs.writeFile(filePath, largeContent);

      const diff = await generateSyntheticDiffForNewFile(tempDir, fileName);

      expect(diff).toContain(`diff --git a/${fileName} b/${fileName}`);
      expect(diff).toContain('[File too large to display:');
      expect(diff).toMatch(/\d+KB\]/);
    });

    it('should generate diff for small text file with trailing newline', async () => {
      const fileName = 'test.txt';
      const filePath = path.join(tempDir, fileName);
      const content = 'line 1\nline 2\nline 3\n';
      await fs.writeFile(filePath, content);

      const diff = await generateSyntheticDiffForNewFile(tempDir, fileName);

      expect(diff).toContain(`diff --git a/${fileName} b/${fileName}`);
      expect(diff).toContain('new file mode 100644');
      expect(diff).toContain('--- /dev/null');
      expect(diff).toContain(`+++ b/${fileName}`);
      expect(diff).toContain('@@ -0,0 +1,3 @@');
      expect(diff).toContain('+line 1');
      expect(diff).toContain('+line 2');
      expect(diff).toContain('+line 3');
      expect(diff).not.toContain('\\ No newline at end of file');
    });

    it('should generate diff for text file without trailing newline', async () => {
      const fileName = 'no-newline.txt';
      const filePath = path.join(tempDir, fileName);
      const content = 'line 1\nline 2';
      await fs.writeFile(filePath, content);

      const diff = await generateSyntheticDiffForNewFile(tempDir, fileName);

      expect(diff).toContain(`diff --git a/${fileName} b/${fileName}`);
      expect(diff).toContain('+line 1');
      expect(diff).toContain('+line 2');
      expect(diff).toContain('\\ No newline at end of file');
    });

    it('should generate diff for empty file', async () => {
      const fileName = 'empty.txt';
      const filePath = path.join(tempDir, fileName);
      await fs.writeFile(filePath, '');

      const diff = await generateSyntheticDiffForNewFile(tempDir, fileName);

      expect(diff).toContain(`diff --git a/${fileName} b/${fileName}`);
      expect(diff).toContain('@@ -0,0 +1,0 @@');
    });

    it('should generate diff for single line file', async () => {
      const fileName = 'single.txt';
      const filePath = path.join(tempDir, fileName);
      await fs.writeFile(filePath, 'single line\n');

      const diff = await generateSyntheticDiffForNewFile(tempDir, fileName);

      expect(diff).toContain('@@ -0,0 +1,1 @@');
      expect(diff).toContain('+single line');
    });

    it('should handle file not found error', async () => {
      const fileName = 'nonexistent.txt';

      const diff = await generateSyntheticDiffForNewFile(tempDir, fileName);

      expect(diff).toContain(`diff --git a/${fileName} b/${fileName}`);
      expect(diff).toContain('[Unable to read file content]');
    });

    it('should handle empty directory path gracefully', async () => {
      const dirName = 'some-directory';
      const dirPath = path.join(tempDir, dirName);
      await fs.mkdir(dirPath);

      const diff = await generateSyntheticDiffForNewFile(tempDir, dirName);

      expect(diff).toContain(`diff --git a/${dirName} b/${dirName}`);
      expect(diff).toContain('new file mode 040000');
      expect(diff).toContain('[Empty directory]');
    });

    it('should expand directory with files and generate diffs for each file', async () => {
      const dirName = 'new-feature';
      const dirPath = path.join(tempDir, dirName);
      await fs.mkdir(dirPath);
      await fs.writeFile(path.join(dirPath, 'index.ts'), 'export const foo = 1;\n');
      await fs.writeFile(path.join(dirPath, 'utils.ts'), 'export const bar = 2;\n');

      const diff = await generateSyntheticDiffForNewFile(tempDir, dirName);

      // Should contain diffs for both files in the directory
      expect(diff).toContain(`diff --git a/${dirName}/index.ts b/${dirName}/index.ts`);
      expect(diff).toContain(`diff --git a/${dirName}/utils.ts b/${dirName}/utils.ts`);
      expect(diff).toContain('+export const foo = 1;');
      expect(diff).toContain('+export const bar = 2;');
      // Should NOT contain a diff for the directory itself
      expect(diff).not.toContain('[Empty directory]');
    });

    it('should handle directory path with trailing slash', async () => {
      const dirName = 'trailing-slash-dir';
      const dirPath = path.join(tempDir, dirName);
      await fs.mkdir(dirPath);
      await fs.writeFile(path.join(dirPath, 'file.txt'), 'content\n');

      // git status reports untracked directories with trailing slash
      const diff = await generateSyntheticDiffForNewFile(tempDir, `${dirName}/`);

      expect(diff).toContain(`diff --git a/${dirName}/file.txt b/${dirName}/file.txt`);
      expect(diff).toContain('+content');
    });
  });

  describe('appendUntrackedFileDiffs', () => {
    it('should return existing diff when no untracked files', async () => {
      const existingDiff = 'diff --git a/test.txt b/test.txt\n';
      const files = [
        { status: 'M', path: 'test.txt' },
        { status: 'A', path: 'new.txt' },
      ];

      const result = await appendUntrackedFileDiffs(tempDir, existingDiff, files);

      expect(result).toBe(existingDiff);
    });

    it('should append synthetic diffs for untracked files', async () => {
      const existingDiff = 'existing diff\n';
      const untrackedFile = 'untracked.txt';
      const filePath = path.join(tempDir, untrackedFile);
      await fs.writeFile(filePath, 'content\n');

      const files = [
        { status: 'M', path: 'modified.txt' },
        { status: '?', path: untrackedFile },
      ];

      const result = await appendUntrackedFileDiffs(tempDir, existingDiff, files);

      expect(result).toContain('existing diff');
      expect(result).toContain(`diff --git a/${untrackedFile} b/${untrackedFile}`);
      expect(result).toContain('+content');
    });

    it('should handle multiple untracked files', async () => {
      const file1 = 'file1.txt';
      const file2 = 'file2.txt';
      await fs.writeFile(path.join(tempDir, file1), 'file1\n');
      await fs.writeFile(path.join(tempDir, file2), 'file2\n');

      const files = [
        { status: '?', path: file1 },
        { status: '?', path: file2 },
      ];

      const result = await appendUntrackedFileDiffs(tempDir, '', files);

      expect(result).toContain(`diff --git a/${file1} b/${file1}`);
      expect(result).toContain(`diff --git a/${file2} b/${file2}`);
      expect(result).toContain('+file1');
      expect(result).toContain('+file2');
    });
  });

  describe('listAllFilesInDirectory', () => {
    it('should list files in empty directory', async () => {
      const files = await listAllFilesInDirectory(tempDir);
      expect(files).toEqual([]);
    });

    it('should list files in flat directory', async () => {
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content');
      await fs.writeFile(path.join(tempDir, 'file2.js'), 'code');

      const files = await listAllFilesInDirectory(tempDir);

      expect(files).toHaveLength(2);
      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.js');
    });

    it('should list files in nested directories', async () => {
      await fs.mkdir(path.join(tempDir, 'subdir'));
      await fs.writeFile(path.join(tempDir, 'root.txt'), '');
      await fs.writeFile(path.join(tempDir, 'subdir', 'nested.txt'), '');

      const files = await listAllFilesInDirectory(tempDir);

      expect(files).toHaveLength(2);
      expect(files).toContain('root.txt');
      expect(files).toContain('subdir/nested.txt');
    });

    it('should skip node_modules directory', async () => {
      await fs.mkdir(path.join(tempDir, 'node_modules'));
      await fs.writeFile(path.join(tempDir, 'app.js'), '');
      await fs.writeFile(path.join(tempDir, 'node_modules', 'package.js'), '');

      const files = await listAllFilesInDirectory(tempDir);

      expect(files).toHaveLength(1);
      expect(files).toContain('app.js');
      expect(files).not.toContain('node_modules/package.js');
    });

    it('should skip common build directories', async () => {
      await fs.mkdir(path.join(tempDir, 'dist'));
      await fs.mkdir(path.join(tempDir, 'build'));
      await fs.mkdir(path.join(tempDir, '.next'));
      await fs.writeFile(path.join(tempDir, 'source.ts'), '');
      await fs.writeFile(path.join(tempDir, 'dist', 'output.js'), '');
      await fs.writeFile(path.join(tempDir, 'build', 'output.js'), '');

      const files = await listAllFilesInDirectory(tempDir);

      expect(files).toHaveLength(1);
      expect(files).toContain('source.ts');
    });

    it('should skip hidden files except .env', async () => {
      await fs.writeFile(path.join(tempDir, '.hidden'), '');
      await fs.writeFile(path.join(tempDir, '.env'), '');
      await fs.writeFile(path.join(tempDir, 'visible.txt'), '');

      const files = await listAllFilesInDirectory(tempDir);

      expect(files).toHaveLength(2);
      expect(files).toContain('.env');
      expect(files).toContain('visible.txt');
      expect(files).not.toContain('.hidden');
    });

    it('should skip .git directory', async () => {
      await fs.mkdir(path.join(tempDir, '.git'));
      await fs.writeFile(path.join(tempDir, '.git', 'config'), '');
      await fs.writeFile(path.join(tempDir, 'README.md'), '');

      const files = await listAllFilesInDirectory(tempDir);

      expect(files).toHaveLength(1);
      expect(files).toContain('README.md');
    });
  });

  describe('generateDiffsForNonGitDirectory', () => {
    it('should generate diffs for all files in directory', async () => {
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content1\n');
      await fs.writeFile(path.join(tempDir, 'file2.js'), "console.log('hi');\n");

      const result = await generateDiffsForNonGitDirectory(tempDir);

      expect(result.files).toHaveLength(2);
      expect(result.files.every((f) => f.status === '?')).toBe(true);
      expect(result.diff).toContain('diff --git a/file1.txt b/file1.txt');
      expect(result.diff).toContain('diff --git a/file2.js b/file2.js');
      expect(result.diff).toContain('+content1');
      expect(result.diff).toContain("+console.log('hi');");
    });

    it('should return empty result for empty directory', async () => {
      const result = await generateDiffsForNonGitDirectory(tempDir);

      expect(result.files).toEqual([]);
      expect(result.diff).toBe('');
    });

    it('should mark all files as untracked', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'test');

      const result = await generateDiffsForNonGitDirectory(tempDir);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].status).toBe('?');
      expect(result.files[0].statusText).toBe('New');
    });
  });

  describe('getGitRepositoryDiffs', () => {
    it('should treat non-git directory as all new files', async () => {
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'content\n');

      const result = await getGitRepositoryDiffs(tempDir);

      expect(result.hasChanges).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].status).toBe('?');
      expect(result.diff).toContain('diff --git a/file.txt b/file.txt');
    });

    it('should return no changes for empty non-git directory', async () => {
      const result = await getGitRepositoryDiffs(tempDir);

      expect(result.hasChanges).toBe(false);
      expect(result.files).toEqual([]);
      expect(result.diff).toBe('');
    });
  });
});
