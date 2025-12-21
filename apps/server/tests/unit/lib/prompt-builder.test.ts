import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as utils from "@automaker/utils";
import * as fs from "fs/promises";

// Mock fs module for the image-handler's readFile calls
vi.mock("fs/promises");

describe("prompt-builder.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default mock for fs.readFile to return a valid image buffer
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from("fake-image-data"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("buildPromptWithImages", () => {
    it("should return plain text when no images provided", async () => {
      const result = await utils.buildPromptWithImages("Hello world");

      expect(result).toEqual({
        content: "Hello world",
        hasImages: false,
      });
    });

    it("should return plain text when imagePaths is empty array", async () => {
      const result = await utils.buildPromptWithImages("Hello world", []);

      expect(result).toEqual({
        content: "Hello world",
        hasImages: false,
      });
    });

    it("should build content blocks with single image", async () => {
      const result = await utils.buildPromptWithImages("Describe this image", [
        "/test.png",
      ]);

      expect(result.hasImages).toBe(true);
      expect(Array.isArray(result.content)).toBe(true);
      const content = result.content as Array<{ type: string; text?: string }>;
      expect(content).toHaveLength(2);
      expect(content[0]).toEqual({ type: "text", text: "Describe this image" });
      expect(content[1].type).toBe("image");
    });

    it("should build content blocks with multiple images", async () => {
      const result = await utils.buildPromptWithImages("Analyze these", [
        "/a.png",
        "/b.jpg",
      ]);

      expect(result.hasImages).toBe(true);
      const content = result.content as Array<{ type: string }>;
      expect(content).toHaveLength(3); // 1 text + 2 images
      expect(content[0].type).toBe("text");
      expect(content[1].type).toBe("image");
      expect(content[2].type).toBe("image");
    });

    it("should include image paths in text when requested", async () => {
      const result = await utils.buildPromptWithImages(
        "Base prompt",
        ["/test.png"],
        undefined,
        true
      );

      const content = result.content as Array<{ type: string; text?: string }>;
      expect(content[0].text).toContain("Base prompt");
      expect(content[0].text).toContain("/test.png");
    });

    it("should not include image paths by default", async () => {
      const result = await utils.buildPromptWithImages("Base prompt", ["/test.png"]);

      const content = result.content as Array<{ type: string; text?: string }>;
      expect(content[0].text).toBe("Base prompt");
      expect(content[0].text).not.toContain("Attached");
    });

    it("should handle empty text content", async () => {
      const result = await utils.buildPromptWithImages("", ["/test.png"]);

      expect(result.hasImages).toBe(true);
      // When text is empty/whitespace, should only have image blocks
      const content = result.content as Array<{ type: string }>;
      expect(content.every((block) => block.type === "image")).toBe(true);
    });

    it("should trim text content before checking if empty", async () => {
      const result = await utils.buildPromptWithImages("   ", ["/test.png"]);

      const content = result.content as Array<{ type: string }>;
      // Whitespace-only text should be excluded
      expect(content.every((block) => block.type === "image")).toBe(true);
    });

    it("should return text when only one block and it's text", async () => {
      // Make readFile reject to simulate image load failure
      vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"));

      const result = await utils.buildPromptWithImages("Just text", ["/missing.png"]);

      // If no images are successfully loaded, should return just the text
      expect(result.content).toBe("Just text");
      expect(result.hasImages).toBe(true); // Still true because images were requested
    });

    it("should pass workDir for path resolution", async () => {
      // The function should use workDir to resolve relative paths
      const result = await utils.buildPromptWithImages(
        "Test",
        ["relative.png"],
        "/work/dir"
      );

      // Verify it tried to read the file (with resolved path including workDir)
      expect(fs.readFile).toHaveBeenCalled();
      // The path should be resolved using workDir
      const readCall = vi.mocked(fs.readFile).mock.calls[0][0];
      expect(readCall).toContain("relative.png");
    });
  });
});
