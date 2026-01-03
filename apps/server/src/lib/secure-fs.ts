/**
 * Re-export secure file system utilities from @automaker/platform
 * This file exists for backward compatibility with existing imports
 */

import { secureFs } from '@automaker/platform';

export const {
  // Async methods
  access,
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  rm,
  unlink,
  copyFile,
  appendFile,
  rename,
  lstat,
  joinPath,
  resolvePath,
  // Sync methods
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  accessSync,
  unlinkSync,
  rmSync,
  // Throttling configuration and monitoring
  configureThrottling,
  getThrottlingConfig,
  getPendingOperations,
  getActiveOperations,
} = secureFs;
