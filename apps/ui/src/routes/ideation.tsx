import { createFileRoute } from '@tanstack/react-router';
import { IdeationView } from '@/components/views/ideation-view';

export const Route = createFileRoute('/ideation')({
  component: IdeationView,
});
