import { describe, it, expect } from "vitest";
import type { ConversationMessage } from "@automaker/types";
import {
  extractTextFromContent,
  normalizeContentBlocks,
  formatHistoryAsText,
  convertHistoryToMessages,
} from "../src/conversation-utils";

describe("conversation-utils.ts", () => {
  describe("extractTextFromContent", () => {
    it("should extract text from string content", () => {
      const content = "Hello, world!";
      const result = extractTextFromContent(content);
      expect(result).toBe("Hello, world!");
    });

    it("should extract text from array content with text blocks", () => {
      const content = [
        { type: "text", text: "First block" },
        { type: "text", text: "Second block" },
      ];
      const result = extractTextFromContent(content);
      expect(result).toBe("First block\nSecond block");
    });

    it("should filter out non-text blocks", () => {
      const content = [
        { type: "text", text: "Text block" },
        { type: "image", source: { data: "..." } },
        { type: "text", text: "Another text" },
      ];
      const result = extractTextFromContent(content);
      expect(result).toBe("Text block\nAnother text");
    });

    it("should handle empty text blocks", () => {
      const content = [
        { type: "text", text: "First" },
        { type: "text" },
        { type: "text", text: "Third" },
      ];
      const result = extractTextFromContent(content);
      expect(result).toBe("First\n\nThird");
    });

    it("should return empty string for array with only non-text blocks", () => {
      const content = [
        { type: "image", source: {} },
        { type: "tool_use", source: {} },
      ];
      const result = extractTextFromContent(content);
      expect(result).toBe("");
    });

    it("should return empty string for empty array", () => {
      const content: Array<{ type: string; text?: string }> = [];
      const result = extractTextFromContent(content);
      expect(result).toBe("");
    });
  });

  describe("normalizeContentBlocks", () => {
    it("should convert string to array of text blocks", () => {
      const content = "Simple text";
      const result = normalizeContentBlocks(content);
      expect(result).toEqual([{ type: "text", text: "Simple text" }]);
    });

    it("should return array as-is", () => {
      const content = [
        { type: "text", text: "First" },
        { type: "image", source: {} },
      ];
      const result = normalizeContentBlocks(content);
      expect(result).toBe(content);
      expect(result).toEqual(content);
    });

    it("should handle empty string", () => {
      const content = "";
      const result = normalizeContentBlocks(content);
      expect(result).toEqual([{ type: "text", text: "" }]);
    });

    it("should handle multiline string", () => {
      const content = "Line 1\nLine 2\nLine 3";
      const result = normalizeContentBlocks(content);
      expect(result).toEqual([{ type: "text", text: "Line 1\nLine 2\nLine 3" }]);
    });
  });

  describe("formatHistoryAsText", () => {
    it("should format empty history as empty string", () => {
      const history: ConversationMessage[] = [];
      const result = formatHistoryAsText(history);
      expect(result).toBe("");
    });

    it("should format single user message", () => {
      const history: ConversationMessage[] = [
        { role: "user", content: "Hello!" },
      ];
      const result = formatHistoryAsText(history);
      expect(result).toBe("Previous conversation:\n\nUser: Hello!\n\n---\n\n");
    });

    it("should format single assistant message", () => {
      const history: ConversationMessage[] = [
        { role: "assistant", content: "Hi there!" },
      ];
      const result = formatHistoryAsText(history);
      expect(result).toBe(
        "Previous conversation:\n\nAssistant: Hi there!\n\n---\n\n"
      );
    });

    it("should format conversation with multiple messages", () => {
      const history: ConversationMessage[] = [
        { role: "user", content: "What's 2+2?" },
        { role: "assistant", content: "The answer is 4." },
        { role: "user", content: "Thanks!" },
      ];
      const result = formatHistoryAsText(history);
      expect(result).toBe(
        "Previous conversation:\n\n" +
          "User: What's 2+2?\n\n" +
          "Assistant: The answer is 4.\n\n" +
          "User: Thanks!\n\n" +
          "---\n\n"
      );
    });

    it("should handle array content by extracting text", () => {
      const history: ConversationMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "First part" },
            { type: "text", text: "Second part" },
          ],
        },
      ];
      const result = formatHistoryAsText(history);
      expect(result).toBe(
        "Previous conversation:\n\nUser: First part\nSecond part\n\n---\n\n"
      );
    });

    it("should handle mixed string and array content", () => {
      const history: ConversationMessage[] = [
        { role: "user", content: "String message" },
        {
          role: "assistant",
          content: [{ type: "text", text: "Array message" }],
        },
      ];
      const result = formatHistoryAsText(history);
      expect(result).toContain("User: String message");
      expect(result).toContain("Assistant: Array message");
    });
  });

  describe("convertHistoryToMessages", () => {
    it("should convert empty history", () => {
      const history: ConversationMessage[] = [];
      const result = convertHistoryToMessages(history);
      expect(result).toEqual([]);
    });

    it("should convert single user message", () => {
      const history: ConversationMessage[] = [
        { role: "user", content: "Hello!" },
      ];
      const result = convertHistoryToMessages(history);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: "user",
        session_id: "",
        message: {
          role: "user",
          content: [{ type: "text", text: "Hello!" }],
        },
        parent_tool_use_id: null,
      });
    });

    it("should convert single assistant message", () => {
      const history: ConversationMessage[] = [
        { role: "assistant", content: "Hi there!" },
      ];
      const result = convertHistoryToMessages(history);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: "assistant",
        session_id: "",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hi there!" }],
        },
        parent_tool_use_id: null,
      });
    });

    it("should preserve array content as-is", () => {
      const content = [
        { type: "text", text: "Text" },
        { type: "image", source: { data: "..." } },
      ];
      const history: ConversationMessage[] = [{ role: "user", content }];
      const result = convertHistoryToMessages(history);

      expect(result[0].message.content).toEqual(content);
    });

    it("should convert multiple messages", () => {
      const history: ConversationMessage[] = [
        { role: "user", content: "First" },
        { role: "assistant", content: "Second" },
        { role: "user", content: "Third" },
      ];
      const result = convertHistoryToMessages(history);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe("user");
      expect(result[1].type).toBe("assistant");
      expect(result[2].type).toBe("user");
    });

    it("should set session_id to empty string", () => {
      const history: ConversationMessage[] = [
        { role: "user", content: "Test" },
      ];
      const result = convertHistoryToMessages(history);

      expect(result[0].session_id).toBe("");
    });

    it("should set parent_tool_use_id to null", () => {
      const history: ConversationMessage[] = [
        { role: "user", content: "Test" },
      ];
      const result = convertHistoryToMessages(history);

      expect(result[0].parent_tool_use_id).toBeNull();
    });

    it("should normalize string content to blocks", () => {
      const history: ConversationMessage[] = [
        { role: "user", content: "String content" },
      ];
      const result = convertHistoryToMessages(history);

      expect(result[0].message.content).toEqual([
        { type: "text", text: "String content" },
      ]);
    });
  });
});
