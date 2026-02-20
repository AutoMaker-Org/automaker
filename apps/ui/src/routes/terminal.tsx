import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const terminalSearchSchema = z.object({
  cwd: z.string().optional(),
  branch: z.string().optional(),
  mode: z.enum(['tab', 'split']).optional(),
  nonce: z.coerce.number().optional(),
  command: z.string().optional(),
});

// Component is lazy-loaded via terminal.lazy.tsx for code splitting
export const Route = createFileRoute('/terminal')({
  validateSearch: terminalSearchSchema,
});
