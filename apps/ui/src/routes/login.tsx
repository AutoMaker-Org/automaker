import { createFileRoute } from '@tanstack/react-router';
import { LoginView } from '@/components/views/login-view';

export const Route = createFileRoute('/login')({
  component: LoginView,
});
