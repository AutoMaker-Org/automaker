import { getHelperClient, HelperClient } from './helper-client';
import { safeJoin } from './path-utils';

// Types matching the Electron API
export interface ElectronAPI {
  // Dialog APIs
  openDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  openFile: (options?: {
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<{ canceled: boolean; filePaths: string[] }>;

  // File system APIs
  readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  mkdir: (dirPath: string) => Promise<{ success: boolean; error?: string }>;
  readdir: (dirPath: string) => Promise<{
    success: boolean;
    entries?: Array<{ name: string; isDirectory: boolean; isFile: boolean }>;
    error?: string;
  }>;
  exists: (filePath: string) => Promise<boolean>;
  stat: (filePath: string) => Promise<{
    success: boolean;
    stats?: { isDirectory: boolean; isFile: boolean; size: number; mtime: Date };
    error?: string;
  }>;
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  trashItem: (filePath: string) => Promise<{ success: boolean; error?: string }>;

  // App APIs
  getPath: (name: 'userData' | 'temp' | 'desktop' | 'documents' | 'downloads' | 'home') => Promise<string>;
  saveImageToTemp: (data: string, filename: string, mimeType?: string, projectPath?: string) => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;

  // Agent APIs
  agent: {
    start: (sessionId: string, workingDirectory: string) => Promise<any>;
    send: (sessionId: string, message: string, workingDirectory: string, imagePaths?: string[]) => Promise<any>;
    getHistory: (sessionId: string) => Promise<any>;
    stop: (sessionId: string) => Promise<any>;
    clear: (sessionId: string) => Promise<any>;
    onStream: (callback: (data: any) => void) => () => void;
  };

  // Sessions APIs
  sessions: {
    list: (includeArchived?: boolean) => Promise<any>;
    create: (name: string, projectPath: string, workingDirectory?: string) => Promise<any>;
    update: (sessionId: string, name?: string, tags?: string[]) => Promise<any>;
    archive: (sessionId: string) => Promise<any>;
    unarchive: (sessionId: string) => Promise<any>;
    delete: (sessionId: string) => Promise<any>;
  };

  // Auto Mode APIs
  autoMode: {
    start: (projectPath: string, maxConcurrency?: number) => Promise<any>;
    stop: () => Promise<any>;
    status: () => Promise<any>;
    runFeature: (projectPath: string, featureId: string) => Promise<any>;
    verifyFeature: (projectPath: string, featureId: string) => Promise<any>;
    resumeFeature: (projectPath: string, featureId: string) => Promise<any>;
    contextExists: (projectPath: string, featureId: string) => Promise<any>;
    analyzeProject: (projectPath: string) => Promise<any>;
    stopFeature: (featureId: string) => Promise<any>;
    followUpFeature: (projectPath: string, featureId: string, prompt: string, imagePaths?: string[]) => Promise<any>;
    commitFeature: (projectPath: string, featureId: string) => Promise<any>;
    onEvent: (callback: (data: any) => void) => () => void;
  };
}

/**
 * Check if running in Electron
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

/**
 * Get the Electron API or helper-based implementation
 */
export async function getElectronAPI(): Promise<ElectronAPI | null> {
  if (isElectron()) {
    // Return the real Electron API
    return (window as any).electronAPI;
  }

  // Use helper service for web mode
  const helper = getHelperClient();
  
  // Try to connect to helper
  const connected = await helper.connect();
  if (!connected) {
    console.error('Failed to connect to helper service');
    return null;
  }

  // Create API wrapper around helper client
  const api: ElectronAPI = {
    // Dialog APIs
    openDirectory: async () => {
      const result = await helper.openDirectory();
      return {
        canceled: result.canceled || false,
        filePaths: result.paths || []
      };
    },

    openFile: async (options) => {
      const result = await helper.openFile(options);
      return {
        canceled: result.canceled || false,
        filePaths: result.paths || []
      };
    },

    // File system APIs
    readFile: (filePath: string) => helper.readFile(filePath),
    writeFile: (filePath: string, content: string) => helper.writeFile(filePath, content),
    mkdir: (dirPath: string) => helper.mkdir(dirPath),
    readdir: (dirPath: string) => helper.readdir(dirPath),
    exists: (filePath: string) => helper.exists(filePath),
    stat: async (filePath: string) => {
      const result = await helper.stat(filePath);
      if (result.success && result.stats) {
        // Convert mtime string to Date
        return {
          ...result,
          stats: {
            ...result.stats,
            mtime: new Date(result.stats.mtime)
          }
        };
      }
      return result;
    },
    deleteFile: (filePath: string) => helper.deleteFile(filePath),
    trashItem: (filePath: string) => helper.trashItem(filePath),

    // App APIs
    getPath: (name) => helper.getPath(name),
    saveImageToTemp: (data, filename, mimeType, projectPath) => 
      helper.saveImageToTemp(data, filename, mimeType, projectPath),

    // Agent APIs
    agent: {
      start: async (sessionId, workingDirectory) => {
        await helper.connectAgent({
          onStream: (data) => {
            // Stream events will be handled by onStream callback
          }
        });
        helper.sendAgentMessage({
          type: 'agent:start',
          sessionId,
          workingDirectory
        });
        return { success: true };
      },

      send: async (sessionId, message, workingDirectory, imagePaths) => {
        helper.sendAgentMessage({
          type: 'agent:send',
          sessionId,
          message,
          workingDirectory,
          imagePaths
        });
        return { success: true };
      },

      getHistory: async (sessionId) => {
        return new Promise((resolve) => {
          helper.sendAgentMessage({
            type: 'agent:getHistory',
            sessionId
          });
          // TODO: Handle response
          resolve({ success: true, history: [] });
        });
      },

      stop: async (sessionId) => {
        helper.sendAgentMessage({
          type: 'agent:stop',
          sessionId
        });
        return { success: true };
      },

      clear: async (sessionId) => {
        helper.sendAgentMessage({
          type: 'agent:clear',
          sessionId
        });
        return { success: true };
      },

      onStream: (callback) => {
        helper.connectAgent({
          onStream: callback
        });
        
        return () => {
          // Unsubscribe
          helper.disconnectAgent();
        };
      }
    },

    // Sessions APIs
    sessions: {
      list: (includeArchived) => helper.listSessions(includeArchived),
      create: (name, projectPath, workingDirectory) => 
        helper.createSession(name, projectPath, workingDirectory),
      update: (sessionId, name, tags) => 
        helper.updateSession(sessionId, { name, tags }),
      archive: (sessionId) => helper.archiveSession(sessionId),
      unarchive: (sessionId) => helper.unarchiveSession(sessionId),
      delete: (sessionId) => helper.deleteSession(sessionId)
    },

    // Auto Mode APIs
    autoMode: {
      start: async (projectPath, maxConcurrency) => {
        await helper.connectAutoMode({
          onEvent: (event) => {
            // Events will be handled by onEvent callback
          }
        });
        await helper.sendAutoModeMessage({
          type: 'auto-mode:start',
          projectPath,
          maxConcurrency
        });
        return { success: true };
      },

      stop: async () => {
        console.log('[ElectronAPI] stop called');
        await helper.connectAutoMode({
          onEvent: (event) => {
            // Events will be handled by onEvent callback
          }
        });
        await helper.sendAutoModeMessage({ type: 'auto-mode:stop' });
        return { success: true };
      },

      status: async () => {
        console.log('[ElectronAPI] status called');
        return new Promise(async (resolve) => {
          await helper.connectAutoMode({
            onEvent: (event) => {
              // Events will be handled by onEvent callback
            }
          });
          await helper.sendAutoModeMessage({ type: 'auto-mode:status' });
          // TODO: Handle response
          resolve({ success: true, isRunning: false });
        });
      },

      runFeature: async (projectPath, featureId) => {
        console.log('[ElectronAPI] runFeature called:', { projectPath, featureId });
        await helper.connectAutoMode({
          onEvent: (event) => {
            // Events will be handled by onEvent callback
          }
        });
        await helper.sendAutoModeMessage({
          type: 'auto-mode:run-feature',
          projectPath,
          featureId
        });
        return { success: true };
      },

      verifyFeature: async (projectPath, featureId) => {
        console.log('[ElectronAPI] verifyFeature called:', { projectPath, featureId });
        await helper.connectAutoMode({
          onEvent: (event) => {
            // Events will be handled by onEvent callback
          }
        });
        await helper.sendAutoModeMessage({
          type: 'auto-mode:verify-feature',
          projectPath,
          featureId
        });
        return { success: true };
      },

      resumeFeature: async (projectPath, featureId) => {
        console.log('[ElectronAPI] resumeFeature called:', { projectPath, featureId });
        await helper.connectAutoMode({
          onEvent: (event) => {
            // Events will be handled by onEvent callback
          }
        });
        await helper.sendAutoModeMessage({
          type: 'auto-mode:resume-feature',
          projectPath,
          featureId
        });
        return { success: true };
      },

      contextExists: async (projectPath, featureId) => {
        // Use file system API to check
        const contextPath = safeJoin(projectPath, '.automaker', 'context', `${featureId}.md`);
        const exists = await helper.exists(contextPath);
        return { success: true, exists };
      },

      analyzeProject: async (projectPath) => {
        console.log('[ElectronAPI] analyzeProject called:', { projectPath });
        await helper.connectAutoMode({
          onEvent: (event) => {
            // Events will be handled by onEvent callback
          }
        });
        await helper.sendAutoModeMessage({
          type: 'auto-mode:analyze-project',
          projectPath
        });
        return { success: true };
      },

      stopFeature: async (featureId) => {
        console.log('[ElectronAPI] stopFeature called:', { featureId });
        await helper.connectAutoMode({
          onEvent: (event) => {
            // Events will be handled by onEvent callback
          }
        });
        await helper.sendAutoModeMessage({
          type: 'auto-mode:stop-feature',
          featureId
        });
        return { success: true };
      },

      followUpFeature: async (projectPath, featureId, prompt, imagePaths) => {
        console.log('[ElectronAPI] followUpFeature called:', { projectPath, featureId, prompt });
        await helper.connectAutoMode({
          onEvent: (event) => {
            // Events will be handled by onEvent callback
          }
        });
        await helper.sendAutoModeMessage({
          type: 'auto-mode:follow-up-feature',
          projectPath,
          featureId,
          prompt,
          imagePaths
        });
        return { success: true };
      },

      commitFeature: async (projectPath, featureId) => {
        console.log('[ElectronAPI] commitFeature called:', { projectPath, featureId });
        await helper.connectAutoMode({
          onEvent: (event) => {
            // Events will be handled by onEvent callback
          }
        });
        await helper.sendAutoModeMessage({
          type: 'auto-mode:commit-feature',
          projectPath,
          featureId
        });
        return { success: true };
      },

      onEvent: (callback) => {
        helper.connectAutoMode({
          onEvent: callback
        });
        
        return () => {
          // Unsubscribe
          helper.disconnectAutoMode();
        };
      }
    }
  };

  return api;
}

/**
 * Get helper connection status
 */
export function getHelperStatus(): { connected: boolean; port?: number; error?: string } {
  const helper = getHelperClient();
  const info = helper.getConnectionInfo();
  
  if (!info) {
    return { connected: false, error: 'No connection info' };
  }

  return {
    connected: info.connected,
    port: info.port,
    error: info.lastError
  };
}