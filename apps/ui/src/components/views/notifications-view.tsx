/**
 * Notifications View - Full page view for all notifications
 */

import { useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { useNotificationsStore } from '@/store/notifications-store';
import { useLoadNotifications, useNotificationEvents } from '@/hooks/use-notification-events';
import { getHttpApiClient } from '@/lib/http-api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, Check, CheckCheck, Trash2, ExternalLink } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useNavigate } from '@tanstack/react-router';
import type { Notification } from '@automaker/types';

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

export function NotificationsView() {
  const { currentProject } = useAppStore();
  const projectPath = currentProject?.path ?? null;
  const navigate = useNavigate();

  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    setNotifications,
    setUnreadCount,
    markAsRead,
    dismissNotification,
    markAllAsRead,
    dismissAll,
  } = useNotificationsStore();

  // Load notifications when project changes
  useLoadNotifications(projectPath);

  // Subscribe to real-time notification events
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

  const handleMarkAllAsRead = useCallback(async () => {
    if (!projectPath) return;

    // Optimistic update
    markAllAsRead();

    // Sync with server
    const api = getHttpApiClient();
    await api.notifications.markAsRead(projectPath);
  }, [projectPath, markAllAsRead]);

  const handleDismissAll = useCallback(async () => {
    if (!projectPath) return;

    // Optimistic update
    dismissAll();

    // Sync with server
    const api = getHttpApiClient();
    await api.notifications.dismiss(projectPath);
  }, [projectPath, dismissAll]);

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      // Mark as read
      handleMarkAsRead(notification.id);

      // Navigate to the relevant view based on notification type
      if (notification.featureId) {
        // Navigate to board view - feature will be selected
        navigate({ to: '/board' });
      }
    },
    [handleMarkAsRead, navigate]
  );

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'feature_waiting_approval':
        return <Bell className="h-5 w-5 text-yellow-500" />;
      case 'feature_verified':
        return <Check className="h-5 w-5 text-green-500" />;
      case 'spec_regeneration_complete':
        return <Check className="h-5 w-5 text-blue-500" />;
      case 'agent_complete':
        return <Check className="h-5 w-5 text-purple-500" />;
      default:
        return <Bell className="h-5 w-5" />;
    }
  };

  if (!projectPath) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">Select a project to view notifications</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <Spinner size="xl" />
        <p className="text-muted-foreground mt-4">Loading notifications...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col p-6 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </p>
        </div>
        {notifications.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={unreadCount === 0}
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark all as read
            </Button>
            <Button variant="outline" size="sm" onClick={handleDismissAll}>
              <Trash2 className="h-4 w-4 mr-2" />
              Dismiss all
            </Button>
          </div>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card className="flex-1">
          <CardContent className="flex flex-col items-center justify-center h-full min-h-[300px]">
            <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-lg">No notifications</p>
            <p className="text-muted-foreground text-sm mt-2">
              Notifications will appear here when features are ready for review or operations
              complete.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`transition-colors cursor-pointer hover:bg-accent/50 ${
                !notification.read ? 'border-primary/50 bg-primary/5' : ''
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <CardContent className="flex items-start gap-4 p-4">
                <div className="flex-shrink-0 mt-1">{getNotificationIcon(notification.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{notification.title}</CardTitle>
                    {!notification.read && (
                      <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                    )}
                  </div>
                  <CardDescription className="mt-1">{notification.message}</CardDescription>
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatRelativeTime(new Date(notification.createdAt))}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!notification.read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsRead(notification.id);
                      }}
                      title="Mark as read"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDismiss(notification.id);
                    }}
                    title="Dismiss"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {notification.featureId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNotificationClick(notification);
                      }}
                      title="Go to feature"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
