import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

// Search params schema for board route
const boardSearchSchema = z.object({
  featureId: z.string().optional(),
  projectPath: z.string().optional(),
});

// Component is lazy-loaded via board.lazy.tsx for code splitting.
// Board is the most-visited landing route, but lazy loading still benefits
// initial load because the board component and its dependencies are only
// downloaded when the user actually navigates to /board (vs being bundled
// into the entry chunk). TanStack Router's autoCodeSplitting handles the
// dynamic import automatically when a .lazy.tsx file exists.
export const Route = createFileRoute('/board')({
  validateSearch: boardSearchSchema,
});
