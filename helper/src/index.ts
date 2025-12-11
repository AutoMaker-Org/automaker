import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { config } from 'dotenv';
import path from 'path';
import { AuthManager } from './auth';
import { setupFileSystemRoutes } from './routes/filesystem';
import { setupDialogRoutes } from './routes/dialog';
import { setupAppRoutes } from './routes/app';
import { setupSessionRoutes } from './routes/sessions';
import { AgentWebSocketHandler } from './websocket/agent';
import { AutoModeWebSocketHandler } from './websocket/automode';
import { logger } from './utils/logger';
import { PORT_RANGE_START, PORT_RANGE_END } from './config';

// Load environment variables
config();

class HelperService {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private authManager: AuthManager;
  private port: number = PORT_RANGE_START;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ noServer: true });
    this.authManager = new AuthManager();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware() {
    // Security middleware
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (same-origin) or from localhost/127.0.0.1
        if (!origin) {
          callback(null, true);
          return;
        }

        // Parse the origin to check hostname
        try {
          const url = new URL(origin);
          const hostname = url.hostname;

          // Allow localhost, 127.0.0.1, and local network addresses (for WSL2/Docker)
          if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('10.') ||
            hostname.startsWith('172.')
          ) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        } catch (err) {
          callback(new Error('Invalid origin'));
        }
      },
      credentials: true
    }));

    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes() {
    // Health check endpoint (no auth required)
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        version: '1.0.0',
        platform: process.platform,
        port: this.port,
        token: this.authManager.getToken()
      });
    });

    // Auth verification endpoint
    this.app.post('/auth/verify', (req, res) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      const valid = this.authManager.verifyToken(token || '');
      res.json({ valid });
    });

    // Apply auth middleware to all other routes
    this.app.use(this.authManager.middleware());

    // Setup route groups
    setupFileSystemRoutes(this.app);
    setupDialogRoutes(this.app);
    setupAppRoutes(this.app);
    setupSessionRoutes(this.app);

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Server error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  private setupWebSocket() {
    // Handle HTTP upgrade requests
    this.server.on('upgrade', (request, socket, head) => {
      const pathname = request.url || '';
      
      // Verify auth token from query params or headers
      const token = this.extractToken(request);
      if (!this.authManager.verifyToken(token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request, pathname);
      });
    });

    // WebSocket connection handler
    this.wss.on('connection', (ws, request, pathname) => {
      logger.info(`WebSocket connected: ${pathname}`);

      // Strip query parameters from pathname for matching
      const path = pathname.split('?')[0];

      if (path === '/ws/agent') {
        new AgentWebSocketHandler(ws);
      } else if (path === '/ws/auto-mode') {
        new AutoModeWebSocketHandler(ws);
      } else {
        logger.warn(`Invalid WebSocket endpoint: ${path}`);
        ws.close(1002, 'Invalid endpoint');
      }
    });
  }

  private extractToken(request: any): string {
    // Try to get token from query params first
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const queryToken = url.searchParams.get('token');
    if (queryToken) return queryToken;

    // Try to get from Authorization header
    const authHeader = request.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return '';
  }

  async start() {
    // Try to find an available port
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.server.listen(port, '127.0.0.1', () => {
            this.port = port;
            resolve();
          }).on('error', reject);
        });

        const token = this.authManager.getToken();
        logger.info(`Helper service started on port ${port}`);
        logger.info(`Auth token: ${token}`);
        logger.info(`Health check: http://localhost:${port}/health`);
        
        // Save port and token to a known location for the web app
        this.saveConnectionInfo(port, token);
        
        break;
      } catch (err: any) {
        if (err.code === 'EADDRINUSE') {
          logger.warn(`Port ${port} is in use, trying next...`);
          continue;
        }
        throw err;
      }
    }
  }

  private saveConnectionInfo(port: number, token: string) {
    // Save to a temp file that the web app can read
    const fs = require('fs').promises;
    const os = require('os');
    const infoPath = path.join(os.tmpdir(), 'automaker-helper.json');
    
    fs.writeFile(infoPath, JSON.stringify({
      port,
      token,
      pid: process.pid,
      startTime: new Date().toISOString()
    })).catch((err: Error) => {
      logger.error('Failed to save connection info:', err);
    });
  }

  async stop() {
    return new Promise<void>((resolve) => {
      this.wss.close();
      this.server.close(() => {
        logger.info('Helper service stopped');
        resolve();
      });
    });
  }
}

// Start the service
const service = new HelperService();

service.start().catch((err) => {
  logger.error('Failed to start helper service:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await service.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  await service.stop();
  process.exit(0);
});