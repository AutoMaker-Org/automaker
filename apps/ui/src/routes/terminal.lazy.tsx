import { createLazyFileRoute, useSearch } from '@tanstack/react-router';
import { TerminalView } from '@/components/views/terminal-view';

export const Route = createLazyFileRoute('/terminal')({
  component: RouteComponent,
});

function RouteComponent() {
  const { cwd, branch, mode, nonce, command } = useSearch({ from: '/terminal' });
  return (
    <TerminalView
      initialCwd={cwd}
      initialBranch={branch}
      initialMode={mode}
      nonce={nonce}
      initialCommand={command}
    />
  );
}
