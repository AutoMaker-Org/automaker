/**
 * File Picker Utility for Web Browsers
 *
 * Provides cross-platform file and directory selection using:
 * 1. HTML5 webkitdirectory input - primary method (works on Windows)
 * 2. File System Access API (showDirectoryPicker) - fallback for modern browsers
 *
 * Note: Browsers don't expose absolute file paths for security reasons.
 * This implementation extracts directory information and may require
 * user confirmation or server-side path resolution.
 */

import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('FilePicker');

/**
 * Directory picker result with structure information for server-side resolution
 */
export interface DirectoryPickerResult {
  directoryName: string;
  sampleFiles: string[]; // Relative paths of sample files for identification
  fileCount: number;
}

/**
 * Opens a directory picker dialog
 * @returns Promise resolving to directory information, or null if canceled
 *
 * Note: Browsers don't expose absolute file paths for security reasons.
 * This function returns directory structure information that the server
 * can use to locate the actual directory path.
 */
export async function openDirectoryPicker(): Promise<DirectoryPickerResult | null> {
  // Use webkitdirectory (works on Windows and all modern browsers)
  return new Promise<DirectoryPickerResult | null>((resolve) => {
    let resolved = false;
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.style.display = 'none';

    const cleanup = () => {
      if (input.parentNode) {
        document.body.removeChild(input);
      }
    };

    let changeEventFired = false;
    let focusTimeout: ReturnType<typeof setTimeout> | null = null;

    const safeResolve = (value: DirectoryPickerResult | null) => {
      if (!resolved) {
        resolved = true;
        changeEventFired = true;
        if (focusTimeout) {
          clearTimeout(focusTimeout);
          focusTimeout = null;
        }
        cleanup();
        resolve(value);
      }
    };

    input.addEventListener('change', (e) => {
      changeEventFired = true;
      if (focusTimeout) {
        clearTimeout(focusTimeout);
        focusTimeout = null;
      }

      logger.info('Change event fired');
      const files = input.files;
      logger.info('Files selected:', files?.length || 0);

      if (!files || files.length === 0) {
        logger.info('No files selected');
        safeResolve(null);
        return;
      }

      const firstFile = files[0];
      logger.info('First file:', {
        name: firstFile.name,
        webkitRelativePath: firstFile.webkitRelativePath,
        // @ts-expect-error - path property is non-standard but available in some browsers
        path: firstFile.path,
      });

      // Extract directory name from webkitRelativePath
      // webkitRelativePath format: "directoryName/subfolder/file.txt" or "directoryName/file.txt"
      let directoryName = 'Selected Directory';

      // Method 1: Try to get absolute path from File object (non-standard, works in Electron/Chromium)
      // @ts-expect-error - path property is non-standard but available in some browsers
      if (firstFile.path) {
        // @ts-expect-error - path property is non-standard but available in some browsers
        const filePath = firstFile.path as string;
        logger.info('Found file.path:', filePath);
        // Extract directory path (remove filename)
        const lastSeparator = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
        if (lastSeparator > 0) {
          const absolutePath = filePath.substring(0, lastSeparator);
          logger.info('Found absolute path:', absolutePath);
          // Return as directory name for now - server can validate it directly
          directoryName = absolutePath;
        }
      }

      // Method 2: Extract directory name from webkitRelativePath
      if (directoryName === 'Selected Directory' && firstFile.webkitRelativePath) {
        const relativePath = firstFile.webkitRelativePath;
        logger.info('Using webkitRelativePath:', relativePath);
        const pathParts = relativePath.split('/');
        if (pathParts.length > 0) {
          directoryName = pathParts[0]; // Top-level directory name
          logger.info('Extracted directory name:', directoryName);
        }
      }

      // Collect sample file paths for server-side directory matching
      // Take first 10 files to identify the directory
      const sampleFiles: string[] = [];
      const maxSamples = 10;
      for (let i = 0; i < Math.min(files.length, maxSamples); i++) {
        const file = files[i];
        if (file.webkitRelativePath) {
          sampleFiles.push(file.webkitRelativePath);
        } else if (file.name) {
          sampleFiles.push(file.name);
        }
      }

      logger.info('Directory info:', {
        directoryName,
        fileCount: files.length,
        sampleFiles: sampleFiles.slice(0, 5), // Log first 5
      });

      safeResolve({
        directoryName,
        sampleFiles,
        fileCount: files.length,
      });
    });

    // Handle cancellation - but be very careful not to interfere with change event
    // On Windows, the dialog might take time to process, so we wait longer
    const handleFocus = () => {
      // Wait longer on Windows - the dialog might take time to process
      // Only resolve as canceled if change event hasn't fired after a delay
      focusTimeout = setTimeout(() => {
        if (!resolved && !changeEventFired && (!input.files || input.files.length === 0)) {
          logger.info('Dialog canceled (no files after focus and no change event)');
          safeResolve(null);
        }
      }, 2000); // Increased timeout for Windows - give it time
    };

    // Add to DOM temporarily
    document.body.appendChild(input);
    logger.info('Opening directory picker...');

    // Try to show picker programmatically
    if ('showPicker' in HTMLInputElement.prototype) {
      try {
        (input as any).showPicker();
        logger.info('Using showPicker()');
      } catch (error) {
        logger.info('showPicker() failed, using click()', error);
        input.click();
      }
    } else {
      logger.info('Using click()');
      input.click();
    }

    // Set up cancellation detection with longer delay
    // Only add focus listener if we're not already resolved
    window.addEventListener('focus', handleFocus, { once: true });

    // Also handle blur as a cancellation signal (but with delay)
    window.addEventListener(
      'blur',
      () => {
        // Dialog opened, wait for it to close
        setTimeout(() => {
          window.addEventListener('focus', handleFocus, { once: true });
        }, 100);
      },
      { once: true }
    );
  });
}

/**
 * Opens a file picker dialog
 * @param options Optional configuration (multiple files, file types, etc.)
 * @returns Promise resolving to selected file path(s), or null if canceled
 */
export async function openFilePicker(options?: {
  multiple?: boolean;
  accept?: string;
}): Promise<string | string[] | null> {
  // Use standard file input (works on all browsers including Windows)
  return new Promise<string | string[] | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = options?.multiple ?? false;
    if (options?.accept) {
      input.accept = options.accept;
    }
    input.style.display = 'none';

    const cleanup = () => {
      if (input.parentNode) {
        document.body.removeChild(input);
      }
    };

    input.addEventListener('change', () => {
      const files = input.files;
      if (!files || files.length === 0) {
        cleanup();
        resolve(null);
        return;
      }

      // Try to extract paths from File objects
      const extractPath = (file: File): string => {
        // Try to get path from File object (non-standard, but available in some browsers)
        // @ts-expect-error - path property is non-standard
        if (file.path) {
          // @ts-expect-error - path property is non-standard but available in some browsers
          return file.path as string;
        }
        // Fallback to filename (server will need to resolve)
        return file.name;
      };

      if (options?.multiple) {
        const paths = Array.from(files).map(extractPath);
        cleanup();
        resolve(paths);
      } else {
        const path = extractPath(files[0]);
        cleanup();
        resolve(path);
      }
    });

    // Handle window focus (user may have canceled)
    const handleFocus = () => {
      setTimeout(() => {
        if (!input.files || input.files.length === 0) {
          cleanup();
          resolve(null);
        }
      }, 200);
    };

    // Add to DOM temporarily
    document.body.appendChild(input);

    // Try to show picker programmatically
    // Note: showPicker() is available in modern browsers but TypeScript types it as void
    // In practice, it may return a Promise in some implementations, but we'll handle errors via try/catch
    if ('showPicker' in HTMLInputElement.prototype) {
      try {
        (input as any).showPicker();
      } catch {
        // Fallback to click if showPicker fails
        input.click();
      }
    } else {
      input.click();
    }

    // Set up cancellation detection
    window.addEventListener('focus', handleFocus, { once: true });
  });
}
