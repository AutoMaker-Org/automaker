/**
 * Automaker Backend Server
 *
 * Provides HTTP/WebSocket API for both web and Electron modes.
 * In Electron mode, this server runs locally.
 * In web mode, this server runs on a remote host.
 */

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';

import { createEventEmitter, type EventEmitter } from './lib/events.js';
import { initAllowedPaths } from '@automaker/platform';
import { authMiddleware, getAuthStatus } from './lib/auth.js';
import { createFsRoutes } from './routes/fs/index.js';
import { createHealthRoutes } from './routes/health/index.js';
import { createAgentRoutes } from './routes/agent/index.js';
import { createSessionsRoutes } from './routes/sessions/index.js';
import { createFeaturesRoutes } from './routes/features/index.js';
import { createAutoModeRoutes } from './routes/auto-mode/index.js';
import { createEnhancePromptRoutes } from './routes/enhance-prompt/index.js';
import { createWorktreeRoutes } from './routes/worktree/index.js';
import { createGitRoutes } from './routes/git/index.js';
import { createSetupRoutes } from './routes/setup/index.js';
import { createSuggestionsRoutes } from './routes/suggestions/index.js';
import { createModelsRoutes } from './routes/models/index.js';
import { createRunningAgentsRoutes } from './routes/running-agents/index.js';
import { createWorkspaceRoutes } from './routes/workspace/index.js';
import { createTemplatesRoutes } from './routes/templates/index.js';
import {
  createTerminalRoutes,
  validateTerminalToken,
  isTerminalEnabled,
  isTerminalPasswordRequired,
} from './routes/terminal/index.js';
import { createSettingsRoutes } from './routes/settings/index.js';
import { AgentService } from './services/agent-service.js';
import { FeatureLoader } from './services/feature-loader.js';
import { AutoModeService } from './services/auto-mode-service.js';
import { getTerminalService } from './services/terminal-service.js';
import { SettingsService } from './services/settings-service.js';
import { createSpecRegenerationRoutes } from './routes/app-spec/index.js';
import { createClaudeRoutes } from './routes/claude/index.js';
import { ClaudeUsageService } from './services/claude-usage-service.js';
import { createGitHubRoutes } from './routes/github/index.js';
import { createContextRoutes } from './routes/context/index.js';
import { cleanupStaleValidations } from './routes/github/routes/validation-common.js';

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || '3008', 10);
const DATA_DIR = process.env.DATA_DIR || './data';
const ENABLE_REQUEST_LOGGING = process.env.ENABLE_REQUEST_LOGGING !== 'false'; // Default to true

// Check for required environment variables
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;

if (!hasAnthropicKey) {
  console.warn(`
╔═══════════════════════════════════════════════════════════════════════╗
║  ⚠️  WARNING: No Claude authentication configured                      ║
║                                                                       ║
║  The Claude Agent SDK requires authentication to function.            ║
║                                                                       ║
║  Set your Anthropic API key:                                          ║
║    export ANTHROPIC_API_KEY="sk-ant-..."                              ║
║                                                                       ║
║  Or use the setup wizard in Settings to configure authentication.     ║
╚═══════════════════════════════════════════════════════════════════════╝
`);
} else {
  console.log('[Server] ✓ ANTHROPIC_API_KEY detected (API key auth)');
}

// Initialize security
initAllowedPaths();

// Create Express app
const app = express();

// Middleware
// Custom colored logger showing only endpoint and status code (configurable via ENABLE_REQUEST_LOGGING env var)
if (ENABLE_REQUEST_LOGGING) {
  morgan.token('status-colored', (req, res) => {
    const status = res.statusCode;
    if (status >= 500) return `\x1b[31m${status}\x1b[0m`; // Red for server errors
    if (status >= 400) return `\x1b[33m${status}\x1b[0m`; // Yellow for client errors
    if (status >= 300) return `\x1b[36m${status}\x1b[0m`; // Cyan for redirects
    return `\x1b[32m${status}\x1b[0m`; // Green for success
  });

  app.use(
    morgan(':method :url :status-colored', {
      skip: (req) => req.url === '/api/health', // Skip health check logs
    })
  );
}
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })
);
app.use(express.json({ limit: '50mb' }));

// Create shared event emitter for streaming
const events: EventEmitter = createEventEmitter();

// Create services
const agentService = new AgentService(DATA_DIR, events);
const featureLoader = new FeatureLoader();
const autoModeService = new AutoModeService(events);
const settingsService = new SettingsService(DATA_DIR);
const claudeUsageService = new ClaudeUsageService();

// Initialize services
(async () => {
  await agentService.initialize();
  console.log('[Server] Agent service initialized');
})();

// Run stale validation cleanup every hour to prevent memory leaks from crashed validations
const VALIDATION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
setInterval(() => {
  const cleaned = cleanupStaleValidations();
  if (cleaned > 0) {
    console.log(`[Server] Cleaned up ${cleaned} stale validation entries`);
  }
}, VALIDATION_CLEANUP_INTERVAL_MS);

// Mount API routes - health is unauthenticated for monitoring
app.use('/api/health', createHealthRoutes());

// Apply authentication to all other routes
app.use('/api', authMiddleware);

app.use('/api/fs', createFsRoutes(events));
app.use('/api/agent', createAgentRoutes(agentService, events));
app.use('/api/sessions', createSessionsRoutes(agentService));
app.use('/api/features', createFeaturesRoutes(featureLoader));
app.use('/api/auto-mode', createAutoModeRoutes(autoModeService));
app.use('/api/enhance-prompt', createEnhancePromptRoutes());
app.use('/api/worktree', createWorktreeRoutes());
app.use('/api/git', createGitRoutes());
app.use('/api/setup', createSetupRoutes());
app.use('/api/suggestions', createSuggestionsRoutes(events));
app.use('/api/models', createModelsRoutes());
app.use('/api/spec-regeneration', createSpecRegenerationRoutes(events));
app.use('/api/running-agents', createRunningAgentsRoutes(autoModeService));
app.use('/api/workspace', createWorkspaceRoutes());
app.use('/api/templates', createTemplatesRoutes());
app.use('/api/terminal', createTerminalRoutes());
app.use('/api/settings', createSettingsRoutes(settingsService));
app.use('/api/claude', createClaudeRoutes(claudeUsageService));
app.use('/api/github', createGitHubRoutes(events));
app.use('/api/context', createContextRoutes());

// Create HTTP server
const server = createServer(app);

// WebSocket servers using noServer mode for proper multi-path support
const wss = new WebSocketServer({ noServer: true });
const terminalWss = new WebSocketServer({ noServer: true });
const terminalService = getTerminalService();

// Handle HTTP upgrade requests manually to route to correct WebSocket server
server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);

  if (pathname === '/api/events') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (pathname === '/api/terminal/ws') {
    terminalWss.handleUpgrade(request, socket, head, (ws) => {
      terminalWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Events WebSocket connection handler
wss.on('connection', (ws: WebSocket) => {
  console.log('[WebSocket] Client connected');

  // Subscribe to all events and forward to this client
  const unsubscribe = events.subscribe((type, payload) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
    unsubscribe();
  });

  ws.on('error', (error) => {
    console.error('[WebSocket] Error:', error);
    unsubscribe();
  });
});

// Track WebSocket connections per session
const terminalConnections: Map<string, Set<WebSocket>> = new Map();
// Track last resize dimensions per session to deduplicate resize messages
const lastResizeDimensions: Map<string, { cols: number; rows: number }> = new Map();
// Track last resize timestamp to rate-limit resize operations (prevents resize storm)
const lastResizeTime: Map<string, number> = new Map();
const RESIZE_MIN_INTERVAL_MS = 100; // Minimum 100ms between resize operations

// Clean up resize tracking when sessions actually exit (not just when connections close)
terminalService.onExit((sessionId) => {
  lastResizeDimensions.delete(sessionId);
  lastResizeTime.delete(sessionId);
  terminalConnections.delete(sessionId);
});

// Terminal WebSocket connection handler
terminalWss.on('connection', (ws: WebSocket, req: import('http').IncomingMessage) => {
  // Parse URL to get session ID and token
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  const token = url.searchParams.get('token');

  console.log(`[Terminal WS] Connection attempt for session: ${sessionId}`);

  // Check if terminal is enabled
  if (!isTerminalEnabled()) {
    console.log('[Terminal WS] Terminal is disabled');
    ws.close(4003, 'Terminal access is disabled');
    return;
  }

  // Validate token if password is required
  if (isTerminalPasswordRequired() && !validateTerminalToken(token || undefined)) {
    console.log('[Terminal WS] Invalid or missing token');
    ws.close(4001, 'Authentication required');
    return;
  }

  if (!sessionId) {
    console.log('[Terminal WS] No session ID provided');
    ws.close(4002, 'Session ID required');
    return;
  }

  // Check if session exists
  const session = terminalService.getSession(sessionId);
  if (!session) {
    console.log(`[Terminal WS] Session ${sessionId} not found`);
    ws.close(4004, 'Session not found');
    return;
  }

  console.log(`[Terminal WS] Client connected to session ${sessionId}`);

  // Track this connection
  if (!terminalConnections.has(sessionId)) {
    terminalConnections.set(sessionId, new Set());
  }
  terminalConnections.get(sessionId)!.add(ws);

  // Send initial connection success FIRST
  ws.send(
    JSON.stringify({
      type: 'connected',
      sessionId,
      shell: session.shell,
      cwd: session.cwd,
    })
  );

  // Send scrollback buffer BEFORE subscribing to prevent race condition
  // Also clear pending output buffer to prevent duplicates from throttled flush
  const scrollback = terminalService.getScrollbackAndClearPending(sessionId);
  if (scrollback && scrollback.length > 0) {
    ws.send(
      JSON.stringify({
        type: 'scrollback',
        data: scrollback,
      })
    );
  }

  // NOW subscribe to terminal data (after scrollback is sent)
  const unsubscribeData = terminalService.onData((sid, data) => {
    if (sid === sessionId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'data', data }));
    }
  });

  // Subscribe to terminal exit
  const unsubscribeExit = terminalService.onExit((sid, exitCode) => {
    if (sid === sessionId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode }));
      ws.close(1000, 'Session ended');
    }
  });

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());

      switch (msg.type) {
        case 'input':
          // Validate input data type and length
          if (typeof msg.data !== 'string') {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid input type' }));
            break;
          }
          // Limit input size to 1MB to prevent memory issues
          if (msg.data.length > 1024 * 1024) {
            ws.send(JSON.stringify({ type: 'error', message: 'Input too large' }));
            break;
          }
          // Write user input to terminal
          terminalService.write(sessionId, msg.data);
          break;

        case 'resize':
          // Validate resize dimensions are positive integers within reasonable bounds
          if (
            typeof msg.cols !== 'number' ||
            typeof msg.rows !== 'number' ||
            !Number.isInteger(msg.cols) ||
            !Number.isInteger(msg.rows) ||
            msg.cols < 1 ||
            msg.cols > 1000 ||
            msg.rows < 1 ||
            msg.rows > 500
          ) {
            break; // Silently ignore invalid resize requests
          }
          // Resize terminal with deduplication and rate limiting
          if (msg.cols && msg.rows) {
            const now = Date.now();
            const lastTime = lastResizeTime.get(sessionId) || 0;
            const lastDimensions = lastResizeDimensions.get(sessionId);

            // Skip if resized too recently (prevents resize storm during splits)
            if (now - lastTime < RESIZE_MIN_INTERVAL_MS) {
              break;
            }

            // Check if dimensions are different from last resize
            if (
              !lastDimensions ||
              lastDimensions.cols !== msg.cols ||
              lastDimensions.rows !== msg.rows
            ) {
              // Only suppress output on subsequent resizes, not the first one
              // The first resize happens on terminal open and we don't want to drop the initial prompt
              const isFirstResize = !lastDimensions;
              terminalService.resize(sessionId, msg.cols, msg.rows, !isFirstResize);
              lastResizeDimensions.set(sessionId, {
                cols: msg.cols,
                rows: msg.rows,
              });
              lastResizeTime.set(sessionId, now);
            }
          }
          break;

        case 'ping':
          // Respond to ping
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          console.warn(`[Terminal WS] Unknown message type: ${msg.type}`);
      }
    } catch (error) {
      console.error('[Terminal WS] Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`[Terminal WS] Client disconnected from session ${sessionId}`);
    unsubscribeData();
    unsubscribeExit();

    // Remove from connections tracking
    const connections = terminalConnections.get(sessionId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        terminalConnections.delete(sessionId);
        // DON'T delete lastResizeDimensions/lastResizeTime here!
        // The session still exists, and reconnecting clients need to know
        // this isn't the "first resize" to prevent duplicate prompts.
        // These get cleaned up when the session actually exits.
      }
    }
  });

  ws.on('error', (error) => {
    console.error(`[Terminal WS] Error on session ${sessionId}:`, error);
    unsubscribeData();
    unsubscribeExit();
  });
});

// Start server with error handling for port conflicts
const startServer = (port: number) => {
  server.listen(port, () => {
    const terminalStatus = isTerminalEnabled()
      ? isTerminalPasswordRequired()
        ? 'enabled (password protected)'
        : 'enabled'
      : 'disabled';
    const portStr = port.toString().padEnd(4);
    console.log(`
╔═══════════════════════════════════════════════════════╗
║           Automaker Backend Server                    ║
╠═══════════════════════════════════════════════════════╣
║  HTTP API:    http://localhost:${portStr}                 ║
║  WebSocket:   ws://localhost:${portStr}/api/events        ║
║  Terminal:    ws://localhost:${portStr}/api/terminal/ws   ║
║  Health:      http://localhost:${portStr}/api/health      ║
║  Terminal:    ${terminalStatus.padEnd(37)}║
╚═══════════════════════════════════════════════════════╝
`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`
╔═══════════════════════════════════════════════════════╗
║  ❌ ERROR: Port ${port} is already in use              ║
╠═══════════════════════════════════════════════════════╣
║  Another process is using this port.                  ║
║                                                       ║
║  To fix this, try one of:                             ║
║                                                       ║
║  1. Kill the process using the port:                  ║
║     lsof -ti:${port} | xargs kill -9                   ║
║                                                       ║
║  2. Use a different port:                             ║
║     PORT=${port + 1} npm run dev:server                ║
║                                                       ║
║  3. Use the init.sh script which handles this:        ║
║     ./init.sh                                         ║
╚═══════════════════════════════════════════════════════╝
`);
      process.exit(1);
    } else {
      console.error('[Server] Error starting server:', error);
      process.exit(1);
    }
  });
};

startServer(PORT);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  terminalService.cleanup();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  terminalService.cleanup();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
