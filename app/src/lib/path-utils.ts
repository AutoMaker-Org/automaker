/**
 * Path utility functions for safe path operations
 */

/**
 * Safely join path segments, handling edge cases like trailing slashes
 * @param segments - Path segments to join
 * @returns Joined path with proper separators
 */
export function safeJoin(...segments: string[]): string {
  // Filter out empty segments
  const filtered = segments.filter(s => s && s.length > 0);
  
  if (filtered.length === 0) {
    return '';
  }
  
  // Join segments, ensuring no double slashes
  let result = filtered[0];
  
  for (let i = 1; i < filtered.length; i++) {
    const segment = filtered[i];
    
    // Remove leading slash from segment
    const cleanSegment = segment.startsWith('/') ? segment.slice(1) : segment;
    
    // Add separator if needed
    if (!result.endsWith('/')) {
      result += '/';
    }
    
    result += cleanSegment;
  }
  
  return result;
}

/**
 * Normalize a path to use forward slashes
 * @param filePath - Path to normalize
 * @returns Normalized path
 */
export function normalizePath(filePath: string): string {
  if (!filePath) return filePath;
  return filePath.replace(/\\/g, '/');
}