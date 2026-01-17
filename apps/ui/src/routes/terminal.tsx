import { createFileRoute } from '@tanstack/react-router';
import { TerminalView } from '@/components/views/terminal-view';
import { z } from 'zod';

const terminalSearchSchema = z.object({
  cwd: z.string().optional(),
  branch: z.string().optional(),
  mode: z.enum(['tab', 'split']).optional(),
});

export const Route = createFileRoute('/terminal')({
  validateSearch: terminalSearchSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { cwd, branch, mode } = Route.useSearch();
  return <TerminalView initialCwd={cwd} initialBranch={branch} initialMode={mode} />;
}
