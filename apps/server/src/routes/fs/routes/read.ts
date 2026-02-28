/**
 * POST /read endpoint - Read file
 */

import type { Request, Response } from 'express';
import path from 'path';
import * as secureFs from '../../../lib/secure-fs.js';
import { PathNotAllowedError } from '@automaker/platform';
import { getErrorMessage, logError } from '../common.js';

// Optional files that are expected to not exist in new projects
// Don't log ENOENT errors for these to reduce noise
const OPTIONAL_FILES = ['categories.json', 'app_spec.txt', 'context-metadata.json'];

function isOptionalFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  if (OPTIONAL_FILES.some((optionalFile) => basename === optionalFile)) {
    return true;
  }
  // Context and memory files may not exist yet during create/delete or test races
  if (filePath.includes('.automaker/context/') || filePath.includes('.automaker/memory/')) {
    const name = path.basename(filePath);
    const lower = name.toLowerCase();
    if (lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.markdown')) {
      return true;
    }
  }
  return false;
}

function isENOENT(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

export function createReadHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      const content = await secureFs.readFile(filePath, 'utf-8');

      res.json({ success: true, content });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      const filePath = req.body?.filePath || '';
      const optionalMissing = isENOENT(error) && isOptionalFile(filePath);
      if (!optionalMissing) {
        logError(error, 'Read file failed');
      }
      // Return 404 for missing optional files so clients can handle "not found"
      const status = optionalMissing ? 404 : 500;
      res.status(status).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
