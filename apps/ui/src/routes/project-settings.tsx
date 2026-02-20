import { createFileRoute } from '@tanstack/react-router';
import { ProjectSettingsView } from '@/components/views/project-settings-view';
import type { ProjectSettingsViewId } from '@/components/views/project-settings-view/hooks/use-project-settings-view';

interface ProjectSettingsSearchParams {
  section?: ProjectSettingsViewId;
}

export const Route = createFileRoute('/project-settings')({
  component: ProjectSettingsView,
  validateSearch: (search: Record<string, unknown>): ProjectSettingsSearchParams => {
    return {
      section: search.section as ProjectSettingsViewId | undefined,
    };
  },
});
