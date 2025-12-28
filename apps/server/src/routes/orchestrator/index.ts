/**
 * Orchestrator Routes
 *
 * API endpoints for controlling the autonomous workflow orchestrator.
 *
 * Routes:
 * - POST   /orchestrator/start    - Start the orchestrator
 * - POST   /orchestrator/stop     - Stop the orchestrator
 * - GET    /orchestrator/status   - Get current status
 * - PUT    /orchestrator/config   - Update configuration
 * - GET    /orchestrator/stats    - Get statistics
 * - GET    /orchestrator/tasks    - Get tracked tasks
 */

import { Router, type Request, type Response } from 'express';
import { getOrchestratorService } from '../../services/orchestrator-service.js';
import type { EventEmitter } from '../../lib/events.js';

/**
 * Create orchestrator routes
 */
export function createOrchestratorRoutes(events: EventEmitter): Router {
  const router = Router();

  /**
   * POST /orchestrator/start
   * Start the orchestrator
   */
  router.post('/start', async (req: Request, res: Response): Promise<void> => {
    try {
      const orchestrator = getOrchestratorService(events);
      await orchestrator.start();

      res.json({
        success: true,
        state: orchestrator.getState(),
      });
    } catch (error) {
      const statusCode = (error as { code?: string }).code === 'ALREADY_RUNNING' ? 409 : 500;
      res.status(statusCode).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * POST /orchestrator/stop
   * Stop the orchestrator
   */
  router.post('/stop', async (req: Request, res: Response): Promise<void> => {
    try {
      const orchestrator = getOrchestratorService(events);
      await orchestrator.stop();

      res.json({
        success: true,
        state: orchestrator.getState(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * GET /orchestrator/status
   * Get current orchestrator status
   */
  router.get('/status', async (req: Request, res: Response): Promise<void> => {
    try {
      const orchestrator = getOrchestratorService(events);
      const state = orchestrator.getState();

      res.json({
        success: true,
        ...state,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * PUT /orchestrator/config
   * Update orchestrator configuration
   */
  router.put('/config', async (req: Request, res: Response): Promise<void> => {
    try {
      const orchestrator = getOrchestratorService(events);
      orchestrator.updateConfig(req.body);

      res.json({
        success: true,
        config: orchestrator.getState().config,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * GET /orchestrator/stats
   * Get orchestrator statistics
   */
  router.get('/stats', async (req: Request, res: Response): Promise<void> => {
    try {
      const orchestrator = getOrchestratorService(events);
      const stats = orchestrator.getState().stats;

      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * GET /orchestrator/tasks
   * Get tracked tasks
   */
  router.get('/tasks', async (req: Request, res: Response): Promise<void> => {
    try {
      const orchestrator = getOrchestratorService(events);
      const tasks = Array.from(orchestrator.getTrackedTasks().values());

      res.json({
        success: true,
        tasks,
        count: tasks.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * GET /orchestrator/state-machine
   * Get state machine statistics
   */
  router.get('/state-machine', async (req: Request, res: Response): Promise<void> => {
    try {
      const orchestrator = getOrchestratorService(events);
      // Access state machine through internal API
      // For now, return basic info
      res.json({
        success: true,
        states: [
          'todo',
          'researching',
          'in_progress',
          'in_review',
          'queue_for_pr',
          'pr_created',
          'pr_fixes_needed',
          'ready_for_merge',
          'completed',
        ],
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  return router;
}

export default createOrchestratorRoutes;
