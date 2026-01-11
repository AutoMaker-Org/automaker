import { createFileRoute } from '@tanstack/react-router';
import { GraphViewPage } from '@/components/views/graph-view-page';

export const Route = createFileRoute('/graph')({
  component: GraphViewPage,
});
