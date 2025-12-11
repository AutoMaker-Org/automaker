import { Router } from 'express';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger';
import { getAppDataDirectory, getTempDirectory } from '../utils/path-helpers';

export function setupAppRoutes(app: Router) {
  // Get system paths
  app.get('/app/paths/:name', (req, res) => {
    try {
      const { name } = req.params;
      let resultPath: string;

      switch (name) {
        case 'userData':
          resultPath = getAppDataDirectory('Automaker');
          break;
        case 'temp':
          resultPath = getTempDirectory();
          break;
        case 'desktop':
          resultPath = path.join(os.homedir(), 'Desktop');
          break;
        case 'documents':
          resultPath = path.join(os.homedir(), 'Documents');
          break;
        case 'downloads':
          resultPath = path.join(os.homedir(), 'Downloads');
          break;
        case 'home':
          resultPath = os.homedir();
          break;
        default:
          return res.status(400).json({ error: 'Invalid path name' });
      }

      res.json({ path: resultPath });
    } catch (error: any) {
      logger.error('Get path error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Save image to project
  app.post('/app/save-image', async (req, res) => {
    try {
      const { data, filename, mimeType, projectPath } = req.body;

      if (!data || !filename) {
        return res.status(400).json({ 
          success: false, 
          error: 'Data and filename are required' 
        });
      }

      // Determine the images directory
      let imagesDir: string;
      if (projectPath) {
        imagesDir = path.join(projectPath, '.automaker', 'images');
      } else {
        // Fallback to app data directory
        const appDataPath = getAppDataDirectory('Automaker');
        imagesDir = path.join(appDataPath, 'images');
      }

      // Create directory if it doesn't exist
      await fs.mkdir(imagesDir, { recursive: true });

      // Generate unique filename
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const imageFilePath = path.join(imagesDir, `${uniqueId}_${safeName}`);

      // Remove data URL prefix if present
      const base64Data = data.includes(',') ? data.split(',')[1] : data;

      // Write image to file
      await fs.writeFile(imageFilePath, base64Data, 'base64');

      logger.info('Saved image to:', imageFilePath);
      res.json({ success: true, path: imageFilePath });
    } catch (error: any) {
      logger.error('Save image error:', error);
      res.json({ success: false, error: error.message });
    }
  });
}