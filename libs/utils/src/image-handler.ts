/**
 * Image handling utilities for processing image files
 *
 * Provides utilities for:
 * - MIME type detection based on file extensions
 * - Base64 encoding of image files
 * - Content block generation for Claude SDK format
 * - Path resolution (relative/absolute)
 */

import { secureFs } from "@automaker/platform";
import path from "path";
import type { ImageData, ImageContentBlock } from '@automaker/types';

/**
 * MIME type mapping for image file extensions
 */
const IMAGE_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
} as const;

/**
 * Get MIME type for an image file based on extension
 *
 * @param imagePath - Path to the image file
 * @returns MIME type string (defaults to "image/png" for unknown extensions)
 */
export function getMimeTypeForImage(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  return IMAGE_MIME_TYPES[ext] || "image/png";
}

/**
 * Read an image file and convert to base64 with metadata
 *
 * @param imagePath - Path to the image file
 * @returns Promise resolving to image data with base64 encoding
 * @throws Error if file cannot be read
 */
export async function readImageAsBase64(imagePath: string): Promise<ImageData> {
  const imageBuffer = await secureFs.readFile(imagePath) as Buffer;
  const base64Data = imageBuffer.toString("base64");
  const mimeType = getMimeTypeForImage(imagePath);

  return {
    base64: base64Data,
    mimeType,
    filename: path.basename(imagePath),
    originalPath: imagePath,
  };
}

/**
 * Convert image paths to content blocks (Claude SDK format)
 * Handles both relative and absolute paths
 *
 * @param imagePaths - Array of image file paths
 * @param workDir - Optional working directory for resolving relative paths
 * @returns Promise resolving to array of image content blocks
 */
export async function convertImagesToContentBlocks(
  imagePaths: string[],
  workDir?: string
): Promise<ImageContentBlock[]> {
  const blocks: ImageContentBlock[] = [];

  for (const imagePath of imagePaths) {
    try {
      // Resolve to absolute path if needed
      const absolutePath = workDir && !path.isAbsolute(imagePath)
        ? path.join(workDir, imagePath)
        : imagePath;

      const imageData = await readImageAsBase64(absolutePath);

      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: imageData.mimeType,
          data: imageData.base64,
        },
      });
    } catch (error) {
      console.error(`[ImageHandler] Failed to load image ${imagePath}:`, error);
      // Continue processing other images
    }
  }

  return blocks;
}

/**
 * Build a list of image paths for text prompts
 * Formats image paths as a bulleted list for inclusion in text prompts
 *
 * @param imagePaths - Array of image file paths
 * @returns Formatted string with image paths, or empty string if no images
 */
export function formatImagePathsForPrompt(imagePaths: string[]): string {
  if (imagePaths.length === 0) {
    return "";
  }

  let text = "\n\nAttached images:\n";
  for (const imagePath of imagePaths) {
    text += `- ${imagePath}\n`;
  }
  return text;
}
