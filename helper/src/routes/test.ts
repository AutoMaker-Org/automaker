import { Router } from 'express';
import { logger } from '../utils/logger';

export function setupTestRoutes(app: Router, wsHandler: any) {
  // Test endpoint to trigger a feature run via HTTP
  app.post('/test/run-feature', async (req, res) => {
    const { projectPath, featureId } = req.body;

    logger.info('[TEST] Triggering feature run:', { projectPath, featureId });

    // Directly call the handler as if a WebSocket message was received
    try {
      await wsHandler.handleMessage({
        type: 'auto-mode:run-feature',
        projectPath,
        featureId
      });

      res.json({ success: true, message: 'Feature run triggered' });
    } catch (error: any) {
      logger.error('[TEST] Error:', error);
      res.json({ success: false, error: error.message });
    }
  });
}
