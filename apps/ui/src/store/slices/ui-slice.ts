import type { StateCreator } from 'zustand';
import { UI_SANS_FONT_OPTIONS, UI_MONO_FONT_OPTIONS } from '@/config/ui-font-options';
import type { SidebarStyle } from '@automaker/types';
import type {
  ViewMode,
  ThemeMode,
  BoardViewMode,
  KeyboardShortcuts,
  BackgroundSettings,
  UISliceState,
  UISliceActions,
} from '../types/ui-types';
import type { AppState, AppActions } from '../types/state-types';
import {
  getStoredTheme,
  getStoredFontSans,
  getStoredFontMono,
  DEFAULT_KEYBOARD_SHORTCUTS,
} from '../utils';
import { defaultBackgroundSettings } from '../defaults';
import {
  getEffectiveFont,
  saveThemeToStorage,
  saveFontSansToStorage,
  saveFontMonoToStorage,
} from '../utils/theme-utils';

/**
 * UI Slice
 * Contains all UI-related state and actions extracted from the main app store.
 * This is the first slice pattern implementation in the codebase.
 */
export type UISlice = UISliceState & UISliceActions;

/**
 * Initial UI state values
 */
export const initialUIState: UISliceState = {
  // Core UI State
  currentView: 'welcome',
  sidebarOpen: true,
  sidebarStyle: 'unified',
  collapsedNavSections: {},
  mobileSidebarHidden: false,

  // Theme State
  theme: getStoredTheme() || 'dark',
  previewTheme: null,

  // Font State
  fontFamilySans: getStoredFontSans(),
  fontFamilyMono: getStoredFontMono(),

  // Board UI State
  boardViewMode: 'kanban',
  boardBackgroundByProject: {},

  // Settings UI State
  keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS,
  muteDoneSound: false,
  disableSplashScreen: false,
  showQueryDevtools: true,
  chatHistoryOpen: false,

  // Panel Visibility State
  worktreePanelCollapsed: false,
  worktreePanelVisibleByProject: {},
  showInitScriptIndicatorByProject: {},
  autoDismissInitScriptIndicatorByProject: {},

  // File Picker UI State
  lastProjectDir: '',
  recentFolders: [],
};

/**
 * Creates the UI slice for the Zustand store.
 *
 * Uses the StateCreator pattern to allow the slice to access other parts
 * of the combined store state (e.g., currentProject for theme resolution).
 */
export const createUISlice: StateCreator<AppState & AppActions, [], [], UISlice> = (set, get) => ({
  // Spread initial state
  ...initialUIState,

  // ============================================================================
  // View Actions
  // ============================================================================

  setCurrentView: (view: ViewMode) => set({ currentView: view }),

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),

  setSidebarStyle: (style: SidebarStyle) => set({ sidebarStyle: style }),

  setCollapsedNavSections: (sections: Record<string, boolean>) =>
    set({ collapsedNavSections: sections }),

  toggleNavSection: (sectionLabel: string) =>
    set((state) => ({
      collapsedNavSections: {
        ...state.collapsedNavSections,
        [sectionLabel]: !state.collapsedNavSections[sectionLabel],
      },
    })),

  toggleMobileSidebarHidden: () =>
    set((state) => ({ mobileSidebarHidden: !state.mobileSidebarHidden })),

  setMobileSidebarHidden: (hidden: boolean) => set({ mobileSidebarHidden: hidden }),

  // ============================================================================
  // Theme Actions
  // ============================================================================

  setTheme: (theme: ThemeMode) => {
    set({ theme });
    saveThemeToStorage(theme);
  },

  getEffectiveTheme: (): ThemeMode => {
    const state = get();
    // If there's a preview theme, use it (for hover preview)
    if (state.previewTheme) return state.previewTheme;
    // Otherwise, use project theme if set, or fall back to global theme
    const projectTheme = state.currentProject?.theme as ThemeMode | undefined;
    return projectTheme ?? state.theme;
  },

  setPreviewTheme: (theme: ThemeMode | null) => set({ previewTheme: theme }),

  // ============================================================================
  // Font Actions
  // ============================================================================

  setFontSans: (fontFamily: string | null) => {
    set({ fontFamilySans: fontFamily });
    saveFontSansToStorage(fontFamily);
  },

  setFontMono: (fontFamily: string | null) => {
    set({ fontFamilyMono: fontFamily });
    saveFontMonoToStorage(fontFamily);
  },

  getEffectiveFontSans: (): string | null => {
    const state = get();
    const projectFont = state.currentProject?.fontFamilySans;
    return getEffectiveFont(projectFont, state.fontFamilySans, UI_SANS_FONT_OPTIONS);
  },

  getEffectiveFontMono: (): string | null => {
    const state = get();
    const projectFont = state.currentProject?.fontFamilyMono;
    return getEffectiveFont(projectFont, state.fontFamilyMono, UI_MONO_FONT_OPTIONS);
  },

  // ============================================================================
  // Board View Actions
  // ============================================================================

  setBoardViewMode: (mode: BoardViewMode) => set({ boardViewMode: mode }),

  setBoardBackground: (projectPath: string, imagePath: string | null) =>
    set((state) => ({
      boardBackgroundByProject: {
        ...state.boardBackgroundByProject,
        [projectPath]: {
          ...(state.boardBackgroundByProject[projectPath] ?? defaultBackgroundSettings),
          imagePath,
          imageVersion: Date.now(), // Bust cache on image change
        },
      },
    })),

  setCardOpacity: (projectPath: string, opacity: number) =>
    set((state) => ({
      boardBackgroundByProject: {
        ...state.boardBackgroundByProject,
        [projectPath]: {
          ...(state.boardBackgroundByProject[projectPath] ?? defaultBackgroundSettings),
          cardOpacity: opacity,
        },
      },
    })),

  setColumnOpacity: (projectPath: string, opacity: number) =>
    set((state) => ({
      boardBackgroundByProject: {
        ...state.boardBackgroundByProject,
        [projectPath]: {
          ...(state.boardBackgroundByProject[projectPath] ?? defaultBackgroundSettings),
          columnOpacity: opacity,
        },
      },
    })),

  setColumnBorderEnabled: (projectPath: string, enabled: boolean) =>
    set((state) => ({
      boardBackgroundByProject: {
        ...state.boardBackgroundByProject,
        [projectPath]: {
          ...(state.boardBackgroundByProject[projectPath] ?? defaultBackgroundSettings),
          columnBorderEnabled: enabled,
        },
      },
    })),

  setCardGlassmorphism: (projectPath: string, enabled: boolean) =>
    set((state) => ({
      boardBackgroundByProject: {
        ...state.boardBackgroundByProject,
        [projectPath]: {
          ...(state.boardBackgroundByProject[projectPath] ?? defaultBackgroundSettings),
          cardGlassmorphism: enabled,
        },
      },
    })),

  setCardBorderEnabled: (projectPath: string, enabled: boolean) =>
    set((state) => ({
      boardBackgroundByProject: {
        ...state.boardBackgroundByProject,
        [projectPath]: {
          ...(state.boardBackgroundByProject[projectPath] ?? defaultBackgroundSettings),
          cardBorderEnabled: enabled,
        },
      },
    })),

  setCardBorderOpacity: (projectPath: string, opacity: number) =>
    set((state) => ({
      boardBackgroundByProject: {
        ...state.boardBackgroundByProject,
        [projectPath]: {
          ...(state.boardBackgroundByProject[projectPath] ?? defaultBackgroundSettings),
          cardBorderOpacity: opacity,
        },
      },
    })),

  setHideScrollbar: (projectPath: string, hide: boolean) =>
    set((state) => ({
      boardBackgroundByProject: {
        ...state.boardBackgroundByProject,
        [projectPath]: {
          ...(state.boardBackgroundByProject[projectPath] ?? defaultBackgroundSettings),
          hideScrollbar: hide,
        },
      },
    })),

  getBoardBackground: (projectPath: string): BackgroundSettings =>
    get().boardBackgroundByProject[projectPath] ?? defaultBackgroundSettings,

  clearBoardBackground: (projectPath: string) =>
    set((state) => {
      const newBackgrounds = { ...state.boardBackgroundByProject };
      delete newBackgrounds[projectPath];
      return { boardBackgroundByProject: newBackgrounds };
    }),

  // ============================================================================
  // Settings UI Actions
  // ============================================================================

  setKeyboardShortcut: (key: keyof KeyboardShortcuts, value: string) =>
    set((state) => ({
      keyboardShortcuts: { ...state.keyboardShortcuts, [key]: value },
    })),

  setKeyboardShortcuts: (shortcuts: Partial<KeyboardShortcuts>) =>
    set((state) => ({
      keyboardShortcuts: { ...state.keyboardShortcuts, ...shortcuts },
    })),

  resetKeyboardShortcuts: () => set({ keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS }),

  setMuteDoneSound: (muted: boolean) => set({ muteDoneSound: muted }),

  setDisableSplashScreen: (disabled: boolean) => set({ disableSplashScreen: disabled }),

  setShowQueryDevtools: (show: boolean) => set({ showQueryDevtools: show }),

  setChatHistoryOpen: (open: boolean) => set({ chatHistoryOpen: open }),

  toggleChatHistory: () => set((state) => ({ chatHistoryOpen: !state.chatHistoryOpen })),

  // ============================================================================
  // Panel Visibility Actions
  // ============================================================================

  setWorktreePanelCollapsed: (collapsed: boolean) => set({ worktreePanelCollapsed: collapsed }),

  setWorktreePanelVisible: (projectPath: string, visible: boolean) =>
    set((state) => ({
      worktreePanelVisibleByProject: {
        ...state.worktreePanelVisibleByProject,
        [projectPath]: visible,
      },
    })),

  getWorktreePanelVisible: (projectPath: string): boolean =>
    get().worktreePanelVisibleByProject[projectPath] ?? true,

  setShowInitScriptIndicator: (projectPath: string, visible: boolean) =>
    set((state) => ({
      showInitScriptIndicatorByProject: {
        ...state.showInitScriptIndicatorByProject,
        [projectPath]: visible,
      },
    })),

  getShowInitScriptIndicator: (projectPath: string): boolean =>
    get().showInitScriptIndicatorByProject[projectPath] ?? true,

  setAutoDismissInitScriptIndicator: (projectPath: string, autoDismiss: boolean) =>
    set((state) => ({
      autoDismissInitScriptIndicatorByProject: {
        ...state.autoDismissInitScriptIndicatorByProject,
        [projectPath]: autoDismiss,
      },
    })),

  getAutoDismissInitScriptIndicator: (projectPath: string): boolean =>
    get().autoDismissInitScriptIndicatorByProject[projectPath] ?? true,

  // ============================================================================
  // File Picker UI Actions
  // ============================================================================

  setLastProjectDir: (dir: string) => set({ lastProjectDir: dir }),

  setRecentFolders: (folders: string[]) => set({ recentFolders: folders }),

  addRecentFolder: (folder: string) =>
    set((state) => {
      const filtered = state.recentFolders.filter((f) => f !== folder);
      return { recentFolders: [folder, ...filtered].slice(0, 10) };
    }),
});
