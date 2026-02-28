import { createLazyFileRoute, useSearch } from '@tanstack/react-router';
import { BoardView } from '@/components/views/board-view';

export const Route = createLazyFileRoute('/board')({
  component: BoardRouteComponent,
});

function BoardRouteComponent() {
  const { featureId } = useSearch({ from: '/board' });
  return <BoardView initialFeatureId={featureId} />;
}
