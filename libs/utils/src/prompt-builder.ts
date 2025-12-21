/**
 * Prompt building utilities for constructing prompts with images
 *
 * Provides standardized prompt building that:
 * - Combines text prompts with image attachments
 * - Handles content block array generation
 * - Optionally includes image paths in text
 * - Supports both vision and non-vision models
 */

import { convertImagesToContentBlocks, formatImagePathsForPrompt } from "./image-handler.js";

/**
 * Content that can be either simple text or structured blocks
 */
export type PromptContent = string | Array<{
  type: string;
  text?: string;
  source?: object;
}>;

/**
 * Result of building a prompt with optional images
 */
export interface PromptWithImages {
  content: PromptContent;
  hasImages: boolean;
}

/**
 * Build a prompt with optional image attachments
 *
 * @param basePrompt - The text prompt
 * @param imagePaths - Optional array of image file paths
 * @param workDir - Optional working directory for resolving relative paths
 * @param includeImagePaths - Whether to append image paths to the text (default: false)
 * @returns Promise resolving to prompt content and metadata
 */
export async function buildPromptWithImages(
  basePrompt: string,
  imagePaths?: string[],
  workDir?: string,
  includeImagePaths: boolean = false
): Promise<PromptWithImages> {
  // No images - return plain text
  if (!imagePaths || imagePaths.length === 0) {
    return { content: basePrompt, hasImages: false };
  }

  // Build text content with optional image path listing
  let textContent = basePrompt;
  if (includeImagePaths) {
    textContent += formatImagePathsForPrompt(imagePaths);
  }

  // Build content blocks array
  const contentBlocks: Array<{
    type: string;
    text?: string;
    source?: object;
  }> = [];

  // Add text block if we have text
  if (textContent.trim()) {
    contentBlocks.push({ type: "text", text: textContent });
  }

  // Add image blocks
  const imageBlocks = await convertImagesToContentBlocks(imagePaths, workDir);
  contentBlocks.push(...imageBlocks);

  // Return appropriate format
  const content: PromptContent =
    contentBlocks.length > 1 || contentBlocks[0]?.type === "image"
      ? contentBlocks
      : textContent;

  return { content, hasImages: true };
}
