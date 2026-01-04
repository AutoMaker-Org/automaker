import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getMimeTypeForImage,
  readImageAsBase64,
  convertImagesToContentBlocks,
  formatImagePathsForPrompt,
} from '@automaker/utils';
import { pngBase64Fixture } from '../../fixtures/images.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('image-handler.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMimeTypeForImage', () => {
    it('should return correct MIME type for .jpg', () => {
      expect(getMimeTypeForImage('test.jpg')).toBe('image/jpeg');
      expect(getMimeTypeForImage('/path/to/test.jpg')).toBe('image/jpeg');
    });

    it('should return correct MIME type for .jpeg', () => {
      expect(getMimeTypeForImage('test.jpeg')).toBe('image/jpeg');
    });

    it('should return correct MIME type for .png', () => {
      expect(getMimeTypeForImage('test.png')).toBe('image/png');
    });

    it('should return correct MIME type for .gif', () => {
      expect(getMimeTypeForImage('test.gif')).toBe('image/gif');
    });

    it('should return correct MIME type for .webp', () => {
      expect(getMimeTypeForImage('test.webp')).toBe('image/webp');
    });

    it('should be case-insensitive', () => {
      expect(getMimeTypeForImage('test.PNG')).toBe('image/png');
      expect(getMimeTypeForImage('test.JPG')).toBe('image/jpeg');
      expect(getMimeTypeForImage('test.GIF')).toBe('image/gif');
      expect(getMimeTypeForImage('test.WEBP')).toBe('image/webp');
    });

    it('should default to image/png for unknown extensions', () => {
      expect(getMimeTypeForImage('test.unknown')).toBe('image/png');
      expect(getMimeTypeForImage('test.txt')).toBe('image/png');
      expect(getMimeTypeForImage('test')).toBe('image/png');
    });

    it('should handle paths with multiple dots', () => {
      expect(getMimeTypeForImage('my.image.file.jpg')).toBe('image/jpeg');
    });
  });

  describe('readImageAsBase64', () => {
    // Skip on Windows as path.resolve converts Unix paths to Windows paths (CI runs on Linux)
    it.skipIf(process.platform === 'win32')(
      'should read image and return base64 data',
      async () => {
        const mockBuffer = Buffer.from(pngBase64Fixture, 'base64');
        vi.mocked(fs.readFile).mockResolvedValue(mockBuffer);

        const result = await readImageAsBase64('/path/to/test.png');

        expect(result).toMatchObject({
          base64: pngBase64Fixture,
          mimeType: 'image/png',
          filename: 'test.png',
          originalPath: '/path/to/test.png',
        });
        expect(fs.readFile).toHaveBeenCalledWith('/path/to/test.png');
      }
    );

    it('should handle different image formats', async () => {
      const mockBuffer = Buffer.from('jpeg-data');
      vi.mocked(fs.readFile).mockResolvedValue(mockBuffer);

      const result = await readImageAsBase64('/path/to/photo.jpg');

      expect(result.mimeType).toBe('image/jpeg');
      expect(result.filename).toBe('photo.jpg');
      expect(result.base64).toBe(mockBuffer.toString('base64'));
    });

    it('should extract filename from path', async () => {
      const mockBuffer = Buffer.from('data');
      vi.mocked(fs.readFile).mockResolvedValue(mockBuffer);

      const result = await readImageAsBase64('/deep/nested/path/image.webp');

      expect(result.filename).toBe('image.webp');
    });

    it('should throw error if file cannot be read', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      await expect(readImageAsBase64('/nonexistent.png')).rejects.toThrow('File not found');
    });
  });

  describe('convertImagesToContentBlocks', () => {
    it('should convert single image to content block', async () => {
      const mockBuffer = Buffer.from(pngBase64Fixture, 'base64');
      vi.mocked(fs.readFile).mockResolvedValue(mockBuffer);

      const result = await convertImagesToContentBlocks(['/path/test.png']);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: pngBase64Fixture,
        },
      });
    });

    it('should convert multiple images to content blocks', async () => {
      const mockBuffer = Buffer.from('test-data');
      vi.mocked(fs.readFile).mockResolvedValue(mockBuffer);

      const result = await convertImagesToContentBlocks(['/a.png', '/b.jpg', '/c.webp']);

      expect(result).toHaveLength(3);
      expect(result[0].source.media_type).toBe('image/png');
      expect(result[1].source.media_type).toBe('image/jpeg');
      expect(result[2].source.media_type).toBe('image/webp');
    });

    it('should resolve relative paths with workDir', async () => {
      const mockBuffer = Buffer.from('data');
      vi.mocked(fs.readFile).mockResolvedValue(mockBuffer);

      await convertImagesToContentBlocks(['relative.png'], '/work/dir');

      // Use path-agnostic check since Windows uses backslashes
      const calls = vi.mocked(fs.readFile).mock.calls;
      expect(calls[0][0]).toMatch(/relative\.png$/);
      expect(calls[0][0]).toContain('work');
      expect(calls[0][0]).toContain('dir');
    });

    // Skip on Windows as path.resolve converts Unix paths to Windows paths (CI runs on Linux)
    it.skipIf(process.platform === 'win32')(
      'should handle absolute paths without workDir',
      async () => {
        const mockBuffer = Buffer.from('data');
        vi.mocked(fs.readFile).mockResolvedValue(mockBuffer);

        await convertImagesToContentBlocks(['/absolute/path.png']);

        expect(fs.readFile).toHaveBeenCalledWith('/absolute/path.png');
      }
    );

    it('should continue processing on individual image errors', async () => {
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(Buffer.from('ok1'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(Buffer.from('ok2'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await convertImagesToContentBlocks(['/a.png', '/b.png', '/c.png']);

      expect(result).toHaveLength(2); // Only successful images
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should return empty array for empty input', async () => {
      const result = await convertImagesToContentBlocks([]);
      expect(result).toEqual([]);
    });

    // Skip on Windows as path.resolve converts Unix paths to Windows paths (CI runs on Linux)
    it.skipIf(process.platform === 'win32')('should handle undefined workDir', async () => {
      const mockBuffer = Buffer.from('data');
      vi.mocked(fs.readFile).mockResolvedValue(mockBuffer);

      const result = await convertImagesToContentBlocks(['/test.png'], undefined);

      expect(result).toHaveLength(1);
      expect(fs.readFile).toHaveBeenCalledWith('/test.png');
    });
  });

  describe('formatImagePathsForPrompt', () => {
    it('should format single image path as bulleted list', () => {
      const result = formatImagePathsForPrompt(['/path/image.png']);

      expect(result).toContain('\n\nAttached images:');
      expect(result).toContain('- /path/image.png');
    });

    it('should format multiple image paths as bulleted list', () => {
      const result = formatImagePathsForPrompt(['/path/a.png', '/path/b.jpg', '/path/c.webp']);

      expect(result).toContain('Attached images:');
      expect(result).toContain('- /path/a.png');
      expect(result).toContain('- /path/b.jpg');
      expect(result).toContain('- /path/c.webp');
    });

    it('should return empty string for empty array', () => {
      const result = formatImagePathsForPrompt([]);
      expect(result).toBe('');
    });

    it('should start with double newline', () => {
      const result = formatImagePathsForPrompt(['/test.png']);
      expect(result.startsWith('\n\n')).toBe(true);
    });

    it('should handle paths with special characters', () => {
      const result = formatImagePathsForPrompt(['/path/with spaces/image.png']);
      expect(result).toContain('- /path/with spaces/image.png');
    });
  });
});
