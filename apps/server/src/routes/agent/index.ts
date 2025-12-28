/**
 * Agent routes - HTTP API for Claude agent interactions
 */

import { Router } from 'express';
import { AgentService } from '../../services/agent-service.js';
import type { EventEmitter } from '../../lib/events.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createStartHandler } from './routes/start.js';
import { createSendHandler } from './routes/send.js';
import { createHistoryHandler } from './routes/history.js';
import { createStopHandler } from './routes/stop.js';
import { createClearHandler } from './routes/clear.js';
import { createModelHandler } from './routes/model.js';
import { createQueueAddHandler } from './routes/queue-add.js';
import { createQueueListHandler } from './routes/queue-list.js';
import { createQueueRemoveHandler } from './routes/queue-remove.js';
import { createQueueClearHandler } from './routes/queue-clear.js';

export function createAgentRoutes(agentService: AgentService, _events: EventEmitter): Router {
  const router = Router();

  router.post('/start', validatePathParams('workingDirectory?'), createStartHandler(agentService));
  router.post(
    '/send',
    validatePathParams('workingDirectory?', 'imagePaths[]'),
    createSendHandler(agentService)
  );
  router.post('/history', createHistoryHandler(agentService));
  router.post('/stop', createStopHandler(agentService));
  router.post('/clear', createClearHandler(agentService));
  router.post('/model', createModelHandler(agentService));

  // Queue routes
  router.post(
    '/queue/add',
    validatePathParams('imagePaths[]'),
    createQueueAddHandler(agentService)
  );
  router.post('/queue/list', createQueueListHandler(agentService));
  router.post('/queue/remove', createQueueRemoveHandler(agentService));
  router.post('/queue/clear', createQueueClearHandler(agentService));

  return router;
}
