import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  getMimeTypeForImage,
  readImageAsBase64,
  convertImagesToContentBlocks,
  formatImagePathsForPrompt,
} from "../src/image-handler";

describe("image-handler.ts", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "image-handler-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("getMimeTypeForImage", () => {
    it("should return correct MIME type for .jpg", () => {
      expect(getMimeTypeForImage("image.jpg")).toBe("image/jpeg");
      expect(getMimeTypeForImage("/path/to/image.jpg")).toBe("image/jpeg");
    });

    it("should return correct MIME type for .jpeg", () => {
      expect(getMimeTypeForImage("image.jpeg")).toBe("image/jpeg");
    });

    it("should return correct MIME type for .png", () => {
      expect(getMimeTypeForImage("image.png")).toBe("image/png");
    });

    it("should return correct MIME type for .gif", () => {
      expect(getMimeTypeForImage("image.gif")).toBe("image/gif");
    });

    it("should return correct MIME type for .webp", () => {
      expect(getMimeTypeForImage("image.webp")).toBe("image/webp");
    });

    it("should be case-insensitive", () => {
      expect(getMimeTypeForImage("image.JPG")).toBe("image/jpeg");
      expect(getMimeTypeForImage("image.PNG")).toBe("image/png");
      expect(getMimeTypeForImage("image.GIF")).toBe("image/gif");
    });

    it("should default to image/png for unknown extensions", () => {
      expect(getMimeTypeForImage("file.xyz")).toBe("image/png");
      expect(getMimeTypeForImage("file.txt")).toBe("image/png");
      expect(getMimeTypeForImage("file")).toBe("image/png");
    });

    it("should handle filenames with multiple dots", () => {
      expect(getMimeTypeForImage("my.file.name.jpg")).toBe("image/jpeg");
    });
  });

  describe("readImageAsBase64", () => {
    it("should read image and return base64 data", async () => {
      const imagePath = path.join(tempDir, "test.png");
      const imageContent = Buffer.from("fake png data");
      await fs.writeFile(imagePath, imageContent);

      const result = await readImageAsBase64(imagePath);

      expect(result.base64).toBe(imageContent.toString("base64"));
      expect(result.mimeType).toBe("image/png");
      expect(result.filename).toBe("test.png");
      expect(result.originalPath).toBe(imagePath);
    });

    it("should handle different image formats", async () => {
      const formats = [
        { ext: "jpg", mime: "image/jpeg" },
        { ext: "png", mime: "image/png" },
        { ext: "gif", mime: "image/gif" },
        { ext: "webp", mime: "image/webp" },
      ];

      for (const format of formats) {
        const imagePath = path.join(tempDir, `image.${format.ext}`);
        await fs.writeFile(imagePath, Buffer.from("data"));

        const result = await readImageAsBase64(imagePath);

        expect(result.mimeType).toBe(format.mime);
        expect(result.filename).toBe(`image.${format.ext}`);
      }
    });

    it("should throw error if file doesn't exist", async () => {
      const imagePath = path.join(tempDir, "nonexistent.png");

      await expect(readImageAsBase64(imagePath)).rejects.toThrow();
    });

    it("should handle binary image data correctly", async () => {
      const imagePath = path.join(tempDir, "binary.png");
      const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      await fs.writeFile(imagePath, binaryData);

      const result = await readImageAsBase64(imagePath);

      expect(result.base64).toBe(binaryData.toString("base64"));
    });
  });

  describe("convertImagesToContentBlocks", () => {
    it("should convert single image to content block", async () => {
      const imagePath = path.join(tempDir, "test.png");
      await fs.writeFile(imagePath, Buffer.from("image data"));

      const result = await convertImagesToContentBlocks([imagePath]);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
        },
      });
      expect(result[0].source.data).toBeTruthy();
    });

    it("should convert multiple images", async () => {
      const image1 = path.join(tempDir, "image1.jpg");
      const image2 = path.join(tempDir, "image2.png");

      await fs.writeFile(image1, Buffer.from("jpg data"));
      await fs.writeFile(image2, Buffer.from("png data"));

      const result = await convertImagesToContentBlocks([image1, image2]);

      expect(result).toHaveLength(2);
      expect(result[0].source.media_type).toBe("image/jpeg");
      expect(result[1].source.media_type).toBe("image/png");
    });

    it("should resolve relative paths with workDir", async () => {
      const image = "test.png";
      const imagePath = path.join(tempDir, image);
      await fs.writeFile(imagePath, Buffer.from("data"));

      const result = await convertImagesToContentBlocks([image], tempDir);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("image");
    });

    it("should handle absolute paths without workDir", async () => {
      const imagePath = path.join(tempDir, "absolute.png");
      await fs.writeFile(imagePath, Buffer.from("data"));

      const result = await convertImagesToContentBlocks([imagePath]);

      expect(result).toHaveLength(1);
    });

    it("should skip images that fail to load", async () => {
      const validImage = path.join(tempDir, "valid.png");
      const invalidImage = path.join(tempDir, "nonexistent.png");

      await fs.writeFile(validImage, Buffer.from("data"));

      const result = await convertImagesToContentBlocks([
        validImage,
        invalidImage,
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].source.media_type).toBe("image/png");
    });

    it("should return empty array for empty input", async () => {
      const result = await convertImagesToContentBlocks([]);
      expect(result).toEqual([]);
    });

    it("should preserve order of images", async () => {
      const images = ["img1.jpg", "img2.png", "img3.gif"];

      for (const img of images) {
        await fs.writeFile(path.join(tempDir, img), Buffer.from("data"));
      }

      const result = await convertImagesToContentBlocks(images, tempDir);

      expect(result).toHaveLength(3);
      expect(result[0].source.media_type).toBe("image/jpeg");
      expect(result[1].source.media_type).toBe("image/png");
      expect(result[2].source.media_type).toBe("image/gif");
    });
  });

  describe("formatImagePathsForPrompt", () => {
    it("should return empty string for empty array", () => {
      const result = formatImagePathsForPrompt([]);
      expect(result).toBe("");
    });

    it("should format single image path", () => {
      const result = formatImagePathsForPrompt(["/path/to/image.png"]);
      expect(result).toBe("\n\nAttached images:\n- /path/to/image.png\n");
    });

    it("should format multiple image paths", () => {
      const result = formatImagePathsForPrompt([
        "/path/image1.png",
        "/path/image2.jpg",
        "/path/image3.gif",
      ]);

      expect(result).toBe(
        "\n\nAttached images:\n" +
          "- /path/image1.png\n" +
          "- /path/image2.jpg\n" +
          "- /path/image3.gif\n"
      );
    });

    it("should handle relative paths", () => {
      const result = formatImagePathsForPrompt([
        "relative/path/image.png",
        "another/image.jpg",
      ]);

      expect(result).toContain("- relative/path/image.png");
      expect(result).toContain("- another/image.jpg");
    });

    it("should start with newlines", () => {
      const result = formatImagePathsForPrompt(["/image.png"]);
      expect(result.startsWith("\n\n")).toBe(true);
    });

    it("should include header text", () => {
      const result = formatImagePathsForPrompt(["/image.png"]);
      expect(result).toContain("Attached images:");
    });
  });
});
