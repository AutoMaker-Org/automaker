/**
 * Version utility - Reads version from package.json
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createLogger } from '@automaker/utils';

const logger = createLogger('Version');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedVersion: string | null = null;

/**
 * Get the version from package.json
 * Caches the result for performance
 */
export function getVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  try {
    const candidatePaths = [
      // Development via tsx: src/lib -> project root
      join(__dirname, '..', '..', 'package.json'),
      // Packaged/build output: lib -> server bundle root
      join(__dirname, '..', 'package.json'),
    ];

    const packageJsonPath = candidatePaths.find((candidate) => existsSync(candidate));
    if (!packageJsonPath) {
      throw new Error(
        `package.json not found in any expected location: ${candidatePaths.join(', ')}`
      );
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const version = packageJson.version || '0.0.0';
    cachedVersion = version;
    return version;
  } catch (error) {
    logger.warn('Failed to read version from package.json:', error);
    return '0.0.0';
  }
}
