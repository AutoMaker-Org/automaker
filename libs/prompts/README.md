# @automaker/prompts

AI prompt templates for text enhancement and other AI-powered features in AutoMaker.

## Overview

This package provides professionally-crafted prompt templates for enhancing user-written task descriptions using Claude. It includes system prompts, few-shot examples, and utility functions for different enhancement modes: improve, technical, simplify, and acceptance.

## Installation

```bash
npm install @automaker/prompts
```

## Exports

### Enhancement Modes

Four modes are available, each optimized for a specific enhancement task:

- **improve** - Transform vague requests into clear, actionable tasks
- **technical** - Add implementation details and technical specifications
- **simplify** - Make verbose descriptions concise and focused
- **acceptance** - Add testable acceptance criteria

### System Prompts

Direct access to system prompts for each mode:

```typescript
import {
  IMPROVE_SYSTEM_PROMPT,
  TECHNICAL_SYSTEM_PROMPT,
  SIMPLIFY_SYSTEM_PROMPT,
  ACCEPTANCE_SYSTEM_PROMPT
} from '@automaker/prompts';

console.log(IMPROVE_SYSTEM_PROMPT); // Full system prompt for improve mode
```

### Helper Functions

#### `getEnhancementPrompt(mode, description)`

Get complete prompt (system + user) for an enhancement mode:

```typescript
import { getEnhancementPrompt } from '@automaker/prompts';

const result = getEnhancementPrompt('improve', 'make app faster');

console.log(result.systemPrompt); // System instructions for improve mode
console.log(result.userPrompt);   // User prompt with examples and input
```

#### `getSystemPrompt(mode)`

Get only the system prompt for a mode:

```typescript
import { getSystemPrompt } from '@automaker/prompts';

const systemPrompt = getSystemPrompt('technical');
```

#### `getExamples(mode)`

Get few-shot examples for a mode:

```typescript
import { getExamples } from '@automaker/prompts';

const examples = getExamples('simplify');
// Returns array of { input, output } pairs
```

#### `buildUserPrompt(description, mode)`

Build user prompt with examples:

```typescript
import { buildUserPrompt } from '@automaker/prompts';

const userPrompt = buildUserPrompt('add login page', 'improve');
// Includes examples + user's description
```

#### `isValidEnhancementMode(mode)`

Check if a mode is valid:

```typescript
import { isValidEnhancementMode } from '@automaker/prompts';

if (isValidEnhancementMode('improve')) {
  // Mode is valid
}
```

#### `getAvailableEnhancementModes()`

Get list of all available modes:

```typescript
import { getAvailableEnhancementModes } from '@automaker/prompts';

const modes = getAvailableEnhancementModes();
// Returns: ['improve', 'technical', 'simplify', 'acceptance']
```

## Usage Examples

### Basic Enhancement

```typescript
import { getEnhancementPrompt } from '@automaker/prompts';

async function enhanceDescription(description: string, mode: string) {
  const { systemPrompt, userPrompt } = getEnhancementPrompt(mode, description);

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  return response.content[0].text;
}

// Example usage
const improved = await enhanceDescription('make app faster', 'improve');
// → "Optimize application performance by profiling bottlenecks..."

const technical = await enhanceDescription('add search', 'technical');
// → "Implement full-text search with the following components:..."
```

### Mode Validation

```typescript
import { isValidEnhancementMode, getAvailableEnhancementModes } from '@automaker/prompts';

function validateAndEnhance(mode: string, description: string) {
  if (!isValidEnhancementMode(mode)) {
    const available = getAvailableEnhancementModes().join(', ');
    throw new Error(`Invalid mode "${mode}". Available: ${available}`);
  }

  return enhanceDescription(description, mode);
}
```

### Custom Prompt Building

```typescript
import { getSystemPrompt, buildUserPrompt, getExamples } from '@automaker/prompts';

// Get components separately for custom workflows
const systemPrompt = getSystemPrompt('simplify');
const examples = getExamples('simplify');
const userPrompt = buildUserPrompt(userInput, 'simplify');

// Use with custom processing
const response = await processWithClaude(systemPrompt, userPrompt);
```

### Server Route Example

```typescript
import { getEnhancementPrompt, isValidEnhancementMode } from '@automaker/prompts';
import { createLogger } from '@automaker/utils';

const logger = createLogger('EnhancementRoute');

app.post('/api/enhance', async (req, res) => {
  const { description, mode } = req.body;

  if (!isValidEnhancementMode(mode)) {
    return res.status(400).json({ error: 'Invalid enhancement mode' });
  }

  try {
    const { systemPrompt, userPrompt } = getEnhancementPrompt(mode, description);

    const result = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    logger.info(`Enhanced with mode: ${mode}`);
    res.json({ enhanced: result.content[0].text });
  } catch (error) {
    logger.error('Enhancement failed:', error);
    res.status(500).json({ error: 'Enhancement failed' });
  }
});
```

## Enhancement Mode Details

### Improve Mode

Transforms vague or unclear requests into clear, actionable specifications.

**Before:** "make app faster"
**After:** "Optimize application performance by:
1. Profiling code to identify bottlenecks
2. Implementing caching for frequently accessed data
3. Optimizing database queries..."

### Technical Mode

Adds implementation details and technical specifications.

**Before:** "add search"
**After:** "Implement full-text search using:
- Backend: Elasticsearch or PostgreSQL full-text search
- Frontend: Debounced search input with loading states
- API: GET /api/search endpoint with pagination..."

### Simplify Mode

Makes verbose descriptions concise while preserving essential information.

**Before:** "We really need to make sure that the application has the capability to allow users to be able to search for various items..."
**After:** "Add search functionality for items with filters and results display."

### Acceptance Mode

Adds testable acceptance criteria to feature descriptions.

**Before:** "user login"
**After:** "User login feature
- User can enter email and password
- System validates credentials
- On success: redirect to dashboard
- On failure: show error message
- Remember me option persists login..."

## Dependencies

- `@automaker/types` - Type definitions for EnhancementMode and EnhancementExample

## Used By

- `@automaker/server` - Enhancement API routes
- Future packages requiring AI-powered text enhancement

## License

SEE LICENSE IN LICENSE
