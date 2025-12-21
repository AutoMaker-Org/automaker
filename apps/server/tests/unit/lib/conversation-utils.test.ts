import { describe, it, expect } from "vitest";
import {
  extractTextFromContent,
  normalizeContentBlocks,
  formatHistoryAsText,
  convertHistoryToMessages,
} from "@automaker/utils";
import { conversationHistoryFixture } from "../../fixtures/messages.js";

describe("conversation-utils.ts", () => {
  describe("extractTextFromContent", () => {
    it("should return string content as-is", () => {
      const result = extractTextFromContent("Hello world");
      expect(result).toBe("Hello world");
    });

    it("should extract text from single text block", () => {
      const content = [{ type: "text", text: "Hello" }];
      const result = extractTextFromContent(content);
      expect(result).toBe("Hello");
    });

    it("should extract and join multiple text blocks with newlines", () => {
      const content = [
        { type: "text", text: "First block" },
        { type: "text", text: "Second block" },
        { type: "text", text: "Third block" },
      ];
      const result = extractTextFromContent(content);
      expect(result).toBe("First block\nSecond block\nThird block");
    });

    it("should ignore non-text blocks", () => {
      const content = [
        { type: "text", text: "Text content" },
        { type: "image", source: { type: "base64", data: "abc" } },
        { type: "text", text: "More text" },
        { type: "tool_use", name: "bash", input: {} },
      ];
      const result = extractTextFromContent(content);
      expect(result).toBe("Text content\nMore text");
    });

    it("should handle blocks without text property", () => {
      const content = [
        { type: "text", text: "Valid" },
        { type: "text" } as any,
        { type: "text", text: "Also valid" },
      ];
      const result = extractTextFromContent(content);
      expect(result).toBe("Valid\n\nAlso valid");
    });

    it("should handle empty array", () => {
      const result = extractTextFromContent([]);
      expect(result).toBe("");
    });

    it("should handle array with only non-text blocks", () => {
      const content = [
        { type: "image", source: {} },
        { type: "tool_use", name: "test" },
      ];
      const result = extractTextFromContent(content);
      expect(result).toBe("");
    });
  });

  describe("normalizeContentBlocks", () => {
    it("should convert string to content block array", () => {
      const result = normalizeContentBlocks("Hello");
      expect(result).toEqual([{ type: "text", text: "Hello" }]);
    });

    it("should return array content as-is", () => {
      const content = [
        { type: "text", text: "Hello" },
        { type: "image", source: {} },
      ];
      const result = normalizeContentBlocks(content);
      expect(result).toBe(content);
      expect(result).toHaveLength(2);
    });

    it("should handle empty string", () => {
      const result = normalizeContentBlocks("");
      expect(result).toEqual([{ type: "text", text: "" }]);
    });
  });

  describe("formatHistoryAsText", () => {
    it("should return empty string for empty history", () => {
      const result = formatHistoryAsText([]);
      expect(result).toBe("");
    });

    it("should format single user message", () => {
      const history = [{ role: "user" as const, content: "Hello" }];
      const result = formatHistoryAsText(history);

      expect(result).toContain("Previous conversation:");
      expect(result).toContain("User: Hello");
      expect(result).toContain("---");
    });

    it("should format single assistant message", () => {
      const history = [{ role: "assistant" as const, content: "Hi there" }];
      const result = formatHistoryAsText(history);

      expect(result).toContain("Assistant: Hi there");
    });

    it("should format multiple messages with correct roles", () => {
      const history = conversationHistoryFixture.slice(0, 2);
      const result = formatHistoryAsText(history);

      expect(result).toContain("User: Hello, can you help me?");
      expect(result).toContain("Assistant: Of course! How can I assist you today?");
      expect(result).toContain("---");
    });

    it("should handle messages with array content (multipart)", () => {
      const history = [conversationHistoryFixture[2]]; // Has text + image
      const result = formatHistoryAsText(history);

      expect(result).toContain("What is in this image?");
      expect(result).not.toContain("base64"); // Should not include image data
    });

    it("should format all messages from fixture", () => {
      const result = formatHistoryAsText(conversationHistoryFixture);

      expect(result).toContain("Previous conversation:");
      expect(result).toContain("User: Hello, can you help me?");
      expect(result).toContain("Assistant: Of course!");
      expect(result).toContain("User: What is in this image?");
      expect(result).toContain("---");
    });

    it("should separate messages with double newlines", () => {
      const history = [
        { role: "user" as const, content: "First" },
        { role: "assistant" as const, content: "Second" },
      ];
      const result = formatHistoryAsText(history);

      expect(result).toMatch(/User: First\n\nAssistant: Second/);
    });
  });

  describe("convertHistoryToMessages", () => {
    it("should convert empty history", () => {
      const result = convertHistoryToMessages([]);
      expect(result).toEqual([]);
    });

    it("should convert single message to SDK format", () => {
      const history = [{ role: "user" as const, content: "Hello" }];
      const result = convertHistoryToMessages(history);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: "user",
        session_id: "",
        message: {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
        parent_tool_use_id: null,
      });
    });

    it("should normalize string content to array", () => {
      const history = [{ role: "assistant" as const, content: "Response" }];
      const result = convertHistoryToMessages(history);

      expect(result[0].message.content).toEqual([
        { type: "text", text: "Response" },
      ]);
    });

    it("should preserve array content", () => {
      const history = [
        {
          role: "user" as const,
          content: [
            { type: "text", text: "Hello" },
            { type: "image", source: {} },
          ],
        },
      ];
      const result = convertHistoryToMessages(history);

      expect(result[0].message.content).toHaveLength(2);
      expect(result[0].message.content[0]).toEqual({ type: "text", text: "Hello" });
    });

    it("should convert multiple messages", () => {
      const history = conversationHistoryFixture.slice(0, 2);
      const result = convertHistoryToMessages(history);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("user");
      expect(result[1].type).toBe("assistant");
    });

    it("should set correct fields for SDK format", () => {
      const history = [{ role: "user" as const, content: "Test" }];
      const result = convertHistoryToMessages(history);

      expect(result[0].session_id).toBe("");
      expect(result[0].parent_tool_use_id).toBeNull();
      expect(result[0].type).toBe("user");
      expect(result[0].message.role).toBe("user");
    });

    it("should handle all messages from fixture", () => {
      const result = convertHistoryToMessages(conversationHistoryFixture);

      expect(result).toHaveLength(3);
      expect(result[0].message.content).toBeInstanceOf(Array);
      expect(result[1].message.content).toBeInstanceOf(Array);
      expect(result[2].message.content).toBeInstanceOf(Array);
    });
  });
});
