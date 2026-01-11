import { createFileRoute } from '@tanstack/react-router';
import { DashboardView } from '@/components/views/dashboard-view';

export const Route = createFileRoute('/dashboard')({
  component: DashboardView,
});
