import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createIndexHandler } from '@/routes/running-agents/routes/index.js';
import type { AutoModeService } from '@/services/auto-mode-service.js';
import { createMockExpressContext } from '../../utils/mocks.js';

describe('running-agents routes', () => {
  let mockAutoModeService: Partial<AutoModeService>;
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAutoModeService = {
      getRunningAgents: vi.fn(),
    };

    const context = createMockExpressContext();
    req = context.req;
    res = context.res;
  });

  describe('GET / (index handler)', () => {
    it('should return empty array when no agents are running', async () => {
      // Arrange
      vi.mocked(mockAutoModeService.getRunningAgents!).mockResolvedValue([]);

      // Act
      const handler = createIndexHandler(mockAutoModeService as AutoModeService);
      await handler(req, res);

      // Assert
      expect(mockAutoModeService.getRunningAgents).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        runningAgents: [],
        totalCount: 0,
      });
    });

    it('should return running agents with all properties', async () => {
      // Arrange
      const runningAgents = [
        {
          featureId: 'feature-123',
          projectPath: '/home/user/project',
          projectName: 'project',
          isAutoMode: true,
          title: 'Implement login feature',
          description: 'Add user authentication with OAuth',
        },
        {
          featureId: 'feature-456',
          projectPath: '/home/user/other-project',
          projectName: 'other-project',
          isAutoMode: false,
          title: 'Fix navigation bug',
          description: undefined,
        },
      ];

      vi.mocked(mockAutoModeService.getRunningAgents!).mockResolvedValue(runningAgents);

      // Act
      const handler = createIndexHandler(mockAutoModeService as AutoModeService);
      await handler(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        runningAgents,
        totalCount: 2,
      });
    });

    it('should return agents without title/description (backward compatibility)', async () => {
      // Arrange
      const runningAgents = [
        {
          featureId: 'legacy-feature',
          projectPath: '/project',
          projectName: 'project',
          isAutoMode: true,
          title: undefined,
          description: undefined,
        },
      ];

      vi.mocked(mockAutoModeService.getRunningAgents!).mockResolvedValue(runningAgents);

      // Act
      const handler = createIndexHandler(mockAutoModeService as AutoModeService);
      await handler(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        runningAgents,
        totalCount: 1,
      });
    });

    it('should handle errors gracefully and return 500', async () => {
      // Arrange
      const error = new Error('Database connection failed');
      vi.mocked(mockAutoModeService.getRunningAgents!).mockRejectedValue(error);

      // Act
      const handler = createIndexHandler(mockAutoModeService as AutoModeService);
      await handler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Database connection failed',
      });
    });

    it('should handle non-Error exceptions', async () => {
      // Arrange
      vi.mocked(mockAutoModeService.getRunningAgents!).mockRejectedValue('String error');

      // Act
      const handler = createIndexHandler(mockAutoModeService as AutoModeService);
      await handler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: expect.any(String),
      });
    });

    it('should correctly count multiple running agents', async () => {
      // Arrange
      const runningAgents = Array.from({ length: 10 }, (_, i) => ({
        featureId: `feature-${i}`,
        projectPath: `/project-${i}`,
        projectName: `project-${i}`,
        isAutoMode: i % 2 === 0,
        title: `Feature ${i}`,
        description: `Description ${i}`,
      }));

      vi.mocked(mockAutoModeService.getRunningAgents!).mockResolvedValue(runningAgents);

      // Act
      const handler = createIndexHandler(mockAutoModeService as AutoModeService);
      await handler(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        runningAgents,
        totalCount: 10,
      });
    });

    it('should include agents from different projects', async () => {
      // Arrange
      const runningAgents = [
        {
          featureId: 'feature-a',
          projectPath: '/workspace/project-alpha',
          projectName: 'project-alpha',
          isAutoMode: true,
          title: 'Feature A',
          description: 'In project alpha',
        },
        {
          featureId: 'feature-b',
          projectPath: '/workspace/project-beta',
          projectName: 'project-beta',
          isAutoMode: false,
          title: 'Feature B',
          description: 'In project beta',
        },
      ];

      vi.mocked(mockAutoModeService.getRunningAgents!).mockResolvedValue(runningAgents);

      // Act
      const handler = createIndexHandler(mockAutoModeService as AutoModeService);
      await handler(req, res);

      // Assert
      const response = vi.mocked(res.json).mock.calls[0][0];
      expect(response.runningAgents[0].projectPath).toBe('/workspace/project-alpha');
      expect(response.runningAgents[1].projectPath).toBe('/workspace/project-beta');
    });
  });
});
