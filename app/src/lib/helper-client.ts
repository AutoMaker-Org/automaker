import { EventEmitter } from 'events';

interface HelperConfig {
  port?: number;
  token?: string;
  maxRetries?: number;
  retryDelay?: number;
}

interface HelperConnectionInfo {
  port: number;
  token: string;
  connected: boolean;
  lastError?: string;
}

export class HelperClient extends EventEmitter {
  private config: Required<HelperConfig>;
  private baseUrl: string = '';
  private wsUrl: string = '';
  private connected: boolean = false;
  private connectionInfo: HelperConnectionInfo | null = null;
  private agentWs: WebSocket | null = null;
  private autoModeWs: WebSocket | null = null;

  // Store callbacks separately so they can be updated even when WebSocket is already connected
  private autoModeEventCallback: ((event: any) => void) | null = null;
  private autoModeErrorCallback: ((error: string) => void) | null = null;

  constructor(config: HelperConfig = {}) {
    super();
    
    this.config = {
      port: config.port || 13131,
      token: config.token || '',
      maxRetries: config.maxRetries || 5,
      retryDelay: config.retryDelay || 1000
    };
  }

  /**
   * Connect to the helper service with retries
   */
  async connect(maxAttempts = 3): Promise<boolean> {
    console.log(`[HelperClient] Attempting to connect to helper service (max ${maxAttempts} attempts)...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[HelperClient] Connection attempt ${attempt}/${maxAttempts}`);

      // Try to load connection info from temp file
      const savedInfo = await this.loadConnectionInfo();

      if (savedInfo) {
        console.log('[HelperClient] Loaded connection info from API:', { port: savedInfo.port });
        this.config.port = savedInfo.port;
        this.config.token = savedInfo.token;

        // Try to connect directly with the saved info first
        console.log(`[HelperClient] Trying direct connection to port ${savedInfo.port}...`);
        const directHealth = await this.checkHealth(savedInfo.port);
        if (directHealth) {
          console.log(`[HelperClient] ✓ Successfully connected on port ${savedInfo.port}`);
          // Use /api/helper/* proxy for all HTTP requests to bypass CORS
          this.baseUrl = ``;  // Proxy handles the base URL
          this.wsUrl = `ws://localhost:${savedInfo.port}`;
          this.config.token = directHealth.token || savedInfo.token;
          this.config.port = savedInfo.port;
          this.connected = true;
          this.connectionInfo = {
            port: savedInfo.port,
            token: this.config.token,
            connected: true
          };
          this.emit('connected', this.connectionInfo);
          return true;
        }
      } else {
        console.log('[HelperClient] No saved connection info found, will scan ports');
      }

      // Try using proxy even without saved info
      try {
        console.log(`[HelperClient] Trying proxy connection...`);
        const healthInfo = await this.checkHealth(this.config.port);
        if (healthInfo) {
          console.log(`[HelperClient] ✓ Successfully connected via proxy`);
          this.baseUrl = ``;  // Proxy handles the base URL
          this.wsUrl = `ws://localhost:${healthInfo.port || this.config.port}`;
          this.config.token = healthInfo.token || this.config.token;
          this.config.port = healthInfo.port || this.config.port;
          this.connected = true;
          this.connectionInfo = {
            port: this.config.port,
            token: this.config.token,
            connected: true
          };
          this.emit('connected', this.connectionInfo);
          return true;
        }
      } catch (err) {
        console.log(`[HelperClient] Proxy connection failed:`, err);
      }

      // If this wasn't the last attempt, wait before retrying
      if (attempt < maxAttempts) {
        const delay = attempt * 1000; // 1s, 2s, 3s...
        console.log(`[HelperClient] Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.error('[HelperClient] ✗ Failed to connect to helper service after all attempts');
    this.connected = false;
    this.connectionInfo = {
      port: this.config.port,
      token: '',
      connected: false,
      lastError: `Helper service not found after ${maxAttempts} attempts`
    };
    this.emit('disconnected', this.connectionInfo);
    return false;
  }

  /**
   * Load connection info from temp file
   */
  private async loadConnectionInfo(): Promise<{ port: number; token: string } | null> {
    try {
      console.log('[HelperClient] Fetching connection info from /api/helper-info...');
      // Add cache busting and no-cache headers
      const response = await fetch(`/api/helper-info?t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      if (response.ok) {
        const info = await response.json();
        console.log('[HelperClient] Successfully loaded connection info from API');
        return info;
      } else {
        console.log(`[HelperClient] API returned status ${response.status}`);
      }
    } catch (err) {
      console.log('[HelperClient] Failed to fetch connection info from API:', err);
    }
    return null;
  }

  /**
   * Check if helper service is healthy and get connection info
   * Uses server-side proxy to bypass browser CORS restrictions
   */
  private async checkHealth(port: number): Promise<{ token: string } | null> {
    try {
      console.log(`[HelperClient] Checking health via proxy for port ${port}`);

      // Use server-side proxy to bypass CORS
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`/api/helper-proxy?t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        console.log(`[HelperClient] ✓ Health check succeeded via proxy`, data);
        return {
          token: data.token,
          port: data.port,
          ...data.health
        };
      }

      const errorData = await response.json().catch(() => ({}));
      console.log(`[HelperClient] ✗ Proxy returned status ${response.status}:`, errorData);
      return null;
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          console.log(`[HelperClient] ✗ Health check timed out after 5s`);
        } else {
          console.log(`[HelperClient] ✗ Health check error:`, err.message);
        }
      }
      return null;
    }
  }

  /**
   * Make authenticated request to helper
   * Uses proxy to bypass CORS
   */
  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    if (!this.connected) {
      throw new Error('Helper service not connected');
    }

    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');
    // Token is handled by proxy

    // Remove leading slash from path for proxy
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;

    const response = await fetch(`/api/helper/${cleanPath}`, {
      ...options,
      headers,
      cache: 'no-store'
    });

    if (response.status === 401) {
      // Try to reconnect once with a fresh token
      const reconnected = await this.connect();
      if (reconnected) {
        // Retry the request with the new token
        headers.set('Authorization', `Bearer ${this.config.token}`);
        const retryResponse = await fetch(`${this.baseUrl}${path}`, {
          ...options,
          headers
        });
        if (retryResponse.status === 401) {
          throw new Error('Unauthorized - invalid helper token');
        }
        return retryResponse;
      }
      throw new Error('Unauthorized - invalid helper token');
    }

    return response;
  }

  /**
   * Retry a request with exponential backoff
   */
  private async retryRequest<T>(
    fn: () => Promise<T>,
    retries = this.config.maxRetries
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        return this.retryRequest(fn, retries - 1);
      }
      throw error;
    }
  }

  // ===== Filesystem Operations =====

  async readFile(filePath: string): Promise<{ success: boolean; content?: string; error?: string }> {
    return this.retryRequest(async () => {
      const response = await this.request('/fs/read', {
        method: 'POST',
        body: JSON.stringify({ path: filePath })
      });
      return response.json();
    });
  }

  async writeFile(filePath: string, content: string): Promise<{ success: boolean; error?: string }> {
    return this.retryRequest(async () => {
      const response = await this.request('/fs/write', {
        method: 'POST',
        body: JSON.stringify({ path: filePath, content })
      });
      return response.json();
    });
  }

  async mkdir(dirPath: string): Promise<{ success: boolean; error?: string }> {
    return this.retryRequest(async () => {
      const response = await this.request('/fs/mkdir', {
        method: 'POST',
        body: JSON.stringify({ path: dirPath })
      });
      return response.json();
    });
  }

  async readdir(dirPath: string): Promise<{
    success: boolean;
    entries?: Array<{ name: string; isDirectory: boolean; isFile: boolean }>;
    error?: string;
  }> {
    return this.retryRequest(async () => {
      const response = await this.request('/fs/readdir', {
        method: 'POST',
        body: JSON.stringify({ path: dirPath })
      });
      return response.json();
    });
  }

  async exists(filePath: string): Promise<boolean> {
    const response = await this.request('/fs/exists', {
      method: 'POST',
      body: JSON.stringify({ path: filePath })
    });
    const result = await response.json();
    return result.exists;
  }

  async stat(filePath: string): Promise<{
    success: boolean;
    stats?: { isDirectory: boolean; isFile: boolean; size: number; mtime: string };
    error?: string;
  }> {
    return this.retryRequest(async () => {
      const response = await this.request('/fs/stat', {
        method: 'POST',
        body: JSON.stringify({ path: filePath })
      });
      return response.json();
    });
  }

  async deleteFile(filePath: string): Promise<{ success: boolean; error?: string }> {
    return this.retryRequest(async () => {
      const response = await this.request('/fs/delete', {
        method: 'POST',
        body: JSON.stringify({ path: filePath })
      });
      return response.json();
    });
  }

  async trashItem(filePath: string): Promise<{ success: boolean; error?: string }> {
    return this.retryRequest(async () => {
      const response = await this.request('/fs/trash', {
        method: 'POST',
        body: JSON.stringify({ path: filePath })
      });
      return response.json();
    });
  }

  // ===== Dialog Operations =====

  async openDirectory(options?: { title?: string; defaultPath?: string }): Promise<{
    success: boolean;
    canceled?: boolean;
    paths?: string[];
    error?: string;
  }> {
    const response = await this.request('/dialog/open-directory', {
      method: 'POST',
      body: JSON.stringify(options || {})
    });
    return response.json();
  }

  async openFile(options?: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<{
    success: boolean;
    canceled?: boolean;
    paths?: string[];
    error?: string;
  }> {
    const response = await this.request('/dialog/open-file', {
      method: 'POST',
      body: JSON.stringify(options || {})
    });
    return response.json();
  }

  // ===== App Operations =====

  async getPath(name: 'userData' | 'temp' | 'desktop' | 'documents' | 'downloads' | 'home'): Promise<string> {
    const response = await this.request(`/app/paths/${name}`);
    const result = await response.json();
    return result.path;
  }

  async saveImageToTemp(data: string, filename: string, mimeType?: string, projectPath?: string): Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }> {
    const response = await this.request('/app/save-image', {
      method: 'POST',
      body: JSON.stringify({ data, filename, mimeType, projectPath })
    });
    return response.json();
  }

  // ===== Agent Operations =====

  connectAgent(callbacks: {
    onStream?: (data: any) => void;
    onError?: (error: string) => void;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.agentWs) {
        this.agentWs.close();
      }

      const ws = new WebSocket(`${this.wsUrl}/ws/agent?token=${this.config.token}`);
      
      ws.onopen = () => {
        this.agentWs = ws;
        resolve();
      };

      ws.onerror = (error) => {
        reject(new Error('Failed to connect to agent WebSocket'));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'error' && callbacks.onError) {
            callbacks.onError(data.error);
          } else if (callbacks.onStream) {
            callbacks.onStream(data);
          }
        } catch (err) {
          console.error('Failed to parse agent message:', err);
        }
      };

      ws.onclose = () => {
        this.agentWs = null;
      };
    });
  }

  sendAgentMessage(message: any): void {
    if (!this.agentWs || this.agentWs.readyState !== WebSocket.OPEN) {
      throw new Error('Agent WebSocket not connected');
    }
    
    this.agentWs.send(JSON.stringify(message));
  }

  disconnectAgent(): void {
    if (this.agentWs) {
      this.agentWs.close();
      this.agentWs = null;
    }
  }

  // ===== Auto Mode Operations =====

  connectAutoMode(callbacks: {
    onEvent?: (event: any) => void;
    onError?: (error: string) => void;
  }): Promise<void> {
    return new Promise(async (resolve, reject) => {
      // Always update callbacks so they work even if WebSocket was created earlier
      if (callbacks.onEvent) {
        this.autoModeEventCallback = callbacks.onEvent;
        console.log('[HelperClient] Updated autoMode event callback');
      }
      if (callbacks.onError) {
        this.autoModeErrorCallback = callbacks.onError;
      }

      if (this.autoModeWs && this.autoModeWs.readyState === WebSocket.OPEN) {
        // Already connected, callbacks are updated, just resolve
        console.log('[HelperClient] AutoMode WebSocket already connected, callbacks updated');
        resolve();
        return;
      }

      if (this.autoModeWs) {
        this.autoModeWs.close();
      }

      // Ensure we're connected to the helper service first
      if (!this.connected || !this.wsUrl) {
        const connected = await this.connect();
        if (!connected) {
          reject(new Error('Helper service not connected'));
          return;
        }
      }

      const ws = new WebSocket(`${this.wsUrl}/ws/auto-mode?token=${this.config.token}`);
      let connectionTimeout: NodeJS.Timeout;

      // Set a timeout for connection
      connectionTimeout = setTimeout(() => {
        ws.close();
        reject(new Error('Auto-mode WebSocket connection timeout'));
      }, 5000);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        this.autoModeWs = ws;
        console.log('Auto-mode WebSocket connected');
        resolve();
      };

      ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.error('Auto-mode WebSocket error:', error);
        if (this.autoModeErrorCallback) {
          this.autoModeErrorCallback('WebSocket connection failed');
        }
        reject(new Error('Failed to connect to auto-mode WebSocket'));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[HelperClient] Received WebSocket message:', data.type, data.event?.type);

          if (data.type === 'event') {
            if (data.event.type === 'error' && this.autoModeErrorCallback) {
              this.autoModeErrorCallback(data.event.error);
            } else if (this.autoModeEventCallback) {
              console.log('[HelperClient] Calling event callback with:', data.event.type);
              this.autoModeEventCallback(data.event);
            } else {
              console.warn('[HelperClient] No event callback registered for:', data.event.type);
            }
          }
        } catch (err) {
          console.error('Failed to parse auto-mode message:', err);
        }
      };

      ws.onclose = () => {
        clearTimeout(connectionTimeout);
        this.autoModeWs = null;
        console.log('Auto-mode WebSocket closed');
      };
    });
  }

  async sendAutoModeMessage(message: any): Promise<void> {
    console.log('[HelperClient] sendAutoModeMessage called with:', message);

    // Wait for connection if not ready
    if (!this.autoModeWs || this.autoModeWs.readyState !== WebSocket.OPEN) {
      console.log('[HelperClient] AutoMode WebSocket not ready, state:', this.autoModeWs?.readyState, 'waiting for connection...');
      // Wait a bit for the connection to be ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (!this.autoModeWs || this.autoModeWs.readyState !== WebSocket.OPEN) {
        console.error('[HelperClient] AutoMode WebSocket still not connected after wait');
        throw new Error('AutoMode WebSocket not connected');
      }
    }

    console.log('[HelperClient] Sending auto-mode message via WebSocket:', message);
    this.autoModeWs.send(JSON.stringify(message));
    console.log('[HelperClient] Message sent successfully');
  }

  disconnectAutoMode(): void {
    if (this.autoModeWs) {
      this.autoModeWs.close();
      this.autoModeWs = null;
    }
  }

  isAutoModeConnected(): boolean {
    return this.autoModeWs !== null && this.autoModeWs.readyState === WebSocket.OPEN;
  }

  // ===== Session Operations =====

  async listSessions(includeArchived = false): Promise<{
    success: boolean;
    sessions?: any[];
    error?: string;
  }> {
    const response = await this.request(`/sessions?includeArchived=${includeArchived}`);
    return response.json();
  }

  async createSession(name: string, projectPath: string, workingDirectory?: string): Promise<{
    success: boolean;
    session?: any;
    error?: string;
  }> {
    const response = await this.request('/sessions', {
      method: 'POST',
      body: JSON.stringify({ name, projectPath, workingDirectory })
    });
    return response.json();
  }

  async updateSession(id: string, updates: { name?: string; tags?: string[] }): Promise<{
    success: boolean;
    error?: string;
  }> {
    const response = await this.request(`/sessions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    return response.json();
  }

  async archiveSession(id: string): Promise<{ success: boolean; error?: string }> {
    const response = await this.request(`/sessions/${id}/archive`, {
      method: 'POST'
    });
    return response.json();
  }

  async unarchiveSession(id: string): Promise<{ success: boolean; error?: string }> {
    const response = await this.request(`/sessions/${id}/unarchive`, {
      method: 'POST'
    });
    return response.json();
  }

  async deleteSession(id: string): Promise<{ success: boolean; error?: string }> {
    const response = await this.request(`/sessions/${id}`, {
      method: 'DELETE'
    });
    return response.json();
  }

  // ===== Connection Status =====

  isConnected(): boolean {
    return this.connected;
  }

  getConnectionInfo(): HelperConnectionInfo | null {
    return this.connectionInfo;
  }

  disconnect(): void {
    this.disconnectAgent();
    this.disconnectAutoMode();
    this.connected = false;
    this.emit('disconnected', this.connectionInfo);
  }
}

// Singleton instance
let helperClientInstance: HelperClient | null = null;

export function getHelperClient(config?: HelperConfig): HelperClient {
  if (!helperClientInstance) {
    helperClientInstance = new HelperClient(config);
  }
  return helperClientInstance;
}