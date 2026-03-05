import { createFileRoute } from '@tanstack/react-router';
import { AutomationManagementView } from '@/components/views/automation-management-view';

export const Route = createFileRoute('/automations')({
  component: AutomationManagementView,
});
