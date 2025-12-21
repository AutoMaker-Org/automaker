/**
 * Image data with base64 encoding and metadata
 */
export interface ImageData {
  base64: string;
  mimeType: string;
  filename: string;
  originalPath: string;
}

/**
 * Content block for image (Claude SDK format)
 */
export interface ImageContentBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}
