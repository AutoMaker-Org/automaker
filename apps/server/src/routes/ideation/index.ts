/**
 * Ideation routes - HTTP API for brainstorming and idea management
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import type { IdeationService } from '../../services/ideation-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';

// Route handlers
import { createSessionStartHandler } from './routes/session-start.js';
import { createSessionMessageHandler } from './routes/session-message.js';
import { createSessionStopHandler } from './routes/session-stop.js';
import { createSessionGetHandler } from './routes/session-get.js';
import { createIdeasListHandler } from './routes/ideas-list.js';
import { createIdeasCreateHandler } from './routes/ideas-create.js';
import { createIdeasGetHandler } from './routes/ideas-get.js';
import { createIdeasUpdateHandler } from './routes/ideas-update.js';
import { createIdeasDeleteHandler } from './routes/ideas-delete.js';
import { createAnalyzeHandler, createGetAnalysisHandler } from './routes/analyze.js';
import { createConvertHandler } from './routes/convert.js';
import { createAddSuggestionHandler } from './routes/add-suggestion.js';
import { createPromptsHandler, createPromptsByCategoryHandler } from './routes/prompts.js';
import { createSuggestionsGenerateHandler } from './routes/suggestions-generate.js';

export function createIdeationRoutes(
  events: EventEmitter,
  ideationService: IdeationService,
  featureLoader: FeatureLoader
): Router {
  const router = Router();

  // Session management
  router.post(
    '/session/start',
    validatePathParams('projectPath'),
    createSessionStartHandler(ideationService)
  );
  router.post('/session/message', createSessionMessageHandler(ideationService));
  router.post('/session/stop', createSessionStopHandler(events, ideationService));
  router.post(
    '/session/get',
    validatePathParams('projectPath'),
    createSessionGetHandler(ideationService)
  );

  // Ideas CRUD
  router.post(
    '/ideas/list',
    validatePathParams('projectPath'),
    createIdeasListHandler(ideationService)
  );
  router.post(
    '/ideas/create',
    validatePathParams('projectPath'),
    createIdeasCreateHandler(events, ideationService)
  );
  router.post(
    '/ideas/get',
    validatePathParams('projectPath'),
    createIdeasGetHandler(ideationService)
  );
  router.post(
    '/ideas/update',
    validatePathParams('projectPath'),
    createIdeasUpdateHandler(events, ideationService)
  );
  router.post(
    '/ideas/delete',
    validatePathParams('projectPath'),
    createIdeasDeleteHandler(events, ideationService)
  );

  // Project analysis
  router.post('/analyze', validatePathParams('projectPath'), createAnalyzeHandler(ideationService));
  router.post(
    '/analysis',
    validatePathParams('projectPath'),
    createGetAnalysisHandler(ideationService)
  );

  // Convert to feature
  router.post(
    '/convert',
    validatePathParams('projectPath'),
    createConvertHandler(events, ideationService, featureLoader)
  );

  // Add suggestion to board as a feature
  router.post(
    '/add-suggestion',
    validatePathParams('projectPath'),
    createAddSuggestionHandler(ideationService, featureLoader)
  );

  // Guided prompts (no validation needed - static data)
  router.get('/prompts', createPromptsHandler(ideationService));
  router.get('/prompts/:category', createPromptsByCategoryHandler(ideationService));

  // Generate suggestions (structured output)
  router.post(
    '/suggestions/generate',
    validatePathParams('projectPath'),
    createSuggestionsGenerateHandler(ideationService)
  );

  return router;
}
