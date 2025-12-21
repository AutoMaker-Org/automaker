/**
 * Git utilities types and constants
 */

// Binary file extensions to skip
export const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".svg",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".exe", ".dll", ".so", ".dylib",
  ".mp3", ".mp4", ".wav", ".avi", ".mov", ".mkv",
  ".ttf", ".otf", ".woff", ".woff2", ".eot",
  ".db", ".sqlite", ".sqlite3",
  ".pyc", ".pyo", ".class", ".o", ".obj",
]);

// Status map for git status codes
// Git porcelain format uses XY where X=staging area, Y=working tree
export const GIT_STATUS_MAP: Record<string, string> = {
  M: "Modified",
  A: "Added",
  D: "Deleted",
  R: "Renamed",
  C: "Copied",
  U: "Updated",
  "?": "Untracked",
  "!": "Ignored",
  " ": "Unmodified",
};

/**
 * File status interface for git status results
 */
export interface FileStatus {
  status: string;
  path: string;
  statusText: string;
}
