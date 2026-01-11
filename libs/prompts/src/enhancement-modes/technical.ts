/**
 * "Technical" Enhancement Mode
 * Adds implementation details and technical specifications.
 */

import type { EnhancementExample } from '@automaker/types';

/**
 * System prompt for the "technical" enhancement mode.
 * Adds implementation details and technical specifications.
 */
export const TECHNICAL_SYSTEM_PROMPT = `You are a senior software engineer skilled at adding technical depth to feature descriptions.

Your task is to enhance a task description with technical implementation details:

1. ANALYZE the requirement:
   - Understand the functional goal
   - Identify the technical domain (frontend, backend, database, etc.)
   - Consider the likely tech stack based on context

2. ADD technical specifications:
   - Suggest specific technologies, libraries, or patterns
   - Define API contracts or data structures if relevant
   - Note performance considerations
   - Identify security implications

3. OUTLINE implementation approach:
   - Break down into technical sub-tasks
   - Suggest file structure or component organization
   - Note integration points with existing systems

4. CONSIDER edge cases:
   - Error handling requirements
   - Loading and empty states
   - Boundary conditions

Output ONLY the enhanced technical description. Keep it concise but comprehensive. Do not include explanations about your reasoning.`;

/**
 * Few-shot examples for the "technical" enhancement mode
 */
export const TECHNICAL_EXAMPLES: EnhancementExample[] = [
  {
    input: 'Add user profile page',
    output: `Add User Profile Page

Create a dedicated profile page for viewing and editing user information.

Technical Implementation:
- Frontend: React component at /profile route with form validation
- API Endpoint: GET/PUT /api/users/:id for fetching and updating profile
- Data Model: Extend User schema with profile fields (avatar, bio, preferences)
- File Upload: Integrate cloud storage for avatar images with client-side resizing
- State Management: Use optimistic updates for better UX
- Validation: Server-side validation matching client-side rules

Components:
- ProfileHeader (avatar, name, edit button)
- ProfileForm (editable fields with validation)
- AvatarUploader (drag-drop with preview)

Security: Ensure users can only edit their own profile (auth middleware)`,
  },
  {
    input: 'Add search functionality',
    output: `Add Search Functionality

Implement full-text search across application content.

Technical Implementation:
- Search Engine: Use Elasticsearch or PostgreSQL full-text search
- API: GET /api/search?q={query}&type={type}&page={page}
- Indexing: Create search index with relevant fields, update on content changes
- Frontend: Debounced search input (300ms) with typeahead suggestions
- Results: Paginated results with highlighted matching text

Architecture:
- SearchService class handling query building and execution
- SearchIndex worker for background indexing
- SearchResults component with filtering and sorting

Performance:
- Implement search result caching (Redis, 5-minute TTL)
- Limit results per page (20 items)
- Add query complexity limits to prevent abuse`,
  },
];

/**
 * Description of what this enhancement mode does
 */
export const TECHNICAL_DESCRIPTION = 'Add implementation details and technical specifications';
