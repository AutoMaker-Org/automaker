import { createLazyFileRoute, useSearch } from '@tanstack/react-router';
import { FileEditorView } from '@/components/views/file-editor-view/file-editor-view';

export const Route = createLazyFileRoute('/file-editor')({
  component: RouteComponent,
});

function RouteComponent() {
  const { path } = useSearch({ from: '/file-editor' });
  return <FileEditorView initialPath={path} />;
}
