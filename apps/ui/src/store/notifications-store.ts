/**
 * Notifications Store - State management for project-level notifications
 */

import { create } from 'zustand';
import type { Notification } from '@automaker/types';

// ============================================================================
// State Interface
// ============================================================================

interface NotificationsState {
  // Notifications for the current project
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;

  // Popover state
  isPopoverOpen: boolean;
}

// ============================================================================
// Actions Interface
// ============================================================================

interface NotificationsActions {
  // Data management
  setNotifications: (notifications: Notification[]) => void;
  setUnreadCount: (count: number) => void;
  addNotification: (notification: Notification) => void;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  dismissNotification: (notificationId: string) => void;
  dismissAll: () => void;

  // Loading state
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Popover state
  setPopoverOpen: (open: boolean) => void;

  // Reset
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: NotificationsState = {
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  isPopoverOpen: false,
};

// ============================================================================
// Store
// ============================================================================

export const useNotificationsStore = create<NotificationsState & NotificationsActions>(
  (set, get) => ({
    ...initialState,

    // Data management
    setNotifications: (notifications) =>
      set({
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      }),

    setUnreadCount: (count) => set({ unreadCount: count }),

    addNotification: (notification) =>
      set((state) => ({
        notifications: [notification, ...state.notifications],
        unreadCount: notification.read ? state.unreadCount : state.unreadCount + 1,
      })),

    markAsRead: (notificationId) =>
      set((state) => {
        const notification = state.notifications.find((n) => n.id === notificationId);
        if (!notification || notification.read) return state;

        return {
          notifications: state.notifications.map((n) =>
            n.id === notificationId ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, state.unreadCount - 1),
        };
      }),

    markAllAsRead: () =>
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      })),

    dismissNotification: (notificationId) =>
      set((state) => {
        const notification = state.notifications.find((n) => n.id === notificationId);
        if (!notification) return state;

        return {
          notifications: state.notifications.filter((n) => n.id !== notificationId),
          unreadCount: notification.read ? state.unreadCount : Math.max(0, state.unreadCount - 1),
        };
      }),

    dismissAll: () =>
      set({
        notifications: [],
        unreadCount: 0,
      }),

    // Loading state
    setLoading: (loading) => set({ isLoading: loading }),
    setError: (error) => set({ error }),

    // Popover state
    setPopoverOpen: (open) => set({ isPopoverOpen: open }),

    // Reset
    reset: () => set(initialState),
  })
);
