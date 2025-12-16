import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateTitleFromPrompt,
  generateTitleWithFallback,
} from "@/services/title-generator.js";
import * as sdk from "@anthropic-ai/claude-agent-sdk";

vi.mock("@anthropic-ai/claude-agent-sdk");

describe("title-generator.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateTitleFromPrompt", () => {
    it("should generate a title from a prompt successfully", async () => {
      // Mock the SDK query to return an assistant message with the title
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield {
            type: "assistant",
            message: {
              content: [
                {
                  type: "text",
                  text: "Add Dark Mode Toggle to Settings",
                },
              ],
            },
          };
        })()
      );

      const result = await generateTitleFromPrompt(
        "Add a button to the settings page that allows users to toggle dark mode on and off"
      );

      expect(result).toBe("Add Dark Mode Toggle to Settings");
      expect(sdk.query).toHaveBeenCalledWith({
        prompt: expect.any(String),
        options: expect.objectContaining({
          model: expect.stringContaining("haiku"),
          systemPrompt: expect.stringContaining("title generator"),
          maxTurns: 1,
          allowedTools: [],
        }),
      });
    });

    it("should use Haiku model from ClaudeProvider", async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield {
            type: "assistant",
            message: {
              content: [
                {
                  type: "text",
                  text: "Test Title",
                },
              ],
            },
          };
        })()
      );

      await generateTitleFromPrompt("Test prompt");

      expect(sdk.query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            model: "claude-3-5-haiku-20241022",
          }),
        })
      );
    });

    it("should truncate very long prompts to 2000 characters", async () => {
      const longPrompt = "a".repeat(3000);

      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield {
            type: "assistant",
            message: {
              content: [
                {
                  type: "text",
                  text: "Long Feature Title",
                },
              ],
            },
          };
        })()
      );

      await generateTitleFromPrompt(longPrompt);

      // The prompt passed to the SDK should be truncated
      const callArgs = vi.mocked(sdk.query).mock.calls[0][0];
      expect((callArgs.prompt as string).length).toBeLessThanOrEqual(2003); // 2000 + "..."
    });

    it("should return null when SDK throws an error", async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          throw new Error("SDK Error");
        })()
      );

      const result = await generateTitleFromPrompt("Add a feature");

      expect(result).toBeNull();
    });

    it("should return null when no text content in response", async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield {
            type: "assistant",
            message: {
              content: [],
            },
          };
        })()
      );

      const result = await generateTitleFromPrompt("Add a feature");

      expect(result).toBeNull();
    });

    it("should pass abortController to SDK for timeout", async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield {
            type: "assistant",
            message: {
              content: [
                {
                  type: "text",
                  text: "Test Title",
                },
              ],
            },
          };
        })()
      );

      await generateTitleFromPrompt("Test");

      expect(sdk.query).toHaveBeenCalledWith({
        prompt: expect.any(String),
        options: expect.objectContaining({
          abortController: expect.any(AbortController),
        }),
      });
    });
  });

  describe("generateTitleWithFallback", () => {
    it("should return AI-generated title when available", async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield {
            type: "assistant",
            message: {
              content: [
                {
                  type: "text",
                  text: "Add User Authentication System",
                },
              ],
            },
          };
        })()
      );

      const result = await generateTitleWithFallback(
        "Implement user authentication using JWT tokens"
      );

      expect(result).toBe("Add User Authentication System");
    });

    it("should fallback to first line when AI fails", async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          throw new Error("API error");
        })()
      );

      const result = await generateTitleWithFallback(
        "Add a dark mode toggle\nThis should support both light and dark themes"
      );

      expect(result).toBe("Add a dark mode toggle");
    });

    it("should truncate long first lines in fallback", async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          throw new Error("API error");
        })()
      );

      const longFirstLine =
        "This is a very long first line that exceeds sixty characters and should be truncated";

      const result = await generateTitleWithFallback(longFirstLine);

      expect(result.length).toBeLessThanOrEqual(60);
      expect(result.endsWith("...")).toBe(true);
    });

    it("should return short prompts as-is in fallback", async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          throw new Error("API error");
        })()
      );

      const result = await generateTitleWithFallback("Fix login bug");

      expect(result).toBe("Fix login bug");
    });
  });
});
