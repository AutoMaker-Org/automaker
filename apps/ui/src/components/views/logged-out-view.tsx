import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export function LoggedOutView() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <LogOut className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight">You’ve been logged out</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your session expired, or the server restarted. Please log in again.
          </p>
        </div>

        <div className="space-y-3">
          <Button className="w-full" onClick={() => navigate({ to: '/login' })}>
            Go to login
          </Button>
        </div>
      </div>
    </div>
  );
}
