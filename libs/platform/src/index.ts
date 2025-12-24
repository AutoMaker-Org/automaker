/**
 * @automaker/platform
 * Platform-specific utilities for AutoMaker
 */

// Path utilities
export {
  getAutomakerDir,
  getFeaturesDir,
  getFeatureDir,
  getFeatureImagesDir,
  getBoardDir,
  getImagesDir,
  getContextDir,
  getWorktreesDir,
  getValidationsDir,
  getValidationDir,
  getValidationPath,
  getAppSpecPath,
  getBranchTrackingPath,
  ensureAutomakerDir,
  getGlobalSettingsPath,
  getCredentialsPath,
  getProjectSettingsPath,
  ensureDataDir,
} from './paths.js';

// Subprocess management
export {
  spawnJSONLProcess,
  spawnProcess,
  type SubprocessOptions,
  type SubprocessResult,
} from './subprocess.js';

// Security
export {
  PathNotAllowedError,
  initAllowedPaths,
  isPathAllowed,
  validatePath,
  isPathWithinDirectory,
  getAllowedRootDirectory,
  getDataDirectory,
  getAllowedPaths,
} from './security.js';

// Secure file system (validates paths before I/O operations)
export * as secureFs from './secure-fs.js';

// Node.js executable finder (cross-platform)
export {
  findNodeExecutable,
  buildEnhancedPath,
  type NodeFinderResult,
  type NodeFinderOptions,
} from './node-finder.js';
