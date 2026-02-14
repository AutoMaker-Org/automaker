import { createFileRoute } from '@tanstack/react-router';
import { FilesView } from '@/components/views/files-view';

export const Route = createFileRoute('/files')({
  component: FilesView,
});
