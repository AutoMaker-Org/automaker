/**
 * File system routes
 * Provides REST API equivalents for Electron IPC file operations
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import { createReadHandler } from './routes/read.js';
import { createWriteHandler } from './routes/write.js';
import { createMkdirHandler } from './routes/mkdir.js';
import { createReaddirHandler } from './routes/readdir.js';
import { createExistsHandler } from './routes/exists.js';
import { createStatHandler } from './routes/stat.js';
import { createDeleteHandler } from './routes/delete.js';
import { createValidatePathHandler } from './routes/validate-path.js';
import { createResolveDirectoryHandler } from './routes/resolve-directory.js';
import { createSaveImageHandler } from './routes/save-image.js';
import { createBrowseHandler } from './routes/browse.js';
import { createImageHandler } from './routes/image.js';
import { createSaveBoardBackgroundHandler } from './routes/save-board-background.js';
import { createDeleteBoardBackgroundHandler } from './routes/delete-board-background.js';
import { createBrowseProjectFilesHandler } from './routes/browse-project-files.js';
import { createCopyHandler } from './routes/copy.js';
import { createMoveHandler } from './routes/move.js';
import { createDownloadHandler } from './routes/download.js';

export function createFsRoutes(_events: EventEmitter): Router {
  const router = Router();

  router.post('/read', createReadHandler());
  router.post('/write', createWriteHandler());
  router.post('/mkdir', createMkdirHandler());
  router.post('/readdir', createReaddirHandler());
  router.post('/exists', createExistsHandler());
  router.post('/stat', createStatHandler());
  router.post('/delete', createDeleteHandler());
  router.post('/validate-path', createValidatePathHandler());
  router.post('/resolve-directory', createResolveDirectoryHandler());
  router.post('/save-image', createSaveImageHandler());
  router.post('/browse', createBrowseHandler());
  router.get('/image', createImageHandler());
  router.post('/save-board-background', createSaveBoardBackgroundHandler());
  router.post('/delete-board-background', createDeleteBoardBackgroundHandler());
  router.post('/browse-project-files', createBrowseProjectFilesHandler());
  router.post('/copy', createCopyHandler());
  router.post('/move', createMoveHandler());
  router.post('/download', createDownloadHandler());

  return router;
}
