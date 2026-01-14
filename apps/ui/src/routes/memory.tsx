import { createFileRoute } from '@tanstack/react-router';
import { MemoryView } from '@/components/views/memory-view';

export const Route = createFileRoute('/memory')({
  component: MemoryView,
});
