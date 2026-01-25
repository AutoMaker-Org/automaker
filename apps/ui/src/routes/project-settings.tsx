import { createFileRoute } from '@tanstack/react-router';
import { ProjectSettingsView } from '@/components/views/project-settings-view';

export const Route = createFileRoute('/project-settings')({
  component: ProjectSettingsView,
});
