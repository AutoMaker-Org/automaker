import { createFileRoute } from '@tanstack/react-router';
import { LoggedOutView } from '@/components/views/logged-out-view';

export const Route = createFileRoute('/logged-out')({
  component: LoggedOutView,
});
