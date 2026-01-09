import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { LogOut, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout } from '@/lib/http-api-client';
import { useAuthStore } from '@/store/auth-store';

export function AccountSection() {
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      // Reset auth state
      useAuthStore.getState().resetAuth();
      // Navigate to logged out page
      navigate({ to: '/logged-out' });
    } catch (error) {
      console.error('Logout failed:', error);
      setIsLoggingOut(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/80 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm'
      )}
    >
      <div className="p-6 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
            <User className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Account</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">Manage your session and account.</p>
      </div>
      <div className="p-6 space-y-4">
        {/* Logout */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/30 border border-border/30">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-muted/50 to-muted/30 border border-border/30 flex items-center justify-center shrink-0">
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground">Log Out</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                End your current session and return to the login screen
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}
            disabled={isLoggingOut}
            data-testid="logout-button"
            className={cn(
              'shrink-0 gap-2',
              'transition-all duration-200 ease-out',
              'hover:scale-[1.02] active:scale-[0.98]'
            )}
          >
            <LogOut className="w-4 h-4" />
            {isLoggingOut ? 'Logging out...' : 'Log Out'}
          </Button>
        </div>
      </div>
    </div>
  );
}
