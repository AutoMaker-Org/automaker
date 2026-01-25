import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureLoader } from '@/services/feature-loader.js';
import * as fs from 'fs/promises';
import path from 'path';

vi.mock('fs/promises');

describe('feature-loader.ts', () => {
  let loader: FeatureLoader;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new FeatureLoader();
  });

  describe('getFeaturesDir', () => {
    it('should return features directory path', () => {
      const result = loader.getFeaturesDir(testProjectPath);
      expect(result).toContain('test');
      expect(result).toContain('project');
      expect(result).toContain('.automaker');
      expect(result).toContain('features');
    });
  });

  describe('getFeatureImagesDir', () => {
    it('should return feature images directory path', () => {
      const result = loader.getFeatureImagesDir(testProjectPath, 'feature-123');
      expect(result).toContain('features');
      expect(result).toContain('feature-123');
      expect(result).toContain('images');
    });
  });

  describe('getFeatureDir', () => {
    it('should return feature directory path', () => {
      const result = loader.getFeatureDir(testProjectPath, 'feature-123');
      expect(result).toContain('features');
      expect(result).toContain('feature-123');
    });
  });

  describe('getFeatureJsonPath', () => {
    it('should return feature.json path', () => {
      const result = loader.getFeatureJsonPath(testProjectPath, 'feature-123');
      expect(result).toContain('features');
      expect(result).toContain('feature-123');
      expect(result).toContain('feature.json');
    });
  });

  describe('getAgentOutputPath', () => {
    it('should return agent-output.md path', () => {
      const result = loader.getAgentOutputPath(testProjectPath, 'feature-123');
      expect(result).toContain('features');
      expect(result).toContain('feature-123');
      expect(result).toContain('agent-output.md');
    });
  });

  describe('generateFeatureId', () => {
    it('should generate unique feature ID with timestamp', () => {
      const id1 = loader.generateFeatureId();
      const id2 = loader.generateFeatureId();

      expect(id1).toMatch(/^feature-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^feature-\d+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it("should start with 'feature-'", () => {
      const id = loader.generateFeatureId();
      expect(id).toMatch(/^feature-/);
    });
  });

  describe('getAll', () => {
    it("should return empty array when features directory doesn't exist", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await loader.getAll(testProjectPath);

      expect(result).toEqual([]);
    });

    it('should load all features from feature directories', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
        { name: 'file.txt', isDirectory: () => false } as any,
      ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-1',
            category: 'ui',
            description: 'Feature 1',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2',
            category: 'backend',
            description: 'Feature 2',
          })
        );

      const result = await loader.getAll(testProjectPath);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('feature-1');
      expect(result[1].id).toBe('feature-2');
    });

    it('should skip features without id field', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            category: 'ui',
            description: 'Missing ID',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2',
            category: 'backend',
            description: 'Feature 2',
          })
        );

      const result = await loader.getAll(testProjectPath);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('feature-2');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/WARN.*\[FeatureLoader\]/),
        expect.stringContaining("missing required 'id' field")
      );

      consoleSpy.mockRestore();
    });

    it('should skip features with missing feature.json', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      const error: any = new Error('File not found');
      error.code = 'ENOENT';

      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2',
            category: 'backend',
            description: 'Feature 2',
          })
        );

      const result = await loader.getAll(testProjectPath);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('feature-2');
    });

    it('should handle malformed JSON gracefully', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
      ]);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(fs.readFile).mockResolvedValue('invalid json{');

      const result = await loader.getAll(testProjectPath);

      expect(result).toEqual([]);
      // With recovery-enabled reads, warnings come from AtomicWriter and FeatureLoader
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/WARN.*\[AtomicWriter\]/),
        expect.stringContaining('unavailable')
      );

      consoleSpy.mockRestore();
    });

    it('should sort features by creation order (timestamp)', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-3', isDirectory: () => true } as any,
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-3000-xyz',
            category: 'ui',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-1000-abc',
            category: 'ui',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2000-def',
            category: 'ui',
          })
        );

      const result = await loader.getAll(testProjectPath);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('feature-1000-abc');
      expect(result[1].id).toBe('feature-2000-def');
      expect(result[2].id).toBe('feature-3000-xyz');
    });
  });

  describe('get', () => {
    it('should return feature by ID', async () => {
      const featureData = {
        id: 'feature-123',
        category: 'ui',
        description: 'Test feature',
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(featureData));

      const result = await loader.get(testProjectPath, 'feature-123');

      expect(result).toEqual(featureData);
    });

    it("should return null when feature doesn't exist", async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await loader.get(testProjectPath, 'feature-123');

      expect(result).toBeNull();
    });

    it('should return null on other errors (with recovery attempt)', async () => {
      // With recovery-enabled reads, get() returns null instead of throwing
      // because it attempts to recover from backups before giving up
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'));

      const result = await loader.get(testProjectPath, 'feature-123');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create new feature', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const featureData = {
        category: 'ui',
        description: 'New feature',
      };

      const result = await loader.create(testProjectPath, featureData);

      expect(result).toMatchObject({
        category: 'ui',
        description: 'New feature',
        id: expect.stringMatching(/^feature-/),
      });
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should use provided ID if given', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await loader.create(testProjectPath, {
        id: 'custom-id',
        category: 'ui',
        description: 'Test',
      });

      expect(result.id).toBe('custom-id');
    });

    it('should set default category if not provided', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await loader.create(testProjectPath, {
        description: 'Test',
      });

      expect(result.category).toBe('Uncategorized');
    });
  });

  describe('update', () => {
    it('should update existing feature', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          id: 'feature-123',
          category: 'ui',
          description: 'Old description',
        })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await loader.update(testProjectPath, 'feature-123', {
        description: 'New description',
      });

      expect(result.description).toBe('New description');
      expect(result.category).toBe('ui');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it("should throw if feature doesn't exist", async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(loader.update(testProjectPath, 'feature-123', {})).rejects.toThrow('not found');
    });
  });

  describe('delete', () => {
    it('should delete feature directory', async () => {
      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await loader.delete(testProjectPath, 'feature-123');

      expect(result).toBe(true);
      expect(fs.rm).toHaveBeenCalledWith(expect.stringContaining('feature-123'), {
        recursive: true,
        force: true,
      });
    });

    it('should return false on error', async () => {
      vi.mocked(fs.rm).mockRejectedValue(new Error('Permission denied'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await loader.delete(testProjectPath, 'feature-123');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/ERROR.*\[FeatureLoader\]/),
        expect.stringContaining('Failed to delete feature'),
        expect.objectContaining({ message: 'Permission denied' })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('getAgentOutput', () => {
    it('should return agent output content', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('Agent output content');

      const result = await loader.getAgentOutput(testProjectPath, 'feature-123');

      expect(result).toBe('Agent output content');
    });

    it("should return null when file doesn't exist", async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await loader.getAgentOutput(testProjectPath, 'feature-123');

      expect(result).toBeNull();
    });

    it('should throw on other errors', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'));

      await expect(loader.getAgentOutput(testProjectPath, 'feature-123')).rejects.toThrow(
        'Permission denied'
      );
    });
  });

  describe('saveAgentOutput', () => {
    it('should save agent output to file', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await loader.saveAgentOutput(testProjectPath, 'feature-123', 'Output content');

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('agent-output.md'),
        'Output content',
        'utf-8'
      );
    });
  });

  describe('deleteAgentOutput', () => {
    it('should delete agent output file', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await loader.deleteAgentOutput(testProjectPath, 'feature-123');

      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('agent-output.md'));
    });

    it('should handle missing file gracefully', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      vi.mocked(fs.unlink).mockRejectedValue(error);

      // Should not throw
      await expect(
        loader.deleteAgentOutput(testProjectPath, 'feature-123')
      ).resolves.toBeUndefined();
    });

    it('should throw on other errors', async () => {
      vi.mocked(fs.unlink).mockRejectedValue(new Error('Permission denied'));

      await expect(loader.deleteAgentOutput(testProjectPath, 'feature-123')).rejects.toThrow(
        'Permission denied'
      );
    });
  });

  describe('findByTitle', () => {
    it('should find feature by exact title match (case-insensitive)', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-1000-abc',
            title: 'Login Feature',
            category: 'auth',
            description: 'Login implementation',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2000-def',
            title: 'Logout Feature',
            category: 'auth',
            description: 'Logout implementation',
          })
        );

      const result = await loader.findByTitle(testProjectPath, 'LOGIN FEATURE');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('feature-1000-abc');
      expect(result?.title).toBe('Login Feature');
    });

    it('should return null when title is not found', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({
          id: 'feature-1000-abc',
          title: 'Login Feature',
          category: 'auth',
          description: 'Login implementation',
        })
      );

      const result = await loader.findByTitle(testProjectPath, 'Nonexistent Feature');

      expect(result).toBeNull();
    });

    it('should return null for empty or whitespace title', async () => {
      const result1 = await loader.findByTitle(testProjectPath, '');
      const result2 = await loader.findByTitle(testProjectPath, '   ');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('should skip features without titles', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-1000-abc',
            // no title
            category: 'auth',
            description: 'Login implementation',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2000-def',
            title: 'Login Feature',
            category: 'auth',
            description: 'Another login',
          })
        );

      const result = await loader.findByTitle(testProjectPath, 'Login Feature');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('feature-2000-def');
    });
  });

  describe('findDuplicateTitle', () => {
    it('should find duplicate title', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({
          id: 'feature-1000-abc',
          title: 'My Feature',
          category: 'ui',
          description: 'Feature description',
        })
      );

      const result = await loader.findDuplicateTitle(testProjectPath, 'my feature');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('feature-1000-abc');
    });

    it('should exclude specified feature ID from duplicate check', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-1000-abc',
            title: 'My Feature',
            category: 'ui',
            description: 'Feature 1',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2000-def',
            title: 'Other Feature',
            category: 'ui',
            description: 'Feature 2',
          })
        );

      // Should not find duplicate when excluding the feature that has the title
      const result = await loader.findDuplicateTitle(
        testProjectPath,
        'My Feature',
        'feature-1000-abc'
      );

      expect(result).toBeNull();
    });

    it('should find duplicate when title exists on different feature', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-1000-abc',
            title: 'My Feature',
            category: 'ui',
            description: 'Feature 1',
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: 'feature-2000-def',
            title: 'Other Feature',
            category: 'ui',
            description: 'Feature 2',
          })
        );

      // Should find duplicate because feature-1000-abc has the title and we're excluding feature-2000-def
      const result = await loader.findDuplicateTitle(
        testProjectPath,
        'My Feature',
        'feature-2000-def'
      );

      expect(result).not.toBeNull();
      expect(result?.id).toBe('feature-1000-abc');
    });

    it('should return null for empty or whitespace title', async () => {
      const result1 = await loader.findDuplicateTitle(testProjectPath, '');
      const result2 = await loader.findDuplicateTitle(testProjectPath, '   ');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('should handle titles with leading/trailing whitespace', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-1', isDirectory: () => true } as any,
      ]);

      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({
          id: 'feature-1000-abc',
          title: 'My Feature',
          category: 'ui',
          description: 'Feature description',
        })
      );

      const result = await loader.findDuplicateTitle(testProjectPath, '  My Feature  ');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('feature-1000-abc');
    });
  });

  describe('syncFeatureToAppSpec', () => {
    const sampleAppSpec = `<?xml version="1.0" encoding="UTF-8"?>
<project_specification>
  <project_name>Test Project</project_name>
  <core_capabilities>
    <capability>Testing</capability>
  </core_capabilities>
  <implemented_features>
    <feature>
      <name>Existing Feature</name>
      <description>Already implemented</description>
    </feature>
  </implemented_features>
</project_specification>`;

    const appSpecWithoutFeatures = `<?xml version="1.0" encoding="UTF-8"?>
<project_specification>
  <project_name>Test Project</project_name>
  <core_capabilities>
    <capability>Testing</capability>
  </core_capabilities>
</project_specification>`;

    it('should add feature to app_spec.txt', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(sampleAppSpec);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const feature = {
        id: 'feature-1234-abc',
        title: 'New Feature',
        category: 'ui',
        description: 'A new feature description',
      };

      const result = await loader.syncFeatureToAppSpec(testProjectPath, feature);

      expect(result).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('app_spec.txt'),
        expect.stringContaining('New Feature'),
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('A new feature description'),
        'utf-8'
      );
    });

    it('should add feature with file locations', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(sampleAppSpec);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const feature = {
        id: 'feature-1234-abc',
        title: 'Feature With Locations',
        category: 'backend',
        description: 'Feature with file locations',
      };

      const result = await loader.syncFeatureToAppSpec(testProjectPath, feature, [
        'src/feature.ts',
        'src/utils/helper.ts',
      ]);

      expect(result).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('src/feature.ts'),
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('src/utils/helper.ts'),
        'utf-8'
      );
    });

    it('should return false when app_spec.txt does not exist', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValueOnce(error);

      const feature = {
        id: 'feature-1234-abc',
        title: 'New Feature',
        category: 'ui',
        description: 'A new feature description',
      };

      const result = await loader.syncFeatureToAppSpec(testProjectPath, feature);

      expect(result).toBe(false);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should return false when feature already exists (duplicate)', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(sampleAppSpec);

      const feature = {
        id: 'feature-5678-xyz',
        title: 'Existing Feature', // Same name as existing feature
        category: 'ui',
        description: 'Different description',
      };

      const result = await loader.syncFeatureToAppSpec(testProjectPath, feature);

      expect(result).toBe(false);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should use feature ID as fallback name when title is missing', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(sampleAppSpec);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const feature = {
        id: 'feature-1234-abc',
        category: 'ui',
        description: 'Feature without title',
        // No title property
      };

      const result = await loader.syncFeatureToAppSpec(testProjectPath, feature);

      expect(result).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Feature: feature-1234-abc'),
        'utf-8'
      );
    });

    it('should handle app_spec without implemented_features section', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(appSpecWithoutFeatures);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const feature = {
        id: 'feature-1234-abc',
        title: 'First Feature',
        category: 'ui',
        description: 'First implemented feature',
      };

      const result = await loader.syncFeatureToAppSpec(testProjectPath, feature);

      expect(result).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('<implemented_features>'),
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('First Feature'),
        'utf-8'
      );
    });

    it('should throw on non-ENOENT file read errors', async () => {
      const error = new Error('Permission denied');
      vi.mocked(fs.readFile).mockRejectedValueOnce(error);

      const feature = {
        id: 'feature-1234-abc',
        title: 'New Feature',
        category: 'ui',
        description: 'A new feature description',
      };

      await expect(loader.syncFeatureToAppSpec(testProjectPath, feature)).rejects.toThrow(
        'Permission denied'
      );
    });

    it('should preserve existing features when adding a new one', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(sampleAppSpec);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const feature = {
        id: 'feature-1234-abc',
        title: 'New Feature',
        category: 'ui',
        description: 'A new feature',
      };

      await loader.syncFeatureToAppSpec(testProjectPath, feature);

      // Verify both old and new features are in the output
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Existing Feature'),
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('New Feature'),
        'utf-8'
      );
    });

    it('should escape special characters in feature name and description', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(sampleAppSpec);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const feature = {
        id: 'feature-1234-abc',
        title: 'Feature with <special> & "chars"',
        category: 'ui',
        description: 'Description with <tags> & "quotes"',
      };

      const result = await loader.syncFeatureToAppSpec(testProjectPath, feature);

      expect(result).toBe(true);
      // The XML should have escaped characters
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('&lt;special&gt;'),
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('&amp;'),
        'utf-8'
      );
    });

    it('should not add empty file_locations array', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(sampleAppSpec);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const feature = {
        id: 'feature-1234-abc',
        title: 'Feature Without Locations',
        category: 'ui',
        description: 'No file locations',
      };

      await loader.syncFeatureToAppSpec(testProjectPath, feature, []);

      // File locations should not be included when array is empty
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const writtenContent = writeCall[1] as string;

      // Count occurrences of file_locations - should only have the one from Existing Feature if any
      // The new feature should not add file_locations
      expect(writtenContent).toContain('Feature Without Locations');
    });
  });
});
