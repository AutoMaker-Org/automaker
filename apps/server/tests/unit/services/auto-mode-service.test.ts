import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoModeService } from '@/services/auto-mode-service.js';
import type { Feature } from '@automaker/types';

describe('auto-mode-service.ts', () => {
  let service: AutoModeService;
  const mockEvents = {
    subscribe: vi.fn(),
    emit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AutoModeService(mockEvents as any);
  });

  describe('constructor', () => {
    it('should initialize with event emitter', () => {
      expect(service).toBeDefined();
    });
  });

  describe('startAutoLoop', () => {
    it('should throw if auto mode is already running', async () => {
      // Start first loop
      const promise1 = service.startAutoLoop('/test/project', 3);

      // Try to start second loop
      await expect(service.startAutoLoop('/test/project', 3)).rejects.toThrow('already running');

      // Cleanup
      await service.stopAutoLoop();
      await promise1.catch(() => {});
    });

    it('should emit auto mode start event', async () => {
      const promise = service.startAutoLoop('/test/project', 3);

      // Give it time to emit the event
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockEvents.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: expect.stringContaining('Auto mode started'),
        })
      );

      // Cleanup
      await service.stopAutoLoop();
      await promise.catch(() => {});
    });
  });

  describe('stopAutoLoop', () => {
    it('should stop the auto loop', async () => {
      const promise = service.startAutoLoop('/test/project', 3);

      const runningCount = await service.stopAutoLoop();

      expect(runningCount).toBe(0);
      await promise.catch(() => {});
    });

    it('should return 0 when not running', async () => {
      const runningCount = await service.stopAutoLoop();
      expect(runningCount).toBe(0);
    });
  });

  describe('getRunningAgents', () => {
    // Helper to access private runningFeatures Map
    const getRunningFeaturesMap = (svc: AutoModeService) =>
      (svc as any).runningFeatures as Map<
        string,
        { featureId: string; projectPath: string; isAutoMode: boolean }
      >;

    // Helper to get the featureLoader and mock its get method
    const mockFeatureLoaderGet = (svc: AutoModeService, mockFn: ReturnType<typeof vi.fn>) => {
      (svc as any).featureLoader = { get: mockFn };
    };

    it('should return empty array when no agents are running', async () => {
      const result = await service.getRunningAgents();

      expect(result).toEqual([]);
    });

    it('should return running agents with basic info when feature data is not available', async () => {
      // Arrange: Add a running feature to the Map
      const runningFeaturesMap = getRunningFeaturesMap(service);
      runningFeaturesMap.set('feature-123', {
        featureId: 'feature-123',
        projectPath: '/test/project/path',
        isAutoMode: true,
      });

      // Mock featureLoader.get to return null (feature not found)
      const getMock = vi.fn().mockResolvedValue(null);
      mockFeatureLoaderGet(service, getMock);

      // Act
      const result = await service.getRunningAgents();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        featureId: 'feature-123',
        projectPath: '/test/project/path',
        projectName: 'path',
        isAutoMode: true,
        title: undefined,
        description: undefined,
      });
    });

    it('should return running agents with title and description when feature data is available', async () => {
      // Arrange
      const runningFeaturesMap = getRunningFeaturesMap(service);
      runningFeaturesMap.set('feature-456', {
        featureId: 'feature-456',
        projectPath: '/home/user/my-project',
        isAutoMode: false,
      });

      const mockFeature: Partial<Feature> = {
        id: 'feature-456',
        title: 'Implement user authentication',
        description: 'Add login and signup functionality',
        category: 'auth',
      };

      const getMock = vi.fn().mockResolvedValue(mockFeature);
      mockFeatureLoaderGet(service, getMock);

      // Act
      const result = await service.getRunningAgents();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        featureId: 'feature-456',
        projectPath: '/home/user/my-project',
        projectName: 'my-project',
        isAutoMode: false,
        title: 'Implement user authentication',
        description: 'Add login and signup functionality',
      });
      expect(getMock).toHaveBeenCalledWith('/home/user/my-project', 'feature-456');
    });

    it('should handle multiple running agents', async () => {
      // Arrange
      const runningFeaturesMap = getRunningFeaturesMap(service);
      runningFeaturesMap.set('feature-1', {
        featureId: 'feature-1',
        projectPath: '/project-a',
        isAutoMode: true,
      });
      runningFeaturesMap.set('feature-2', {
        featureId: 'feature-2',
        projectPath: '/project-b',
        isAutoMode: false,
      });

      const getMock = vi
        .fn()
        .mockResolvedValueOnce({
          id: 'feature-1',
          title: 'Feature One',
          description: 'Description one',
        })
        .mockResolvedValueOnce({
          id: 'feature-2',
          title: 'Feature Two',
          description: 'Description two',
        });
      mockFeatureLoaderGet(service, getMock);

      // Act
      const result = await service.getRunningAgents();

      // Assert
      expect(result).toHaveLength(2);
      expect(getMock).toHaveBeenCalledTimes(2);
    });

    it('should silently handle errors when fetching feature data', async () => {
      // Arrange
      const runningFeaturesMap = getRunningFeaturesMap(service);
      runningFeaturesMap.set('feature-error', {
        featureId: 'feature-error',
        projectPath: '/project-error',
        isAutoMode: true,
      });

      const getMock = vi.fn().mockRejectedValue(new Error('Database connection failed'));
      mockFeatureLoaderGet(service, getMock);

      // Act - should not throw
      const result = await service.getRunningAgents();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        featureId: 'feature-error',
        projectPath: '/project-error',
        projectName: 'project-error',
        isAutoMode: true,
        title: undefined,
        description: undefined,
      });
    });

    it('should handle feature with title but no description', async () => {
      // Arrange
      const runningFeaturesMap = getRunningFeaturesMap(service);
      runningFeaturesMap.set('feature-title-only', {
        featureId: 'feature-title-only',
        projectPath: '/project',
        isAutoMode: false,
      });

      const getMock = vi.fn().mockResolvedValue({
        id: 'feature-title-only',
        title: 'Only Title',
        // description is undefined
      });
      mockFeatureLoaderGet(service, getMock);

      // Act
      const result = await service.getRunningAgents();

      // Assert
      expect(result[0].title).toBe('Only Title');
      expect(result[0].description).toBeUndefined();
    });

    it('should handle feature with description but no title', async () => {
      // Arrange
      const runningFeaturesMap = getRunningFeaturesMap(service);
      runningFeaturesMap.set('feature-desc-only', {
        featureId: 'feature-desc-only',
        projectPath: '/project',
        isAutoMode: false,
      });

      const getMock = vi.fn().mockResolvedValue({
        id: 'feature-desc-only',
        description: 'Only description, no title',
        // title is undefined
      });
      mockFeatureLoaderGet(service, getMock);

      // Act
      const result = await service.getRunningAgents();

      // Assert
      expect(result[0].title).toBeUndefined();
      expect(result[0].description).toBe('Only description, no title');
    });

    it('should extract projectName from nested paths correctly', async () => {
      // Arrange
      const runningFeaturesMap = getRunningFeaturesMap(service);
      runningFeaturesMap.set('feature-nested', {
        featureId: 'feature-nested',
        projectPath: '/home/user/workspace/projects/my-awesome-project',
        isAutoMode: true,
      });

      const getMock = vi.fn().mockResolvedValue(null);
      mockFeatureLoaderGet(service, getMock);

      // Act
      const result = await service.getRunningAgents();

      // Assert
      expect(result[0].projectName).toBe('my-awesome-project');
    });

    it('should fetch feature data in parallel for multiple agents', async () => {
      // Arrange: Add multiple running features
      const runningFeaturesMap = getRunningFeaturesMap(service);
      for (let i = 1; i <= 5; i++) {
        runningFeaturesMap.set(`feature-${i}`, {
          featureId: `feature-${i}`,
          projectPath: `/project-${i}`,
          isAutoMode: i % 2 === 0,
        });
      }

      // Track call order
      const callOrder: string[] = [];
      const getMock = vi.fn().mockImplementation(async (projectPath: string, featureId: string) => {
        callOrder.push(featureId);
        // Simulate async delay to verify parallel execution
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { id: featureId, title: `Title for ${featureId}` };
      });
      mockFeatureLoaderGet(service, getMock);

      // Act
      const startTime = Date.now();
      const result = await service.getRunningAgents();
      const duration = Date.now() - startTime;

      // Assert
      expect(result).toHaveLength(5);
      expect(getMock).toHaveBeenCalledTimes(5);
      // If executed in parallel, total time should be ~10ms (one batch)
      // If sequential, it would be ~50ms (5 * 10ms)
      // Allow some buffer for execution overhead
      expect(duration).toBeLessThan(40);
    });
  });
});
