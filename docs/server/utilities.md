# Server Utilities Reference

This document describes all utility modules available in `apps/server/src/lib/`. These utilities provide reusable functionality for image handling, prompt building, model resolution, conversation management, and error handling.

---

## Table of Contents

1. [Image Handler](#image-handler)
2. [Prompt Builder](#prompt-builder)
3. [Model Resolver](#model-resolver)
4. [Conversation Utils](#conversation-utils)
5. [Error Handler](#error-handler)
6. [Subprocess Manager](#subprocess-manager)
7. [Events](#events)
8. [Auth](#auth)
9. [Security](#security)

---

## Image Handler

**Location**: `apps/server/src/lib/image-handler.ts`

Centralized utilities for processing image files, including MIME type detection, base64 encoding, and content block generation for Claude SDK format.

### Functions

#### `getMimeTypeForImage(imagePath: string): string`

Get MIME type for an image file based on its extension.

**Supported formats**:

- `.jpg`, `.jpeg` → `image/jpeg`
- `.png` → `image/png`
- `.gif` → `image/gif`
- `.webp` → `image/webp`
- Default: `image/png`

**Example**:

```typescript
import { getMimeTypeForImage } from '../lib/image-handler.js';

const mimeType = getMimeTypeForImage('/path/to/image.jpg');
// Returns: "image/jpeg"
```

---

#### `readImageAsBase64(imagePath: string): Promise<ImageData>`

Read an image file and convert to base64 with metadata.

**Returns**: `ImageData`

```typescript
interface ImageData {
  base64: string; // Base64-encoded image data
  mimeType: string; // MIME type
  filename: string; // File basename
  originalPath: string; // Original file path
}
```

**Example**:

```typescript
const imageData = await readImageAsBase64('/path/to/photo.png');
console.log(imageData.base64); // "iVBORw0KG..."
console.log(imageData.mimeType); // "image/png"
console.log(imageData.filename); // "photo.png"
```

---

#### `convertImagesToContentBlocks(imagePaths: string[], workDir?: string): Promise<ImageContentBlock[]>`

Convert image paths to content blocks in Claude SDK format. Handles both relative and absolute paths.

**Parameters**:

- `imagePaths` - Array of image file paths
- `workDir` - Optional working directory for resolving relative paths

**Returns**: Array of `ImageContentBlock`

```typescript
interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}
```

**Example**:

```typescript
const imageBlocks = await convertImagesToContentBlocks(
  ['./screenshot.png', '/absolute/path/diagram.jpg'],
  '/project/root'
);

// Use in prompt content
const contentBlocks = [{ type: 'text', text: 'Analyze these images:' }, ...imageBlocks];
```

---

#### `formatImagePathsForPrompt(imagePaths: string[]): string`

Format image paths as a bulleted list for inclusion in text prompts.

**Returns**: Formatted string with image paths, or empty string if no images.

**Example**:

```typescript
const pathsList = formatImagePathsForPrompt([
  '/screenshots/login.png',
  '/diagrams/architecture.png',
]);

// Returns:
// "\n\nAttached images:\n- /screenshots/login.png\n- /diagrams/architecture.png\n"
```

---

## Prompt Builder

**Location**: `apps/server/src/lib/prompt-builder.ts`

Standardized prompt building that combines text prompts with image attachments.

### Functions

#### `buildPromptWithImages(basePrompt: string, imagePaths?: string[], workDir?: string, includeImagePaths: boolean = false): Promise<PromptWithImages>`

Build a prompt with optional image attachments.

**Parameters**:

- `basePrompt` - The text prompt
- `imagePaths` - Optional array of image file paths
- `workDir` - Optional working directory for resolving relative paths
- `includeImagePaths` - Whether to append image paths to the text (default: false)

**Returns**: `PromptWithImages`

```typescript
interface PromptWithImages {
  content: PromptContent; // string | Array<ContentBlock>
  hasImages: boolean;
}

type PromptContent =
  | string
  | Array<{
      type: string;
      text?: string;
      source?: object;
    }>;
```

**Example**:

```typescript
import { buildPromptWithImages } from '../lib/prompt-builder.js';

// Without images
const { content } = await buildPromptWithImages('What is 2+2?');
// content: "What is 2+2?" (simple string)

// With images
const { content, hasImages } = await buildPromptWithImages(
  'Analyze this screenshot',
  ['/path/to/screenshot.png'],
  '/project/root',
  true // include image paths in text
);
// content: [
//   { type: "text", text: "Analyze this screenshot\n\nAttached images:\n- /path/to/screenshot.png\n" },
//   { type: "image", source: { type: "base64", media_type: "image/png", data: "..." } }
// ]
// hasImages: true
```

**Use Cases**:

- **AgentService**: Set `includeImagePaths: true` to list paths for Read tool access
- **AutoModeService**: Set `includeImagePaths: false` to avoid duplication in feature descriptions

---

## Model Resolver

**Location**: `apps/server/src/lib/model-resolver.ts`

Centralized model string mapping and resolution for handling model aliases and provider detection.

### Constants

#### `CLAUDE_MODEL_MAP`

Model alias mapping for Claude models.

```typescript
export const CLAUDE_MODEL_MAP: Record<string, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-6',
} as const;
```

#### `DEFAULT_MODELS`

Default models per provider.

```typescript
export const DEFAULT_MODELS = {
  claude: 'claude-opus-4-6',
  openai: 'gpt-5.2',
} as const;
```

### Functions

#### `resolveModelString(modelKey?: string, defaultModel: string = DEFAULT_MODELS.claude): string`

Resolve a model key/alias to a full model string.

**Logic**:

1. If `modelKey` is undefined → return `defaultModel`
2. If starts with `"gpt-"` or `"o"` → pass through (OpenAI/Codex model)
3. If includes `"claude-"` → pass through (full Claude model string)
4. If in `CLAUDE_MODEL_MAP` → return mapped value
5. Otherwise → return `defaultModel` with warning

**Example**:

```typescript
import { resolveModelString, DEFAULT_MODELS } from '../lib/model-resolver.js';

resolveModelString('opus');
// Returns: "claude-opus-4-6"
// Logs: "[ModelResolver] Resolved model alias: "opus" -> "claude-opus-4-6""

resolveModelString('gpt-5.2');
// Returns: "gpt-5.2"
// Logs: "[ModelResolver] Using OpenAI/Codex model: gpt-5.2"

resolveModelString('claude-sonnet-4-20250514');
// Returns: "claude-sonnet-4-20250514"
// Logs: "[ModelResolver] Using full Claude model string: claude-sonnet-4-20250514"

resolveModelString('invalid-model');
// Returns: "claude-opus-4-6"
// Logs: "[ModelResolver] Unknown model key "invalid-model", using default: "claude-opus-4-6""
```

---

#### `getEffectiveModel(explicitModel?: string, sessionModel?: string, defaultModel?: string): string`

Get the effective model from multiple sources with priority.

**Priority**: explicit model > session model > default model

**Example**:

```typescript
import { getEffectiveModel } from '../lib/model-resolver.js';

// Explicit model takes precedence
getEffectiveModel('sonnet', 'opus');
// Returns: "claude-sonnet-4-20250514"

// Falls back to session model
getEffectiveModel(undefined, 'haiku');
// Returns: "claude-haiku-4-5"

// Falls back to default
getEffectiveModel(undefined, undefined, 'gpt-5.2');
// Returns: "gpt-5.2"
```

---

## Conversation Utils

**Location**: `apps/server/src/lib/conversation-utils.ts`

Standardized conversation history processing for both SDK-based and CLI-based providers.

### Types

```typescript
import type { ConversationMessage } from '../providers/types.js';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; source?: object }>;
}
```

### Functions

#### `extractTextFromContent(content: string | Array<ContentBlock>): string`

Extract plain text from message content (handles both string and array formats).

**Example**:

```typescript
import { extractTextFromContent } from "../lib/conversation-utils.js";

// String content
extractTextFromContent("Hello world");
// Returns: "Hello world"

// Array content
extractTextFromContent([
  { type: "text", text: "Hello" },
  { type: "image", source: {...} },
  { type: "text", text: "world" }
]);
// Returns: "Hello\nworld"
```

---

#### `normalizeContentBlocks(content: string | Array<ContentBlock>): Array<ContentBlock>`

Normalize message content to array format.

**Example**:

```typescript
// String → array
normalizeContentBlocks('Hello');
// Returns: [{ type: "text", text: "Hello" }]

// Array → pass through
normalizeContentBlocks([{ type: 'text', text: 'Hello' }]);
// Returns: [{ type: "text", text: "Hello" }]
```

---

#### `formatHistoryAsText(history: ConversationMessage[]): string`

Format conversation history as plain text for CLI-based providers (e.g., Codex).

**Returns**: Formatted text with role labels, or empty string if no history.

**Example**:

```typescript
const history = [
  { role: 'user', content: 'What is 2+2?' },
  { role: 'assistant', content: '2+2 equals 4.' },
];

const formatted = formatHistoryAsText(history);
// Returns:
// "Previous conversation:
//
// User: What is 2+2?
//
// Assistant: 2+2 equals 4.
//
// ---
//
// "
```

---

#### `convertHistoryToMessages(history: ConversationMessage[]): Array<SDKMessage>`

Convert conversation history to Claude SDK message format.

**Returns**: Array of SDK-formatted messages ready to yield in async generator.

**Example**:

```typescript
const history = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' },
];

const messages = convertHistoryToMessages(history);
// Returns:
// [
//   {
//     type: "user",
//     session_id: "",
//     message: {
//       role: "user",
//       content: [{ type: "text", text: "Hello" }]
//     },
//     parent_tool_use_id: null
//   },
//   {
//     type: "assistant",
//     session_id: "",
//     message: {
//       role: "assistant",
//       content: [{ type: "text", text: "Hi there!" }]
//     },
//     parent_tool_use_id: null
//   }
// ]
```

---

## Error Handler

**Location**: `apps/server/src/lib/error-handler.ts`

Standardized error classification and handling utilities.

### Types

```typescript
export type ErrorType = 'authentication' | 'abort' | 'execution' | 'unknown';

export interface ErrorInfo {
  type: ErrorType;
  message: string;
  isAbort: boolean;
  isAuth: boolean;
  originalError: unknown;
}
```

### Functions

#### `isAbortError(error: unknown): boolean`

Check if an error is an abort/cancellation error.

**Example**:

```typescript
import { isAbortError } from '../lib/error-handler.js';

try {
  // ... operation
} catch (error) {
  if (isAbortError(error)) {
    console.log('Operation was cancelled');
    return { success: false, aborted: true };
  }
}
```

---

#### `isAuthenticationError(errorMessage: string): boolean`

Check if an error is an authentication/API key error.

**Detects**:

- "Authentication failed"
- "Invalid API key"
- "authentication_failed"
- "Fix external API key"

**Example**:

```typescript
if (isAuthenticationError(error.message)) {
  console.error('Please check your API key configuration');
}
```

---

#### `classifyError(error: unknown): ErrorInfo`

Classify an error into a specific type.

**Example**:

```typescript
import { classifyError } from '../lib/error-handler.js';

try {
  // ... operation
} catch (error) {
  const errorInfo = classifyError(error);

  switch (errorInfo.type) {
    case 'authentication':
      // Handle auth errors
      break;
    case 'abort':
      // Handle cancellation
      break;
    case 'execution':
      // Handle other errors
      break;
  }
}
```

---

#### `getUserFriendlyErrorMessage(error: unknown): string`

Get a user-friendly error message.

**Example**:

```typescript
try {
  // ... operation
} catch (error) {
  const friendlyMessage = getUserFriendlyErrorMessage(error);
  // "Operation was cancelled" for abort errors
  // "Authentication failed. Please check your API key." for auth errors
  // Original error message for other errors
}
```

---

## Subprocess Manager

**Location**: `apps/server/src/lib/subprocess-manager.ts`

Utilities for spawning CLI processes and parsing JSONL streams (used by Codex provider).

### Types

```typescript
export interface SubprocessOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  abortController?: AbortController;
  timeout?: number; // Milliseconds of no output before timeout
}

export interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}
```

### Functions

#### `async function* spawnJSONLProcess(options: SubprocessOptions): AsyncGenerator<unknown>`

Spawns a subprocess and streams JSONL output line-by-line.

**Features**:

- Parses each line as JSON
- Handles abort signals
- 30-second timeout detection for hanging processes
- Collects stderr for error reporting
- Continues processing other lines if one fails to parse

**Example**:

```typescript
import { spawnJSONLProcess } from '../lib/subprocess-manager.js';

const stream = spawnJSONLProcess({
  command: 'codex',
  args: ['exec', '--model', 'gpt-5.2', '--json', '--full-auto', 'Fix the bug'],
  cwd: '/project/path',
  env: { OPENAI_API_KEY: 'sk-...' },
  abortController: new AbortController(),
  timeout: 30000,
});

for await (const event of stream) {
  console.log('Received event:', event);
  // Process JSONL events
}
```

---

#### `async function spawnProcess(options: SubprocessOptions): Promise<SubprocessResult>`

Spawns a subprocess and collects all output.

**Example**:

```typescript
const result = await spawnProcess({
  command: 'git',
  args: ['status'],
  cwd: '/project/path',
});

console.log(result.stdout); // Git status output
console.log(result.exitCode); // 0 for success
```

---

## Events

**Location**: `apps/server/src/lib/events.ts`

Event emitter system for WebSocket communication.

**Documented separately** - see existing codebase for event types and usage.

---

## Auth

**Location**: `apps/server/src/lib/auth.ts`

Authentication utilities for API endpoints.

**Documented separately** - see existing codebase for authentication flow.

---

## Security

**Location**: `apps/server/src/lib/security.ts`

Security utilities for input validation and sanitization.

**Documented separately** - see existing codebase for security patterns.

---

## Best Practices

### When to Use Which Utility

1. **Image handling** → Always use `image-handler.ts` utilities
   - ✅ Do: `convertImagesToContentBlocks(imagePaths, workDir)`
   - ❌ Don't: Manually read files and encode base64

2. **Prompt building** → Use `prompt-builder.ts` for consistency
   - ✅ Do: `buildPromptWithImages(text, images, workDir, includePathsInText)`
   - ❌ Don't: Manually construct content block arrays

3. **Model resolution** → Use `model-resolver.ts` for all model handling
   - ✅ Do: `resolveModelString(feature.model, DEFAULT_MODELS.claude)`
   - ❌ Don't: Inline model mapping logic

4. **Error handling** → Use `error-handler.ts` for classification
   - ✅ Do: `if (isAbortError(error)) { ... }`
   - ❌ Don't: `if (error instanceof AbortError || error.name === "AbortError") { ... }`

### Importing Utilities

Always use `.js` extension in imports for ESM compatibility:

```typescript
// ✅ Correct
import { buildPromptWithImages } from '../lib/prompt-builder.js';

// ❌ Incorrect
import { buildPromptWithImages } from '../lib/prompt-builder';
```

---

## Testing Utilities

When writing tests for utilities:

1. **Unit tests** - Test each function in isolation
2. **Integration tests** - Test utilities working together
3. **Mock external dependencies** - File system, child processes

Example:

```typescript
describe('image-handler', () => {
  it('should detect MIME type correctly', () => {
    expect(getMimeTypeForImage('photo.jpg')).toBe('image/jpeg');
    expect(getMimeTypeForImage('diagram.png')).toBe('image/png');
  });
});
```
