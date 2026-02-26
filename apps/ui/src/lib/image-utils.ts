/**
 * Shared utilities for image and file handling across the UI
 */

// Accepted image MIME types
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

// Accepted text file MIME types
export const ACCEPTED_TEXT_TYPES = ['text/plain', 'text/markdown', 'text/x-markdown'];

// File extensions for text files (used for validation when MIME type is unreliable)
export const ACCEPTED_TEXT_EXTENSIONS = ['.txt', '.md'];

// Default max file size (10MB)
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

// Default max text file size (1MB - text files should be smaller)
export const DEFAULT_MAX_TEXT_FILE_SIZE = 1 * 1024 * 1024;

// Default max number of files
export const DEFAULT_MAX_FILES = 5;

/**
 * Sanitize a filename by replacing spaces and special characters with underscores.
 * This is important for:
 * - Mac screenshot filenames that contain Unicode narrow no-break spaces (U+202F)
 * - Filenames with regular spaces
 * - Filenames with special characters that may cause path issues
 *
 * @param filename - The original filename
 * @returns A sanitized filename safe for file system operations
 */
export function sanitizeFilename(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  const name = lastDot > 0 ? filename.substring(0, lastDot) : filename;
  const ext = lastDot > 0 ? filename.substring(lastDot) : '';

  const sanitized = name
    .replace(/[\s\u00A0\u202F\u2009\u200A]+/g, '_') // Various space characters (regular, non-breaking, narrow no-break, thin, hair)
    .replace(/[^a-zA-Z0-9_-]/g, '_') // Non-alphanumeric chars
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, ''); // Trim leading/trailing underscores

  return `${sanitized || 'image'}${ext}`;
}

/**
 * Convert a File object to a base64 data URL string
 *
 * @param file - The file to convert
 * @returns Promise resolving to a base64 data URL string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as base64'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Extract the base64 data from a data URL (removes the prefix)
 *
 * @param dataUrl - The full data URL (e.g., "data:image/png;base64,...")
 * @returns The base64 data without the prefix
 */
export function extractBase64Data(dataUrl: string): string {
  return dataUrl.split(',')[1] || dataUrl;
}

/**
 * Format file size in human-readable format
 *
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Validate an image file for upload
 *
 * @param file - The file to validate
 * @param maxFileSize - Maximum file size in bytes (default: 10MB)
 * @returns Object with isValid boolean and optional error message
 */
export function validateImageFile(
  file: File,
  maxFileSize: number = DEFAULT_MAX_FILE_SIZE
): { isValid: boolean; error?: string } {
  // Validate file type
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return {
      isValid: false,
      error: `${file.name}: Unsupported file type. Please use JPG, PNG, GIF, or WebP.`,
    };
  }

  // Validate file size
  if (file.size > maxFileSize) {
    const maxSizeMB = maxFileSize / (1024 * 1024);
    return {
      isValid: false,
      error: `${file.name}: File too large. Maximum size is ${maxSizeMB}MB.`,
    };
  }

  return { isValid: true };
}

/**
 * Generate a unique image ID
 *
 * @returns A unique ID string for an image attachment
 */
export function generateImageId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate a unique file ID
 *
 * @returns A unique ID string for a file attachment
 */
export function generateFileId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Check if a file is a text file by extension or MIME type
 *
 * @param file - The file to check
 * @returns True if the file is a text file
 */
export function isTextFile(file: File): boolean {
  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  const isTextExtension = ACCEPTED_TEXT_EXTENSIONS.includes(extension);
  const isTextMime = ACCEPTED_TEXT_TYPES.includes(file.type);
  return isTextExtension || isTextMime;
}

/**
 * Check if a file is an image file by MIME type
 *
 * @param file - The file to check
 * @returns True if the file is an image file
 */
export function isImageFile(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type);
}

/**
 * Validate a text file for upload
 *
 * @param file - The file to validate
 * @param maxFileSize - Maximum file size in bytes (default: 1MB)
 * @returns Object with isValid boolean and optional error message
 */
export function validateTextFile(
  file: File,
  maxFileSize: number = DEFAULT_MAX_TEXT_FILE_SIZE
): { isValid: boolean; error?: string } {
  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

  // Validate file type by extension (MIME types for text files are often unreliable)
  if (!ACCEPTED_TEXT_EXTENSIONS.includes(extension)) {
    return {
      isValid: false,
      error: `${file.name}: Unsupported file type. Please use .txt or .md files.`,
    };
  }

  // Validate file size
  if (file.size > maxFileSize) {
    const maxSizeMB = maxFileSize / (1024 * 1024);
    return {
      isValid: false,
      error: `${file.name}: File too large. Maximum size is ${maxSizeMB}MB.`,
    };
  }

  return { isValid: true };
}

/**
 * Read text content from a file
 *
 * @param file - The file to read
 * @returns Promise resolving to the text content
 */
export function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as text'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Get the MIME type for a text file based on extension
 *
 * @param filename - The filename to check
 * @returns The MIME type for the file
 */
export function getTextFileMimeType(filename: string): string {
  const extension = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  if (extension === '.md') {
    return 'text/markdown';
  }
  return 'text/plain';
}
