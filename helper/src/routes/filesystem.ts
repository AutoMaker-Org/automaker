import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';
import { isPathSafe } from '../utils/path-helpers';
import { MAX_FILE_SIZE } from '../config';

export function setupFileSystemRoutes(app: Router) {
  // Read file
  app.post('/fs/read', async (req, res) => {
    const { path: filePath } = req.body;
    
    try {
      if (!filePath) {
        return res.status(400).json({ success: false, error: 'Path is required' });
      }

      const content = await fs.readFile(filePath, 'utf-8');
      res.json({ success: true, content });
    } catch (error: any) {
      // ENOENT (file not found) is often expected, so log it as info instead of error
      if (error.code === 'ENOENT') {
        logger.info(`File not found: ${filePath}`);
      } else {
        logger.error('Read file error:', error);
      }
      res.json({ success: false, error: error.message });
    }
  });

  // Write file
  app.post('/fs/write', async (req, res) => {
    try {
      const { path: filePath, content } = req.body;
      
      if (!filePath || content === undefined) {
        return res.status(400).json({ success: false, error: 'Path and content are required' });
      }

      // Create directory if it doesn't exist
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Write file error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Create directory
  app.post('/fs/mkdir', async (req, res) => {
    try {
      const { path: dirPath } = req.body;
      
      if (!dirPath) {
        return res.status(400).json({ success: false, error: 'Path is required' });
      }

      await fs.mkdir(dirPath, { recursive: true });
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Mkdir error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Read directory
  app.post('/fs/readdir', async (req, res) => {
    try {
      const { path: dirPath } = req.body;
      
      if (!dirPath) {
        return res.status(400).json({ success: false, error: 'Path is required' });
      }

      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const result = entries.map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile()
      }));

      res.json({ success: true, entries: result });
    } catch (error: any) {
      logger.error('Readdir error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Check if file/directory exists
  app.post('/fs/exists', async (req, res) => {
    try {
      const { path: filePath } = req.body;
      
      if (!filePath) {
        return res.status(400).json({ exists: false });
      }

      try {
        await fs.access(filePath);
        res.json({ exists: true });
      } catch {
        res.json({ exists: false });
      }
    } catch (error: any) {
      logger.error('Exists error:', error);
      res.json({ exists: false });
    }
  });

  // Get file stats
  app.post('/fs/stat', async (req, res) => {
    try {
      const { path: filePath } = req.body;
      
      if (!filePath) {
        return res.status(400).json({ success: false, error: 'Path is required' });
      }

      const stats = await fs.stat(filePath);
      res.json({
        success: true,
        stats: {
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          size: stats.size,
          mtime: stats.mtime.toISOString()
        }
      });
    } catch (error: any) {
      logger.error('Stat error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Delete file
  app.post('/fs/delete', async (req, res) => {
    try {
      const { path: filePath } = req.body;
      
      if (!filePath) {
        return res.status(400).json({ success: false, error: 'Path is required' });
      }

      await fs.unlink(filePath);
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Delete error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Move to trash (platform-specific)
  app.post('/fs/trash', async (req, res) => {
    try {
      const { path: filePath } = req.body;

      if (!filePath) {
        return res.status(400).json({ success: false, error: 'Path is required' });
      }

      // Check if it's a directory or file
      const stats = await fs.stat(filePath);

      if (stats.isDirectory()) {
        // Delete directory recursively
        await fs.rm(filePath, { recursive: true, force: true });
      } else {
        // Delete file
        await fs.unlink(filePath);
      }

      res.json({ success: true });
    } catch (error: any) {
      logger.error('Trash error:', error);
      res.json({ success: false, error: error.message });
    }
  });
}