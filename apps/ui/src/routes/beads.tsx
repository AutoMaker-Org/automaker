import { createFileRoute } from '@tanstack/react-router';
import { BeadsView } from '@/components/views/beads-view';

export const Route = createFileRoute('/beads')({
  component: BeadsView,
});
