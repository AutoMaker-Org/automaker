import { createFileRoute } from '@tanstack/react-router';
import { BoardView } from '@/components/views/board-view';

// Define the search params schema for the board route
type BoardSearchParams = {
  mode?: 'manage-backlog';
};

export const Route = createFileRoute('/board')({
  component: BoardView,
  validateSearch: (search: Record<string, unknown>): BoardSearchParams => {
    return {
      mode: search.mode === 'manage-backlog' ? 'manage-backlog' : undefined,
    };
  },
});
