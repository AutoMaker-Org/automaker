/**
 * Backend server management
 *
 * Handles starting, stopping, and monitoring the Express backend server.
 * Uses centralized methods for path validation.
 */

import path from 'path';
import http from 'http';
import { spawn, execSync } from 'child_process';
import { app } from 'electron';
import {
  findNodeExecutable,
  buildEnhancedPath,
  electronAppExists,
  systemPathExists,
} from '@automaker/platform';
import { createLogger } from '@automaker/utils/logger';
import { state } from '../state';

const logger = createLogger('BackendServer');
const serverLogger = createLogger('Server');

/**
 * Start the backend server
 * Uses centralized methods for path validation.
 */
export async function startServer(): Promise<void> {
  const isDev = !app.isPackaged;

  let command: string;
  let commandSource: string;
  let args: string[];
  let serverPath: string;

  if (isDev) {
    // In development, run the TypeScript server via the user's Node.js.
    const nodeResult = findNodeExecutable({
      skipSearch: true,
      logger: (msg: string) => logger.info(msg),
    });
    command = nodeResult.nodePath;
    commandSource = nodeResult.source;

    // Validate that the found Node executable actually exists
    // systemPathExists is used because node-finder returns system paths
    if (command !== 'node') {
      let exists: boolean;
      try {
        exists = systemPathExists(command);
      } catch (error) {
        const originalError = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to verify Node.js executable at: ${command} (source: ${nodeResult.source}). Reason: ${originalError}`
        );
      }
      if (!exists) {
        throw new Error(
          `Node.js executable not found at: ${command} (source: ${nodeResult.source})`
        );
      }
    }
  } else {
    // In packaged builds, use Electron's bundled Node runtime instead of a system Node.
    // This makes the desktop app self-contained and avoids incompatibilities with whatever
    // Node version the user happens to have installed globally.
    command = process.execPath;
    commandSource = 'electron';
  }

  // __dirname is apps/ui/dist-electron (Vite bundles all into single file)
  if (isDev) {
    serverPath = path.join(__dirname, '../../server/src/index.ts');

    const serverNodeModules = path.join(__dirname, '../../server/node_modules/tsx');
    const rootNodeModules = path.join(__dirname, '../../../node_modules/tsx');

    let tsxCliPath: string;
    // Check for tsx in app bundle paths, fallback to require.resolve
    const serverTsxPath = path.join(serverNodeModules, 'dist/cli.mjs');
    const rootTsxPath = path.join(rootNodeModules, 'dist/cli.mjs');

    try {
      if (electronAppExists(serverTsxPath)) {
        tsxCliPath = serverTsxPath;
      } else if (electronAppExists(rootTsxPath)) {
        tsxCliPath = rootTsxPath;
      } else {
        // Fallback to require.resolve
        tsxCliPath = require.resolve('tsx/cli.mjs', {
          paths: [path.join(__dirname, '../../server')],
        });
      }
    } catch {
      // electronAppExists threw or require.resolve failed
      try {
        tsxCliPath = require.resolve('tsx/cli.mjs', {
          paths: [path.join(__dirname, '../../server')],
        });
      } catch {
        throw new Error("Could not find tsx. Please run 'npm install' in the server directory.");
      }
    }

    args = [tsxCliPath, 'watch', serverPath];
  } else {
    serverPath = path.join(process.resourcesPath, 'server', 'index.js');
    args = [serverPath];

    if (!electronAppExists(serverPath)) {
      throw new Error(`Server not found at: ${serverPath}`);
    }
  }

  const serverNodeModules = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'node_modules')
    : path.join(__dirname, '../../server/node_modules');

  // Server root directory - where .env file is located
  // In dev: apps/server (not apps/server/src)
  // In production: resources/server
  const serverRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'server')
    : path.join(__dirname, '../../server');

  // IMPORTANT: Use shared data directory (not Electron's user data directory)
  // This ensures Electron and web mode share the same settings/projects
  // In dev: project root/data (navigate from __dirname which is apps/ui/dist-electron)
  // In production: same as Electron user data (for app isolation)
  const dataDir = app.isPackaged
    ? app.getPath('userData')
    : path.join(__dirname, '../../..', 'data');
  logger.info(
    `[DATA_DIR] app.isPackaged=${app.isPackaged}, __dirname=${__dirname}, dataDir=${dataDir}`
  );

  // Build enhanced PATH that includes Node.js directory (cross-platform)
  const enhancedPath = buildEnhancedPath(command, process.env.PATH || '');
  if (enhancedPath !== process.env.PATH) {
    logger.info('Enhanced PATH with Node directory:', path.dirname(command));
  }

  const env = {
    ...process.env,
    PATH: enhancedPath,
    PORT: state.serverPort.toString(),
    DATA_DIR: dataDir,
    NODE_PATH: serverNodeModules,
    // Run packaged backend with Electron's embedded Node runtime.
    ...(app.isPackaged && { ELECTRON_RUN_AS_NODE: '1' }),
    // Pass API key to server for CSRF protection
    AUTOMAKER_API_KEY: state.apiKey!,
    // Only set ALLOWED_ROOT_DIRECTORY if explicitly provided in environment
    // If not set, server will allow access to all paths
    ...(process.env.ALLOWED_ROOT_DIRECTORY && {
      ALLOWED_ROOT_DIRECTORY: process.env.ALLOWED_ROOT_DIRECTORY,
    }),
  };

  logger.info('Server will use port', state.serverPort);
  logger.info('[DATA_DIR_SPAWN] env.DATA_DIR=', env.DATA_DIR);

  logger.info('Starting backend server...');
  logger.info('Runtime command:', command, `(source: ${commandSource})`);
  logger.info('Server path:', serverPath);
  logger.info('Server root (cwd):', serverRoot);
  logger.info('NODE_PATH:', serverNodeModules);

  state.serverProcess = spawn(command, args, {
    cwd: serverRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  state.serverProcess.stdout?.on('data', (data) => {
    serverLogger.info(data.toString().trim());
  });

  state.serverProcess.stderr?.on('data', (data) => {
    serverLogger.error(data.toString().trim());
  });

  state.serverProcess.on('close', (code) => {
    serverLogger.info('Process exited with code', code);
    state.serverProcess = null;
  });

  state.serverProcess.on('error', (err) => {
    serverLogger.error('Failed to start server process:', err);
    state.serverProcess = null;
  });

  await waitForServer();
}

/**
 * Wait for server to be available
 */
export async function waitForServer(maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://localhost:${state.serverPort}/api/health`, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Status: ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      logger.info('Server is ready');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  throw new Error('Server failed to start');
}

/**
 * Stop the backend server if running
 */
export function stopServer(): void {
  if (state.serverProcess && state.serverProcess.pid) {
    logger.info('Stopping server...');
    if (process.platform === 'win32') {
      try {
        // Windows: use taskkill with /t to kill entire process tree
        // This prevents orphaned node processes when closing the app
        // Using execSync to ensure process is killed before app exits
        execSync(`taskkill /f /t /pid ${state.serverProcess.pid}`, { stdio: 'ignore' });
      } catch (error) {
        logger.error('Failed to kill server process:', (error as Error).message);
      }
    } else {
      state.serverProcess.kill('SIGTERM');
    }
    state.serverProcess = null;
  }
}
