// Type definitions for Electron IPC API

import { getHelperClient } from './helper-client';
import { safeJoin } from './path-utils';

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface FileStats {
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  mtime: Date;
}

export interface DialogResult {
  canceled: boolean;
  filePaths: string[];
}

export interface FileResult {
  success: boolean;
  content?: string;
  error?: string;
}

export interface WriteResult {
  success: boolean;
  error?: string;
}

export interface ReaddirResult {
  success: boolean;
  entries?: FileEntry[];
  error?: string;
}

export interface StatResult {
  success: boolean;
  stats?: FileStats;
  error?: string;
}

// Auto Mode types
export type AutoModePhase = "planning" | "action" | "verification";

export interface AutoModeEvent {
  type: "auto_mode_feature_start" | "auto_mode_progress" | "auto_mode_tool" | "auto_mode_feature_complete" | "auto_mode_error" | "auto_mode_complete" | "auto_mode_phase";
  featureId?: string;
  feature?: object;
  content?: string;
  tool?: string;
  input?: unknown;
  passes?: boolean;
  message?: string;
  error?: string;
  phase?: AutoModePhase;
}

export interface AutoModeAPI {
  start: (projectPath: string, maxConcurrency?: number) => Promise<{ success: boolean; error?: string }>;
  stop: () => Promise<{ success: boolean; error?: string }>;
  stopFeature: (featureId: string) => Promise<{ success: boolean; error?: string }>;
  status: () => Promise<{ success: boolean; isRunning?: boolean; currentFeatureId?: string | null; runningFeatures?: string[]; error?: string }>;
  runFeature: (projectPath: string, featureId: string) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  verifyFeature: (projectPath: string, featureId: string) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  resumeFeature: (projectPath: string, featureId: string) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  contextExists: (projectPath: string, featureId: string) => Promise<{ success: boolean; exists?: boolean; error?: string }>;
  analyzeProject: (projectPath: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  followUpFeature: (projectPath: string, featureId: string, prompt: string, imagePaths?: string[]) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  commitFeature: (projectPath: string, featureId: string) => Promise<{ success: boolean; error?: string }>;
  onEvent: (callback: (event: AutoModeEvent) => void) => () => void;
}

export interface SaveImageResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface ElectronAPI {
  ping: () => Promise<string>;
  openDirectory: () => Promise<DialogResult>;
  openFile: (options?: object) => Promise<DialogResult>;
  readFile: (filePath: string) => Promise<FileResult>;
  writeFile: (filePath: string, content: string) => Promise<WriteResult>;
  mkdir: (dirPath: string) => Promise<WriteResult>;
  readdir: (dirPath: string) => Promise<ReaddirResult>;
  exists: (filePath: string) => Promise<boolean>;
  stat: (filePath: string) => Promise<StatResult>;
  deleteFile: (filePath: string) => Promise<WriteResult>;
  trashItem?: (filePath: string) => Promise<WriteResult>;
  getPath: (name: string) => Promise<string>;
  saveImageToTemp?: (data: string, filename: string, mimeType: string) => Promise<SaveImageResult>;
  autoMode?: AutoModeAPI;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    isElectron?: boolean;
  }
}


// Check if we're in Electron
export const isElectron = (): boolean => {
  return typeof window !== "undefined" && window.isElectron === true;
};

// Get the Electron API or helper-based implementation for web
export const getElectronAPI = async (): Promise<ElectronAPI | null> => {
  if (isElectron() && window.electronAPI) {
    return window.electronAPI;
  }

  // Try to connect to helper service
  const helper = getHelperClient();
  const connected = await helper.connect();
  
  if (!connected) {
    console.error('Failed to connect to helper service. Please ensure the helper is running.');
    return null;
  }

  // Return helper-based API implementation
  return {
    ping: async () => "pong (helper)",

    openDirectory: async () => {
      const result = await helper.openDirectory();
      return {
        canceled: result.canceled || false,
        filePaths: result.paths || [],
      };
    },

    openFile: async (options) => {
      const result = await helper.openFile(options);
      return {
        canceled: result.canceled || false,
        filePaths: result.paths || [],
      };
    },

    readFile: async (filePath: string) => {
      return helper.readFile(filePath);
    },

    writeFile: async (filePath: string, content: string) => {
      return helper.writeFile(filePath, content);
    },

    mkdir: async (dirPath: string) => {
      return helper.mkdir(dirPath);
    },

    readdir: async (dirPath: string) => {
      return helper.readdir(dirPath);
    },

    exists: async (filePath: string) => {
      return helper.exists(filePath);
    },

    stat: async (filePath: string) => {
      const result = await helper.stat(filePath);
      if (result.success && result.stats) {
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

    deleteFile: async (filePath: string) => {
      return helper.deleteFile(filePath);
    },

    trashItem: async (filePath: string) => {
      return helper.trashItem(filePath);
    },

    getPath: async (name: string) => {
      return helper.getPath(name as any);
    },

    // Save image to temp directory
    saveImageToTemp: async (data: string, filename: string, mimeType: string) => {
      return helper.saveImageToTemp(data, filename, mimeType);
    },

    // Auto Mode API via helper service
    autoMode: {
      start: async (projectPath: string, maxConcurrency?: number) => {
        // Ensure WebSocket is connected (don't pass callback - preserve existing one)
        if (!helper.isAutoModeConnected()) {
          await helper.connectAutoMode({});
        }
        await helper.sendAutoModeMessage({
          type: 'auto-mode:start',
          projectPath,
          maxConcurrency
        });
        return { success: true };
      },

      stop: async () => {
        // Ensure WebSocket is connected (don't pass callback - preserve existing one)
        if (!helper.isAutoModeConnected()) {
          await helper.connectAutoMode({});
        }
        await helper.sendAutoModeMessage({ type: 'auto-mode:stop' });
        return { success: true };
      },

      status: async () => {
        // TODO: Implement proper status request/response
        return { success: true, isRunning: false, features: [] };
      },

      runFeature: async (projectPath: string, featureId: string) => {
        console.log('[electron.ts] runFeature called:', { projectPath, featureId });
        console.log('[electron.ts] isAutoModeConnected:', helper.isAutoModeConnected());
        // Ensure WebSocket is connected (don't pass callback - preserve existing one)
        if (!helper.isAutoModeConnected()) {
          console.log('[electron.ts] Connecting AutoMode WebSocket...');
          await helper.connectAutoMode({});
          console.log('[electron.ts] AutoMode WebSocket connected');
        }
        console.log('[electron.ts] Sending runFeature message...');
        await helper.sendAutoModeMessage({
          type: 'auto-mode:run-feature',
          projectPath,
          featureId
        });
        console.log('[electron.ts] runFeature message sent');
        return { success: true };
      },

      verifyFeature: async (projectPath: string, featureId: string) => {
        // Ensure WebSocket is connected (don't pass callback - preserve existing one)
        if (!helper.isAutoModeConnected()) {
          await helper.connectAutoMode({});
        }
        await helper.sendAutoModeMessage({
          type: 'auto-mode:verify-feature',
          projectPath,
          featureId
        });
        return { success: true };
      },

      resumeFeature: async (projectPath: string, featureId: string) => {
        console.log('[electron.ts] resumeFeature called:', { projectPath, featureId });
        console.log('[electron.ts] isAutoModeConnected:', helper.isAutoModeConnected());
        // Ensure WebSocket is connected (don't pass callback - preserve existing one)
        if (!helper.isAutoModeConnected()) {
          console.log('[electron.ts] Connecting AutoMode WebSocket...');
          await helper.connectAutoMode({});
          console.log('[electron.ts] AutoMode WebSocket connected');
        }
        console.log('[electron.ts] Sending resumeFeature message...');
        await helper.sendAutoModeMessage({
          type: 'auto-mode:resume-feature',
          projectPath,
          featureId
        });
        console.log('[electron.ts] resumeFeature message sent');
        return { success: true };
      },

      stopFeature: async (featureId: string) => {
        // Ensure WebSocket is connected (don't pass callback - preserve existing one)
        if (!helper.isAutoModeConnected()) {
          await helper.connectAutoMode({});
        }
        await helper.sendAutoModeMessage({
          type: 'auto-mode:stop-feature',
          featureId
        });
        return { success: true };
      },

      commitFeature: async (projectPath: string, featureId: string) => {
        // Ensure WebSocket is connected (don't pass callback - preserve existing one)
        if (!helper.isAutoModeConnected()) {
          await helper.connectAutoMode({});
        }
        await helper.sendAutoModeMessage({
          type: 'auto-mode:commit-feature',
          projectPath,
          featureId
        });
        return { success: true };
      },

      followUpFeature: async (projectPath: string, featureId: string, prompt: string, imagePaths?: string[]) => {
        // Ensure WebSocket is connected (don't pass callback - preserve existing one)
        if (!helper.isAutoModeConnected()) {
          await helper.connectAutoMode({});
        }
        await helper.sendAutoModeMessage({
          type: 'auto-mode:follow-up-feature',
          projectPath,
          featureId,
          prompt,
          imagePaths
        });
        return { success: true };
      },

      analyzeProject: async (projectPath: string) => {
        // Ensure WebSocket is connected (don't pass callback - preserve existing one)
        if (!helper.isAutoModeConnected()) {
          await helper.connectAutoMode({});
        }
        await helper.sendAutoModeMessage({
          type: 'auto-mode:analyze-project',
          projectPath
        });
        return { success: true };
      },

      contextExists: async (projectPath: string, featureId: string) => {
        const contextPath = safeJoin(projectPath, '.automaker', 'context', `${featureId}.md`);
        const exists = await helper.exists(contextPath);
        return { success: true, exists };
      },

      onEvent: (callback: (event: AutoModeEvent) => void) => {
        helper.connectAutoMode({
          onEvent: callback
        });
        
        // Return unsubscribe function
        return () => {
          helper.disconnectAutoMode();
        };
      }
    }
  };
};
