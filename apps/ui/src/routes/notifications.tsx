import { createFileRoute } from '@tanstack/react-router';
import { NotificationsView } from '@/components/views/notifications-view';

export const Route = createFileRoute('/notifications')({
  component: NotificationsView,
});
