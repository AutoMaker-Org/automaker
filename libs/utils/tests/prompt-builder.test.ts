import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { buildPromptWithImages } from "../src/prompt-builder";

describe("prompt-builder.ts", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-builder-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("buildPromptWithImages - no images", () => {
    it("should return plain text when no images provided", async () => {
      const basePrompt = "Hello, world!";

      const result = await buildPromptWithImages(basePrompt);

      expect(result.content).toBe("Hello, world!");
      expect(result.hasImages).toBe(false);
    });

    it("should return plain text when empty image array provided", async () => {
      const basePrompt = "Test prompt";

      const result = await buildPromptWithImages(basePrompt, []);

      expect(result.content).toBe("Test prompt");
      expect(result.hasImages).toBe(false);
    });

    it("should handle multiline prompts", async () => {
      const basePrompt = "Line 1\nLine 2\nLine 3";

      const result = await buildPromptWithImages(basePrompt);

      expect(result.content).toBe("Line 1\nLine 2\nLine 3");
    });
  });

  describe("buildPromptWithImages - with images", () => {
    it("should build content blocks with single image", async () => {
      const imagePath = path.join(tempDir, "test.png");
      await fs.writeFile(imagePath, Buffer.from("image data"));

      const result = await buildPromptWithImages(
        "Check this image",
        [imagePath]
      );

      expect(result.hasImages).toBe(true);
      expect(Array.isArray(result.content)).toBe(true);

      const blocks = result.content as Array<{
        type: string;
        text?: string;
        source?: object;
      }>;
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: "text",
        text: "Check this image",
      });
      expect(blocks[1]).toMatchObject({
        type: "image",
      });
    });

    it("should build content blocks with multiple images", async () => {
      const image1 = path.join(tempDir, "img1.jpg");
      const image2 = path.join(tempDir, "img2.png");

      await fs.writeFile(image1, Buffer.from("jpg data"));
      await fs.writeFile(image2, Buffer.from("png data"));

      const result = await buildPromptWithImages("Two images", [
        image1,
        image2,
      ]);

      expect(result.hasImages).toBe(true);

      const blocks = result.content as Array<{
        type: string;
        text?: string;
        source?: object;
      }>;
      expect(blocks).toHaveLength(3); // 1 text + 2 images
      expect(blocks[0].type).toBe("text");
      expect(blocks[1].type).toBe("image");
      expect(blocks[2].type).toBe("image");
    });

    it("should resolve relative paths with workDir", async () => {
      const imagePath = "test.png";
      const fullPath = path.join(tempDir, imagePath);
      await fs.writeFile(fullPath, Buffer.from("data"));

      const result = await buildPromptWithImages(
        "Test",
        [imagePath],
        tempDir
      );

      expect(result.hasImages).toBe(true);
      expect(Array.isArray(result.content)).toBe(true);
    });

    it("should handle absolute paths without workDir", async () => {
      const imagePath = path.join(tempDir, "absolute.png");
      await fs.writeFile(imagePath, Buffer.from("data"));

      const result = await buildPromptWithImages("Test", [imagePath]);

      expect(result.hasImages).toBe(true);
    });
  });

  describe("buildPromptWithImages - includeImagePaths option", () => {
    it("should not include image paths by default", async () => {
      const imagePath = path.join(tempDir, "test.png");
      await fs.writeFile(imagePath, Buffer.from("data"));

      const result = await buildPromptWithImages("Prompt", [imagePath]);

      const blocks = result.content as Array<{
        type: string;
        text?: string;
      }>;
      const textBlock = blocks.find((b) => b.type === "text");

      expect(textBlock?.text).not.toContain("Attached images:");
      expect(textBlock?.text).toBe("Prompt");
    });

    it("should include image paths when requested", async () => {
      const imagePath = path.join(tempDir, "test.png");
      await fs.writeFile(imagePath, Buffer.from("data"));

      const result = await buildPromptWithImages(
        "Prompt",
        [imagePath],
        undefined,
        true
      );

      const blocks = result.content as Array<{
        type: string;
        text?: string;
      }>;
      const textBlock = blocks.find((b) => b.type === "text");

      expect(textBlock?.text).toContain("Prompt");
      expect(textBlock?.text).toContain("Attached images:");
      expect(textBlock?.text).toContain(imagePath);
    });

    it("should format multiple image paths when included", async () => {
      const img1 = path.join(tempDir, "img1.png");
      const img2 = path.join(tempDir, "img2.jpg");

      await fs.writeFile(img1, Buffer.from("data1"));
      await fs.writeFile(img2, Buffer.from("data2"));

      const result = await buildPromptWithImages(
        "Test",
        [img1, img2],
        undefined,
        true
      );

      const blocks = result.content as Array<{
        type: string;
        text?: string;
      }>;
      const textBlock = blocks.find((b) => b.type === "text");

      expect(textBlock?.text).toContain("Attached images:");
      expect(textBlock?.text).toContain(img1);
      expect(textBlock?.text).toContain(img2);
    });
  });

  describe("buildPromptWithImages - edge cases", () => {
    it("should handle empty prompt with images", async () => {
      const imagePath = path.join(tempDir, "test.png");
      await fs.writeFile(imagePath, Buffer.from("data"));

      const result = await buildPromptWithImages("", [imagePath]);

      expect(result.hasImages).toBe(true);

      const blocks = result.content as Array<{
        type: string;
        text?: string;
        source?: object;
      }>;
      // Should only have image block, no text block for empty string
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.some((b) => b.type === "image")).toBe(true);
    });

    it("should handle whitespace-only prompt with images", async () => {
      const imagePath = path.join(tempDir, "test.png");
      await fs.writeFile(imagePath, Buffer.from("data"));

      const result = await buildPromptWithImages("   ", [imagePath]);

      expect(result.hasImages).toBe(true);

      const blocks = result.content as Array<{
        type: string;
        text?: string;
        source?: object;
      }>;
      // Whitespace-only is trimmed, so no text block should be added
      expect(blocks.every((b) => b.type !== "text")).toBe(true);
    });

    it("should skip failed image loads", async () => {
      const validImage = path.join(tempDir, "valid.png");
      const invalidImage = path.join(tempDir, "nonexistent.png");

      await fs.writeFile(validImage, Buffer.from("data"));

      const result = await buildPromptWithImages("Test", [
        validImage,
        invalidImage,
      ]);

      expect(result.hasImages).toBe(true);

      const blocks = result.content as Array<{
        type: string;
        text?: string;
        source?: object;
      }>;
      const imageBlocks = blocks.filter((b) => b.type === "image");

      // Only valid image should be included
      expect(imageBlocks).toHaveLength(1);
    });

    it("should handle mixed case in includeImagePaths parameter", async () => {
      const imagePath = path.join(tempDir, "test.png");
      await fs.writeFile(imagePath, Buffer.from("data"));

      const resultFalse = await buildPromptWithImages(
        "Test",
        [imagePath],
        undefined,
        false
      );
      const resultTrue = await buildPromptWithImages(
        "Test",
        [imagePath],
        undefined,
        true
      );

      const blocksFalse = resultFalse.content as Array<{
        type: string;
        text?: string;
      }>;
      const blocksTrue = resultTrue.content as Array<{
        type: string;
        text?: string;
      }>;

      expect(blocksFalse[0].text).not.toContain("Attached images:");
      expect(blocksTrue[0].text).toContain("Attached images:");
    });
  });

  describe("buildPromptWithImages - content format", () => {
    it("should return string when only text and includeImagePaths false", async () => {
      const result = await buildPromptWithImages("Just text", undefined);

      expect(typeof result.content).toBe("string");
    });

    it("should return array when has images", async () => {
      const imagePath = path.join(tempDir, "test.png");
      await fs.writeFile(imagePath, Buffer.from("data"));

      const result = await buildPromptWithImages("Text", [imagePath]);

      expect(Array.isArray(result.content)).toBe(true);
    });

    it("should preserve prompt formatting", async () => {
      const basePrompt = "Line 1\n\nLine 2\n  Indented line";
      const imagePath = path.join(tempDir, "test.png");
      await fs.writeFile(imagePath, Buffer.from("data"));

      const result = await buildPromptWithImages(basePrompt, [imagePath]);

      const blocks = result.content as Array<{
        type: string;
        text?: string;
      }>;
      const textBlock = blocks.find((b) => b.type === "text");

      expect(textBlock?.text).toBe(basePrompt);
    });
  });
});
