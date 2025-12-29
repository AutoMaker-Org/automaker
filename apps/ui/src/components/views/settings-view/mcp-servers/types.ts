import type { MCPToolDisplay } from './mcp-tools-list';

export type ServerType = 'stdio' | 'sse' | 'http';

export interface ServerFormData {
  name: string;
  description: string;
  type: ServerType;
  command: string;
  args: string;
  url: string;
  headers: string; // JSON string for headers
  env: string; // JSON string for env vars
}

export const defaultFormData: ServerFormData = {
  name: '',
  description: '',
  type: 'stdio',
  command: '',
  args: '',
  url: '',
  headers: '',
  env: '',
};

export interface ServerTestState {
  status: 'idle' | 'testing' | 'success' | 'error';
  tools?: MCPToolDisplay[];
  error?: string;
  connectionTime?: number;
}
