import { createFileRoute } from '@tanstack/react-router';
import { LinearIssuesView } from '@/components/views/linear-issues-view';

export const Route = createFileRoute('/linear')({
  component: LinearIssuesView,
});
