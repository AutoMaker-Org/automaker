export const PORT_RANGE_START = 13131;
export const PORT_RANGE_END = 13140;

export const AUTH_TOKEN_SECRET = process.env.HELPER_AUTH_SECRET || 'automaker-helper-secret-2024';

export const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'http://localhost:3006',
  'http://localhost:3007',
  'http://localhost:3008',
  'http://localhost:3009',
  'http://localhost:3010',
  'https://localhost:3000',
  'https://localhost:3001',
  'https://localhost:3002',
  'https://localhost:3003',
  'https://localhost:3004',
  'https://localhost:3005',
  'https://localhost:3006',
  'https://localhost:3007',
  'https://localhost:3008',
  'https://localhost:3009',
  'https://localhost:3010',
];

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();