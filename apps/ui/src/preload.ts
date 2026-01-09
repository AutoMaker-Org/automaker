/**
 * Electron preload script (TypeScript)
 *
 * Only exposes native features (dialogs, shell) and server URL.
 * All other operations go through HTTP API.
 */

import { contextBridge, ipcRenderer, OpenDialogOptions, SaveDialogOptions } from 'electron';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('Preload');

// Expose minimal API for native features
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  isElectron: true,

  // Connection check
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),

  // Get server URL for HTTP client
  getServerUrl: (): Promise<string> => ipcRenderer.invoke('server:getUrl'),

  // Get API key for authentication
  getApiKey: (): Promise<string | null> => ipcRenderer.invoke('auth:getApiKey'),

  // Check if running in external server mode (Docker API)
  isExternalServerMode: (): Promise<boolean> => ipcRenderer.invoke('auth:isExternalServerMode'),

  // Native dialogs - better UX than prompt()
  openDirectory: (): Promise<Electron.OpenDialogReturnValue> =>
    ipcRenderer.invoke('dialog:openDirectory'),
  openFile: (options?: OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> =>
    ipcRenderer.invoke('dialog:openFile', options),
  saveFile: (options?: SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> =>
    ipcRenderer.invoke('dialog:saveFile', options),

  // Shell operations
  openExternalLink: (url: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:openExternal', url),
  openPath: (filePath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:openPath', filePath),
  openInEditor: (
    filePath: string,
    line?: number,
    column?: number
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:openInEditor', filePath, line, column),

  // App info
  getPath: (name: string): Promise<string> => ipcRenderer.invoke('app:getPath', name),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  isPackaged: (): Promise<boolean> => ipcRenderer.invoke('app:isPackaged'),

  // Window management
  updateMinWidth: (sidebarExpanded: boolean): Promise<void> =>
    ipcRenderer.invoke('window:updateMinWidth', sidebarExpanded),

  // App control
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
});

logger.info('Electron API exposed (TypeScript)');
