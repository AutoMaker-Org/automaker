/**
 * Hook to subscribe to notification WebSocket events and update the store.
 */

import { useEffect } from 'react';
import { useNotificationsStore } from '@/store/notifications-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { pathsEqual } from '@/lib/utils';
import type { Notification } from '@automaker/types';

/**
 * Hook to subscribe to notification events and update the store.
 * Should be used in a component that's always mounted when a project is open.
 */
export function useNotificationEvents(projectPath: string | null) {
  const addNotification = useNotificationsStore((s) => s.addNotification);

  useEffect(() => {
    if (!projectPath) return;

    const api = getHttpApiClient();

    const unsubscribe = api.notifications.onNotificationCreated((notification: Notification) => {
      // Only handle notifications for the current project
      if (!pathsEqual(notification.projectPath, projectPath)) return;

      addNotification(notification);
    });

    return unsubscribe;
  }, [projectPath, addNotification]);
}

/**
 * Hook to load notifications for a project.
 * Should be called when switching projects or on initial load.
 */
export function useLoadNotifications(projectPath: string | null) {
  const setNotifications = useNotificationsStore((s) => s.setNotifications);
  const setUnreadCount = useNotificationsStore((s) => s.setUnreadCount);
  const setLoading = useNotificationsStore((s) => s.setLoading);
  const setError = useNotificationsStore((s) => s.setError);
  const reset = useNotificationsStore((s) => s.reset);

  useEffect(() => {
    if (!projectPath) {
      reset();
      return;
    }

    const loadNotifications = async () => {
      setLoading(true);
      setError(null);

      try {
        const api = getHttpApiClient();
        const [listResult, countResult] = await Promise.all([
          api.notifications.list(projectPath),
          api.notifications.getUnreadCount(projectPath),
        ]);

        if (listResult.success && listResult.notifications) {
          setNotifications(listResult.notifications);
        }

        if (countResult.success && countResult.count !== undefined) {
          setUnreadCount(countResult.count);
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to load notifications');
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();
  }, [projectPath, setNotifications, setUnreadCount, setLoading, setError, reset]);
}
