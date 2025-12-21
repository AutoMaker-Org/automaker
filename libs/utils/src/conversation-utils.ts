/**
 * Conversation history utilities for processing message history
 *
 * Provides standardized conversation history handling:
 * - Extract text from content (string or array format)
 * - Normalize content blocks to array format
 * - Format history as plain text for CLI-based providers
 * - Convert history to Claude SDK message format
 */

import type { ConversationMessage } from '@automaker/types';

/**
 * Extract plain text from message content (handles both string and array formats)
 *
 * @param content - Message content (string or array of content blocks)
 * @returns Extracted text content
 */
export function extractTextFromContent(
  content: string | Array<{ type: string; text?: string; source?: object }>
): string {
  if (typeof content === "string") {
    return content;
  }

  // Extract text blocks only
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text || "")
    .join("\n");
}

/**
 * Normalize message content to array format
 *
 * @param content - Message content (string or array)
 * @returns Content as array of blocks
 */
export function normalizeContentBlocks(
  content: string | Array<{ type: string; text?: string; source?: object }>
): Array<{ type: string; text?: string; source?: object }> {
  if (Array.isArray(content)) {
    return content;
  }
  return [{ type: "text", text: content }];
}

/**
 * Format conversation history as plain text for CLI-based providers
 *
 * @param history - Array of conversation messages
 * @returns Formatted text with role labels
 */
export function formatHistoryAsText(history: ConversationMessage[]): string {
  if (history.length === 0) {
    return "";
  }

  let historyText = "Previous conversation:\n\n";

  for (const msg of history) {
    const contentText = extractTextFromContent(msg.content);
    const role = msg.role === "user" ? "User" : "Assistant";
    historyText += `${role}: ${contentText}\n\n`;
  }

  historyText += "---\n\n";
  return historyText;
}

/**
 * Convert conversation history to Claude SDK message format
 *
 * @param history - Array of conversation messages
 * @returns Array of Claude SDK formatted messages
 */
export function convertHistoryToMessages(
  history: ConversationMessage[]
): Array<{
  type: "user" | "assistant";
  session_id: string;
  message: {
    role: "user" | "assistant";
    content: Array<{ type: string; text?: string; source?: object }>;
  };
  parent_tool_use_id: null;
}> {
  return history.map((historyMsg) => ({
    type: historyMsg.role,
    session_id: "",
    message: {
      role: historyMsg.role,
      content: normalizeContentBlocks(historyMsg.content),
    },
    parent_tool_use_id: null,
  }));
}
