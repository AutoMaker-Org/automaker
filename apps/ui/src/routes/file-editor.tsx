import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const fileEditorSearchSchema = z.object({
  path: z.string().optional(),
});

// Component is lazy-loaded via file-editor.lazy.tsx for code splitting
export const Route = createFileRoute('/file-editor')({
  validateSearch: fileEditorSearchSchema,
});
