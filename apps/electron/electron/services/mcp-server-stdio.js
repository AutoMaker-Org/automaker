#!/usr/bin/env node
/**
 * Standalone STDIO MCP Server for Automaker Tools
 * 
 * This script runs as a standalone process and communicates via JSON-RPC 2.0
 * over stdin/stdout. It implements the MCP protocol to expose the UpdateFeatureStatus
 * tool to Codex CLI.
 * 
 * Environment variables:
 * - AUTOMAKER_PROJECT_PATH: Path to the project directory
 * - AUTOMAKER_IPC_CHANNEL: IPC channel name for callback communication (optional, uses default)
 */

const readline = require('readline');
const path = require('path');

// Redirect all console.log output to stderr to avoid polluting MCP stdout
const originalConsoleLog = console.log;
console.log = (...args) => {
  console.error(...args);
};

// Set up readline interface for line-by-line JSON-RPC input
// IMPORTANT: Use a separate output stream for readline to avoid interfering with JSON-RPC stdout
// We'll write JSON-RPC responses directly to stdout, not through readline
const rl = readline.createInterface({
  input: process.stdin,
  output: null, // Don't use stdout for readline output
  terminal: false
});

let initialized = false;
let projectPath = null;
let ipcChannel = null;

// Get configuration from environment
projectPath = process.env.AUTOMAKER_PROJECT_PATH || process.cwd();
ipcChannel = process.env.AUTOMAKER_IPC_CHANNEL || 'mcp:update-feature-status';

// Load dependencies (these will be available in the Electron app context)
let featureLoader;
let electron;

// Try to load Electron IPC if available (when running from Electron app)
try {
  // In Electron, we can use IPC directly
  if (typeof require !== 'undefined') {
    // Check if we're in Electron context
    const electronModule = require('electron');
    if (electronModule && electronModule.ipcMain) {
      electron = electronModule;
    }
  }
} catch (e) {
  // Not in Electron context, will use alternative method
}

// Load feature loader
// Try multiple paths since this script might be run from different contexts
try {
  // First try relative path (when run from electron/services/)
  featureLoader = require('./feature-loader');
} catch (e) {
  try {
    // Try absolute path resolution
    const featureLoaderPath = path.resolve(__dirname, 'feature-loader.js');
    delete require.cache[require.resolve(featureLoaderPath)];
    featureLoader = require(featureLoaderPath);
  } catch (e2) {
    // If still fails, try from parent directory
    try {
      featureLoader = require(path.join(__dirname, '..', 'services', 'feature-loader'));
    } catch (e3) {
      console.error('[McpServerStdio] Error loading feature-loader:', e3.message);
      console.error('[McpServerStdio] Tried paths:', [
        './feature-loader',
        path.resolve(__dirname, 'feature-loader.js'),
        path.join(__dirname, '..', 'services', 'feature-loader')
      ]);
      process.exit(1);
    }
  }
}

/**
 * Send JSON-RPC response
 * CRITICAL: Must write directly to stdout, not via console.log
 * MCP protocol requires ONLY JSON-RPC messages on stdout
 */
function sendResponse(id, result, error = null) {
  const response = {
    jsonrpc: '2.0',
    id
  };
  
  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }
  
  // Write directly to stdout with newline (MCP uses line-delimited JSON)
  process.stdout.write(JSON.stringify(response) + '\n');
}

/**
 * Send JSON-RPC notification
 * CRITICAL: Must write directly to stdout, not via console.log
 */
function sendNotification(method, params) {
  const notification = {
    jsonrpc: '2.0',
    method,
    params
  };
  
  // Write directly to stdout with newline (MCP uses line-delimited JSON)
  process.stdout.write(JSON.stringify(notification) + '\n');
}

/**
 * Handle MCP initialize request
 */
async function handleInitialize(params, id) {
  initialized = true;
  
  sendResponse(id, {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {}
    },
    serverInfo: {
      name: 'automaker-tools',
      version: '1.0.0'
    }
  });
}

/**
 * Handle tools/list request
 */
async function handleToolsList(params, id) {
  sendResponse(id, {
    tools: [
      {
        name: 'UpdateFeatureStatus',
        description: 'Update the status of a feature. Use this tool instead of directly modifying feature files to safely update feature status. IMPORTANT: If the feature has skipTests=true, you should NOT mark it as verified - instead it will automatically go to waiting_approval status for manual review. Always include a summary of what was done.',
        inputSchema: {
          type: 'object',
          properties: {
            featureId: {
              type: 'string',
              description: 'The ID of the feature to update'
            },
            status: {
              type: 'string',
              enum: ['backlog', 'in_progress', 'verified'],
              description: 'The new status for the feature. Note: If skipTests=true, verified will be converted to waiting_approval automatically.'
            },
            summary: {
              type: 'string',
              description: 'A brief summary of what was implemented/changed. This will be displayed on the Kanban card. Example: "Added dark mode toggle. Modified: settings.tsx, theme-provider.tsx"'
            }
          },
          required: ['featureId', 'status']
        }
      }
    ]
  });
}

/**
 * Handle tools/call request
 */
async function handleToolsCall(params, id) {
  const { name, arguments: args } = params;
  
  if (name !== 'UpdateFeatureStatus') {
    sendResponse(id, null, {
      code: -32601,
      message: `Unknown tool: ${name}`
    });
    return;
  }
  
  try {
    const { featureId, status, summary } = args;
    
    if (!featureId || !status) {
      sendResponse(id, null, {
        code: -32602,
        message: 'Missing required parameters: featureId and status are required'
      });
      return;
    }
    
    // Load the feature to check skipTests flag
    const features = await featureLoader.loadFeatures(projectPath);
    const feature = features.find((f) => f.id === featureId);
    
    if (!feature) {
      sendResponse(id, null, {
        code: -32602,
        message: `Feature ${featureId} not found`
      });
      return;
    }
    
    // If agent tries to mark as verified but feature has skipTests=true, convert to waiting_approval
    let finalStatus = status;
    if (status === 'verified' && feature.skipTests === true) {
      finalStatus = 'waiting_approval';
    }
    
    // Call the update callback via IPC or direct call
    // Since we're in a separate process, we need to use IPC to communicate back
    // For now, we'll call the feature loader directly since it has the update method
    await featureLoader.updateFeatureStatus(featureId, finalStatus, projectPath, { summary });
    
    const statusMessage = finalStatus !== status
      ? `Successfully updated feature ${featureId} to status "${finalStatus}" (converted from "${status}" because skipTests=true)${summary ? ` with summary: "${summary}"` : ''}`
      : `Successfully updated feature ${featureId} to status "${finalStatus}"${summary ? ` with summary: "${summary}"` : ''}`;
    
    sendResponse(id, {
      content: [
        {
          type: 'text',
          text: statusMessage
        }
      ]
    });
  } catch (error) {
    console.error('[McpServerStdio] UpdateFeatureStatus error:', error);
    sendResponse(id, null, {
      code: -32603,
      message: `Failed to update feature status: ${error.message}`
    });
  }
}

/**
 * Handle JSON-RPC request
 */
async function handleRequest(line) {
  let request;
  
  try {
    request = JSON.parse(line);
  } catch (e) {
    sendResponse(null, null, {
      code: -32700,
      message: 'Parse error'
    });
    return;
  }
  
  // Validate JSON-RPC 2.0 structure
  if (request.jsonrpc !== '2.0') {
    sendResponse(request.id || null, null, {
      code: -32600,
      message: 'Invalid Request'
    });
    return;
  }
  
  const { method, params, id } = request;
  
  // Handle notifications (no id)
  if (id === undefined) {
    // Handle notifications if needed
    return;
  }
  
  // Handle requests
  try {
    switch (method) {
      case 'initialize':
        await handleInitialize(params, id);
        break;
        
      case 'tools/list':
        if (!initialized) {
          sendResponse(id, null, {
            code: -32002,
            message: 'Server not initialized'
          });
          return;
        }
        await handleToolsList(params, id);
        break;
        
      case 'tools/call':
        if (!initialized) {
          sendResponse(id, null, {
            code: -32002,
            message: 'Server not initialized'
          });
          return;
        }
        await handleToolsCall(params, id);
        break;
        
      default:
        sendResponse(id, null, {
          code: -32601,
          message: `Method not found: ${method}`
        });
    }
  } catch (error) {
    console.error('[McpServerStdio] Error handling request:', error);
    sendResponse(id, null, {
      code: -32603,
      message: `Internal error: ${error.message}`
    });
  }
}

// Process stdin line by line
rl.on('line', async (line) => {
  if (!line.trim()) {
    return;
  }
  
  await handleRequest(line);
});

// Handle errors
rl.on('error', (error) => {
  console.error('[McpServerStdio] Readline error:', error);
  process.exit(1);
});

// Handle process termination
process.on('SIGTERM', () => {
  rl.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  rl.close();
  process.exit(0);
});

// Log startup
console.error('[McpServerStdio] Starting MCP server for automaker-tools');
console.error(`[McpServerStdio] Project path: ${projectPath}`);
console.error(`[McpServerStdio] IPC channel: ${ipcChannel}`);


