import { create } from 'zustand';

/**
 * Board Settings Store - Manages board display settings per-project
 * Separated from main AppStore to prevent unnecessary re-renders of feature cards
 * when visual settings (background, opacity, etc.) change.
 */

export interface BoardBackground {
  imagePath: string | null;
  cardOpacity: number;
  columnOpacity: number;
  columnBorderEnabled: boolean;
  cardGlassmorphism: boolean;
  cardBorderEnabled: boolean;
  cardBorderOpacity: number;
  hideScrollbar: boolean;
  imageVersion?: number; // Cache buster for image changes
}

export interface BoardSettingsState {
  boardBackgroundByProject: Record<string, BoardBackground>;
}

export interface BoardSettingsActions {
  // Board Background
  setBoardBackground: (projectPath: string, imagePath: string | null) => void;
  setCardOpacity: (projectPath: string, opacity: number) => void;
  setColumnOpacity: (projectPath: string, opacity: number) => void;
  setColumnBorderEnabled: (projectPath: string, enabled: boolean) => void;
  setCardGlassmorphism: (projectPath: string, enabled: boolean) => void;
  setCardBorderEnabled: (projectPath: string, enabled: boolean) => void;
  setCardBorderOpacity: (projectPath: string, opacity: number) => void;
  setHideScrollbar: (projectPath: string, hide: boolean) => void;
  clearBoardBackground: (projectPath: string) => void;
  getBoardBackground: (projectPath: string) => BoardBackground;
}

export type BoardSettingsStore = BoardSettingsState & BoardSettingsActions;

const defaultBackgroundSettings: BoardBackground = {
  imagePath: null,
  cardOpacity: 100,
  columnOpacity: 100,
  columnBorderEnabled: true,
  cardGlassmorphism: true,
  cardBorderEnabled: true,
  cardBorderOpacity: 100,
  hideScrollbar: false,
};

const initialState: BoardSettingsState = {
  boardBackgroundByProject: {},
};

export const useBoardSettingsStore = create<BoardSettingsStore>()((set, get) => ({
  ...initialState,

  setBoardBackground: (projectPath, imagePath) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || {
      ...defaultBackgroundSettings,
    };
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: {
          ...existing,
          imagePath,
          // Update imageVersion timestamp to bust browser cache when image changes
          imageVersion: imagePath ? Date.now() : undefined,
        },
      },
    });
  },

  setCardOpacity: (projectPath, opacity) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: {
          ...existing,
          cardOpacity: opacity,
        },
      },
    });
  },

  setColumnOpacity: (projectPath, opacity) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: {
          ...existing,
          columnOpacity: opacity,
        },
      },
    });
  },

  setColumnBorderEnabled: (projectPath, enabled) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: {
          ...existing,
          columnBorderEnabled: enabled,
        },
      },
    });
  },

  setCardGlassmorphism: (projectPath, enabled) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: {
          ...existing,
          cardGlassmorphism: enabled,
        },
      },
    });
  },

  setCardBorderEnabled: (projectPath, enabled) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: {
          ...existing,
          cardBorderEnabled: enabled,
        },
      },
    });
  },

  setCardBorderOpacity: (projectPath, opacity) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: {
          ...existing,
          cardBorderOpacity: opacity,
        },
      },
    });
  },

  setHideScrollbar: (projectPath, hide) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: {
          ...existing,
          hideScrollbar: hide,
        },
      },
    });
  },

  clearBoardBackground: (projectPath) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: {
          ...existing,
          imagePath: null,
          imageVersion: undefined,
        },
      },
    });
  },

  getBoardBackground: (projectPath) => {
    const settings = get().boardBackgroundByProject[projectPath];
    return settings || defaultBackgroundSettings;
  },
}));
