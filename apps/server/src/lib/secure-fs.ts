/**
 * Re-export secure file system utilities from @automaker/platform
 * This file exists for backward compatibility with existing imports
 */

import { secureFs } from '@automaker/platform';

export const {
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
  // Throttling configuration and monitoring
  configureThrottling,
  getThrottlingConfig,
  getPendingOperations,
  getActiveOperations,
} = secureFs;
