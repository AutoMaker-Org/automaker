/**
 * Clipboard utility functions with fallbacks for non-HTTPS (insecure) contexts.
 *
 * The modern Clipboard API (`navigator.clipboard`) requires a Secure Context (HTTPS).
 * When running on HTTP, these APIs are unavailable or throw errors.
 * This module provides `writeToClipboard` and `readFromClipboard` that automatically
 * fall back to the legacy `document.execCommand` approach using a hidden textarea.
 */

/**
 * Check whether the modern Clipboard API is available.
 * It requires a secure context (HTTPS or localhost) and the API to exist.
 */
function isClipboardApiAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function' &&
    typeof navigator.clipboard.readText === 'function' &&
    typeof window !== 'undefined' &&
    window.isSecureContext !== false
  );
}

/**
 * Write text to the clipboard using the modern Clipboard API with a
 * fallback to `document.execCommand('copy')` for insecure contexts.
 *
 * @param text - The text to write to the clipboard.
 * @returns `true` if the text was successfully copied; `false` otherwise.
 */
export async function writeToClipboard(text: string): Promise<boolean> {
  // Try the modern Clipboard API first
  if (isClipboardApiAvailable()) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy approach
    }
  }

  // Legacy fallback using a hidden textarea + execCommand
  return writeToClipboardLegacy(text);
}

/**
 * Read text from the clipboard using the modern Clipboard API with a
 * fallback to `document.execCommand('paste')` for insecure contexts.
 *
 * Note: The legacy fallback for *reading* is limited. `document.execCommand('paste')`
 * only works in some browsers (mainly older ones). On modern browsers in insecure
 * contexts, reading from the clipboard may not be possible at all. In those cases,
 * this function throws an error so the caller can show an appropriate message.
 *
 * @returns The text from the clipboard.
 * @throws If clipboard reading is not supported or permission is denied.
 */
export async function readFromClipboard(): Promise<string> {
  // Try the modern Clipboard API first
  if (isClipboardApiAvailable()) {
    try {
      return await navigator.clipboard.readText();
    } catch (err) {
      // Check if this is a permission-related error
      if (err instanceof Error) {
        // Re-throw permission errors so they propagate to the caller
        if (err.name === 'NotAllowedError' || err.name === 'NotReadableError') {
          throw err;
        }
      }
      // For other errors, fall through to legacy approach
    }
  }

  // Legacy fallback using a hidden textarea + execCommand
  return readFromClipboardLegacy();
}

/**
 * Legacy clipboard write using a hidden textarea and `document.execCommand('copy')`.
 * This works in both secure and insecure contexts in most browsers.
 */
function writeToClipboardLegacy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;

  // Prevent scrolling and make invisible
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';

  document.body.appendChild(textarea);

  try {
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const success = document.execCommand('copy');
    return success;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

/**
 * Legacy clipboard read using a hidden textarea and `document.execCommand('paste')`.
 * This has very limited browser support. Most modern browsers block this for security.
 * When it fails, we throw an error to let the caller handle it gracefully.
 */
function readFromClipboardLegacy(): string {
  const textarea = document.createElement('textarea');

  // Prevent scrolling and make invisible
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';

  document.body.appendChild(textarea);
  textarea.focus();

  try {
    const success = document.execCommand('paste');
    if (success && textarea.value) {
      return textarea.value;
    }
    throw new Error(
      'Clipboard paste is not supported in this browser on non-HTTPS sites. ' +
        'Please use HTTPS or paste manually with keyboard shortcuts.'
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes('Clipboard paste is not supported')) {
      throw err;
    }
    throw new Error(
      'Clipboard paste is not supported in this browser on non-HTTPS sites. ' +
        'Please use HTTPS or paste manually with keyboard shortcuts.'
    );
  } finally {
    document.body.removeChild(textarea);
  }
}
