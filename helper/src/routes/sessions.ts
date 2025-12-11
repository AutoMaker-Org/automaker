import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { getAppDataDirectory } from '../utils/path-helpers';

interface Session {
  id: string;
  name: string;
  projectPath: string;
  workingDirectory: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  tags?: string[];
}

export function setupSessionRoutes(app: Router) {
  const sessionsDir = path.join(getAppDataDirectory('Automaker'), 'sessions');

  // Ensure sessions directory exists
  const ensureSessionsDir = async () => {
    await fs.mkdir(sessionsDir, { recursive: true });
  };

  // Get session file path
  const getSessionPath = (sessionId: string) => {
    return path.join(sessionsDir, `${sessionId}.json`);
  };

  // List all sessions
  app.get('/sessions', async (req, res) => {
    try {
      const { includeArchived } = req.query;
      await ensureSessionsDir();

      const files = await fs.readdir(sessionsDir);
      const sessions: Session[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(sessionsDir, file), 'utf-8');
            const session = JSON.parse(content) as Session;
            
            if (includeArchived === 'true' || !session.archived) {
              sessions.push(session);
            }
          } catch (err) {
            logger.warn(`Failed to read session file ${file}:`, err);
          }
        }
      }

      // Sort by updatedAt descending
      sessions.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      res.json({ success: true, sessions });
    } catch (error: any) {
      logger.error('List sessions error:', error);
      res.json({ success: false, error: error.message, sessions: [] });
    }
  });

  // Create a new session
  app.post('/sessions', async (req, res) => {
    try {
      const { name, projectPath, workingDirectory } = req.body;
      
      if (!name || !projectPath) {
        return res.status(400).json({ 
          success: false, 
          error: 'Name and projectPath are required' 
        });
      }

      await ensureSessionsDir();

      const session: Session = {
        id: uuidv4(),
        name,
        projectPath,
        workingDirectory: workingDirectory || projectPath,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        archived: false,
        tags: []
      };

      const sessionPath = getSessionPath(session.id);
      await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));

      res.json({ success: true, session });
    } catch (error: any) {
      logger.error('Create session error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Update session metadata
  app.put('/sessions/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, tags } = req.body;

      const sessionPath = getSessionPath(id);
      
      try {
        const content = await fs.readFile(sessionPath, 'utf-8');
        const session = JSON.parse(content) as Session;
        
        if (name !== undefined) session.name = name;
        if (tags !== undefined) session.tags = tags;
        session.updatedAt = new Date().toISOString();

        await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));
        res.json({ success: true });
      } catch (err) {
        res.status(404).json({ success: false, error: 'Session not found' });
      }
    } catch (error: any) {
      logger.error('Update session error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Archive a session
  app.post('/sessions/:id/archive', async (req, res) => {
    try {
      const { id } = req.params;
      const sessionPath = getSessionPath(id);
      
      try {
        const content = await fs.readFile(sessionPath, 'utf-8');
        const session = JSON.parse(content) as Session;
        
        session.archived = true;
        session.updatedAt = new Date().toISOString();

        await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));
        res.json({ success: true });
      } catch (err) {
        res.status(404).json({ success: false, error: 'Session not found' });
      }
    } catch (error: any) {
      logger.error('Archive session error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Unarchive a session
  app.post('/sessions/:id/unarchive', async (req, res) => {
    try {
      const { id } = req.params;
      const sessionPath = getSessionPath(id);
      
      try {
        const content = await fs.readFile(sessionPath, 'utf-8');
        const session = JSON.parse(content) as Session;
        
        session.archived = false;
        session.updatedAt = new Date().toISOString();

        await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));
        res.json({ success: true });
      } catch (err) {
        res.status(404).json({ success: false, error: 'Session not found' });
      }
    } catch (error: any) {
      logger.error('Unarchive session error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Delete a session
  app.delete('/sessions/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const sessionPath = getSessionPath(id);
      
      try {
        await fs.unlink(sessionPath);
        res.json({ success: true });
      } catch (err) {
        res.status(404).json({ success: false, error: 'Session not found' });
      }
    } catch (error: any) {
      logger.error('Delete session error:', error);
      res.json({ success: false, error: error.message });
    }
  });
}