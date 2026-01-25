/**
 * Notification Bell - Bell icon with unread count and popover
 */

import { useCallback } from 'react';
import { Bell, Check, Trash2, ExternalLink } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useNotificationsStore } from '@/store/notifications-store';
import { useLoadNotifications, useNotificationEvents } from '@/hooks/use-notification-events';
import { getHttpApiClient } from '@/lib/http-api-client';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Notification } from '@automaker/types';
import { cn } from '@/lib/utils';

/**
 * Format a date as relative time (e.g., "2 minutes ago", "3 hours ago")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
}

interface NotificationBellProps {
  projectPath: string | null;
}

export function NotificationBell({ projectPath }: NotificationBellProps) {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    isPopoverOpen,
    setPopoverOpen,
    markAsRead,
    dismissNotification,
  } = useNotificationsStore();

  // Load notifications and subscribe to events
  useLoadNotifications(projectPath);
  useNotificationEvents(projectPath);

  const handleMarkAsRead = useCallback(
    async (notificationId: string) => {
      if (!projectPath) return;

      // Optimistic update
      markAsRead(notificationId);

      // Sync with server
      const api = getHttpApiClient();
      await api.notifications.markAsRead(projectPath, notificationId);
    },
    [projectPath, markAsRead]
  );

  const handleDismiss = useCallback(
    async (notificationId: string) => {
      if (!projectPath) return;

      // Optimistic update
      dismissNotification(notificationId);

      // Sync with server
      const api = getHttpApiClient();
      await api.notifications.dismiss(projectPath, notificationId);
    },
    [projectPath, dismissNotification]
  );

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      // Mark as read
      handleMarkAsRead(notification.id);
      setPopoverOpen(false);

      // Navigate to the relevant view based on notification type
      if (notification.featureId) {
        navigate({ to: '/board' });
      }
    },
    [handleMarkAsRead, setPopoverOpen, navigate]
  );

  const handleViewAll = useCallback(() => {
    setPopoverOpen(false);
    navigate({ to: '/notifications' });
  }, [setPopoverOpen, navigate]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'feature_waiting_approval':
        return <Bell className="h-4 w-4 text-yellow-500" />;
      case 'feature_verified':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'spec_regeneration_complete':
        return <Check className="h-4 w-4 text-blue-500" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  // Show recent 3 notifications in popover
  const recentNotifications = notifications.slice(0, 3);

  if (!projectPath) {
    return null;
  }

  return (
    <Popover open={isPopoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'relative flex items-center justify-center w-8 h-8 rounded-md',
            'hover:bg-accent transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
          )}
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="right">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h4 className="font-medium text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">{unreadCount} unread</span>
          )}
        </div>

        {recentNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <Bell className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No notifications</p>
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto">
            {recentNotifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  'flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-accent/50 border-b last:border-b-0',
                  !notification.read && 'bg-primary/5'
                )}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex-shrink-0 mt-0.5">{getNotificationIcon(notification.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{notification.title}</p>
                    {!notification.read && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {notification.message}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatRelativeTime(new Date(notification.createdAt))}
                  </p>
                </div>
                <div className="flex-shrink-0 flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDismiss(notification.id);
                    }}
                    title="Dismiss"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {notifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={handleViewAll}>
              View all notifications
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
