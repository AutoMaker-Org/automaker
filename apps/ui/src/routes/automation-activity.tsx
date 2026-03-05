import { createFileRoute } from '@tanstack/react-router';
import { AutomationRunHistoryView } from '@/components/views/automation-run-history-view';

export const Route = createFileRoute('/automation-activity')({
  component: AutomationRunHistoryView,
});
