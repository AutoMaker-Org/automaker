/**
 * @automaker/git-utils
 * Git operations utilities for AutoMaker
 */

// Export types and constants
export { BINARY_EXTENSIONS, GIT_STATUS_MAP, type FileStatus } from './types.js';

// Export status utilities
export { isGitRepo, parseGitStatus } from './status.js';

// Export diff utilities
export {
  generateSyntheticDiffForNewFile,
  appendUntrackedFileDiffs,
  listAllFilesInDirectory,
  generateDiffsForNonGitDirectory,
  getGitRepositoryDiffs,
} from './diff.js';

// Export branch validation utilities
export { isSafeBranchName, validateBranchName } from './branch-validation.js';
