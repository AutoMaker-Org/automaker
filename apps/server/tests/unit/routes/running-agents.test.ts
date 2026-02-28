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
          model: 'claude-sonnet-4-20250514',
          provider: 'claude',
          title: 'Implement login feature',
          description: 'Add user authentication with OAuth',
        },
        {
          featureId: 'feature-456',
          projectPath: '/home/user/other-project',
          projectName: 'other-project',
          isAutoMode: false,
          model: 'codex-gpt-5.1',
          provider: 'codex',
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
          model: undefined,
          provider: undefined,
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
        model: i % 3 === 0 ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5',
        provider: 'claude',
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
          model: 'claude-sonnet-4-20250514',
          provider: 'claude',
          title: 'Feature A',
          description: 'In project alpha',
        },
        {
          featureId: 'feature-b',
          projectPath: '/workspace/project-beta',
          projectName: 'project-beta',
          isAutoMode: false,
          model: 'codex-gpt-5.1',
          provider: 'codex',
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

    it('should include model and provider information for running agents', async () => {
      // Arrange
      const runningAgents = [
        {
          featureId: 'feature-claude',
          projectPath: '/project',
          projectName: 'project',
          isAutoMode: true,
          model: 'claude-sonnet-4-20250514',
          provider: 'claude',
          title: 'Claude Feature',
          description: 'Using Claude model',
        },
        {
          featureId: 'feature-codex',
          projectPath: '/project',
          projectName: 'project',
          isAutoMode: false,
          model: 'codex-gpt-5.1',
          provider: 'codex',
          title: 'Codex Feature',
          description: 'Using Codex model',
        },
        {
          featureId: 'feature-cursor',
          projectPath: '/project',
          projectName: 'project',
          isAutoMode: false,
          model: 'cursor-auto',
          provider: 'cursor',
          title: 'Cursor Feature',
          description: 'Using Cursor model',
        },
      ];

      vi.mocked(mockAutoModeService.getRunningAgents!).mockResolvedValue(runningAgents);

      // Act
      const handler = createIndexHandler(mockAutoModeService as AutoModeService);
      await handler(req, res);

      // Assert
      const response = vi.mocked(res.json).mock.calls[0][0];
      expect(response.runningAgents[0].model).toBe('claude-sonnet-4-20250514');
      expect(response.runningAgents[0].provider).toBe('claude');
      expect(response.runningAgents[1].model).toBe('codex-gpt-5.1');
      expect(response.runningAgents[1].provider).toBe('codex');
      expect(response.runningAgents[2].model).toBe('cursor-auto');
      expect(response.runningAgents[2].provider).toBe('cursor');
    });
  });
});
