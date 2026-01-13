import { create } from 'zustand';
import type {
  ModelAlias,
  CursorModelId,
  CodexModelId,
  OpencodeModelId,
  PhaseModelConfig,
  PhaseModelEntry,
  ModelDefinition,
} from '@automaker/types';
import {
  getAllCursorModelIds,
  getAllCodexModelIds,
  getAllOpencodeModelIds,
  DEFAULT_PHASE_MODELS,
  DEFAULT_OPENCODE_MODEL,
} from '@automaker/types';

/**
 * Model Store - Manages all model configurations (Claude, Cursor, Codex, OpenCode)
 * Separated from main AppStore to prevent unnecessary re-renders of feature cards
 * when model settings change.
 */

export interface ModelState {
  // Enhancement & Validation
  enhancementModel: ModelAlias;
  validationModel: ModelAlias;

  // Phase Models
  phaseModels: PhaseModelConfig;
  favoriteModels: string[];

  // Cursor CLI Models
  enabledCursorModels: CursorModelId[];
  cursorDefaultModel: CursorModelId | 'auto';

  // Codex CLI Models
  enabledCodexModels: CodexModelId[];
  codexDefaultModel: CodexModelId;
  codexAutoLoadAgents: boolean;
  codexSandboxMode: 'none' | 'workspace-read' | 'workspace-write';
  codexApprovalPolicy: 'auto' | 'on-request' | 'deny';
  codexEnableWebSearch: boolean;
  codexEnableImages: boolean;
  codexModels: ModelDefinition[];
  codexModelsLoading: boolean;
  codexModelsError: string | null;
  codexModelsLastFetched: number | null;
  codexModelsLastFailedAt: number | null;

  // OpenCode CLI Models
  enabledOpencodeModels: OpencodeModelId[];
  opencodeDefaultModel: OpencodeModelId;
  dynamicOpencodeModels: ModelDefinition[];
  enabledDynamicModelIds: string[];
  cachedOpencodeProviders: Array<{ id: string; name: string }>;
}

export interface ModelActions {
  // Enhancement & Validation
  setEnhancementModel: (model: ModelAlias) => void;
  setValidationModel: (model: ModelAlias) => void;

  // Phase Models
  setPhaseModel: (phase: PhaseModelKey, entry: PhaseModelEntry) => Promise<void>;
  setPhaseModels: (models: Partial<PhaseModelConfig>) => Promise<void>;
  resetPhaseModels: () => Promise<void>;

  // Favorite Models
  toggleFavoriteModel: (modelId: string) => void;

  // Cursor Models
  setEnabledCursorModels: (models: CursorModelId[]) => void;
  setCursorDefaultModel: (model: CursorModelId | 'auto') => void;
  toggleCursorModel: (model: CursorModelId, enabled: boolean) => void;

  // Codex Models
  setEnabledCodexModels: (models: CodexModelId[]) => void;
  setCodexDefaultModel: (model: CodexModelId) => void;
  toggleCodexModel: (model: CodexModelId, enabled: boolean) => void;
  setCodexAutoLoadAgents: (enabled: boolean) => Promise<void>;
  setCodexSandboxMode: (mode: 'none' | 'workspace-read' | 'workspace-write') => Promise<void>;
  setCodexApprovalPolicy: (policy: 'auto' | 'on-request' | 'deny') => Promise<void>;
  setCodexEnableWebSearch: (enabled: boolean) => Promise<void>;
  setCodexEnableImages: (enabled: boolean) => Promise<void>;
  setCodexModels: (models: ModelDefinition[]) => void;
  setCodexModelsLoading: (loading: boolean) => void;
  setCodexModelsError: (error: string | null) => void;
  setCodexModelsLastFetched: (timestamp: number | null) => void;
  setCodexModelsLastFailedAt: (timestamp: number | null) => void;

  // OpenCode Models
  setEnabledOpencodeModels: (models: OpencodeModelId[]) => void;
  setOpencodeDefaultModel: (model: OpencodeModelId) => void;
  toggleOpencodeModel: (model: OpencodeModelId, enabled: boolean) => void;
  setDynamicOpencodeModels: (models: ModelDefinition[]) => void;
  setEnabledDynamicModelIds: (ids: string[]) => void;
  toggleDynamicModel: (modelId: string, enabled: boolean) => void;
  setCachedOpencodeProviders: (providers: Array<{ id: string; name: string }>) => void;
}

export type ModelStore = ModelState & ModelActions;

const OPENCODE_BEDROCK_PROVIDER_ID = 'amazon-bedrock';
const OPENCODE_BEDROCK_MODEL_PREFIX = `${OPENCODE_BEDROCK_PROVIDER_ID}/`;

const initialState: ModelState = {
  enhancementModel: 'sonnet',
  validationModel: 'opus',
  phaseModels: DEFAULT_PHASE_MODELS,
  favoriteModels: [],
  enabledCursorModels: getAllCursorModelIds(),
  cursorDefaultModel: 'auto',
  enabledCodexModels: getAllCodexModelIds(),
  codexDefaultModel: 'codex-gpt-5.2-codex',
  codexAutoLoadAgents: false,
  codexSandboxMode: 'workspace-write',
  codexApprovalPolicy: 'on-request',
  codexEnableWebSearch: false,
  codexEnableImages: false,
  codexModels: [],
  codexModelsLoading: false,
  codexModelsError: null,
  codexModelsLastFetched: null,
  codexModelsLastFailedAt: null,
  enabledOpencodeModels: getAllOpencodeModelIds(),
  opencodeDefaultModel: DEFAULT_OPENCODE_MODEL,
  dynamicOpencodeModels: [],
  enabledDynamicModelIds: [],
  cachedOpencodeProviders: [],
};

export const useModelStore = create<ModelStore>()((set, get) => ({
  ...initialState,

  setEnhancementModel: (model) => set({ enhancementModel: model }),

  setValidationModel: (model) => set({ validationModel: model }),

  setPhaseModel: async (phase, entry) => {
    set((state) => ({
      phaseModels: {
        ...state.phaseModels,
        [phase]: entry,
      },
    }));
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setPhaseModels: async (models) => {
    set((state) => ({
      phaseModels: {
        ...state.phaseModels,
        ...models,
      },
    }));
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  resetPhaseModels: async () => {
    set({ phaseModels: DEFAULT_PHASE_MODELS });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  toggleFavoriteModel: (modelId) => {
    const current = get().favoriteModels;
    if (current.includes(modelId)) {
      set({ favoriteModels: current.filter((id) => id !== modelId) });
    } else {
      set({ favoriteModels: [...current, modelId] });
    }
  },

  setEnabledCursorModels: (models) => set({ enabledCursorModels: models }),

  setCursorDefaultModel: (model) => set({ cursorDefaultModel: model }),

  toggleCursorModel: (model, enabled) =>
    set((state) => ({
      enabledCursorModels: enabled
        ? [...state.enabledCursorModels, model]
        : state.enabledCursorModels.filter((m) => m !== model),
    })),

  setEnabledCodexModels: (models) => set({ enabledCodexModels: models }),

  setCodexDefaultModel: (model) => set({ codexDefaultModel: model }),

  toggleCodexModel: (model, enabled) =>
    set((state) => ({
      enabledCodexModels: enabled
        ? [...state.enabledCodexModels, model]
        : state.enabledCodexModels.filter((m) => m !== model),
    })),

  setCodexAutoLoadAgents: async (enabled) => {
    set({ codexAutoLoadAgents: enabled });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setCodexSandboxMode: async (mode) => {
    set({ codexSandboxMode: mode });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setCodexApprovalPolicy: async (policy) => {
    set({ codexApprovalPolicy: policy });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setCodexEnableWebSearch: async (enabled) => {
    set({ codexEnableWebSearch: enabled });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setCodexEnableImages: async (enabled) => {
    set({ codexEnableImages: enabled });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setCodexModels: (models) => set({ codexModels: models }),

  setCodexModelsLoading: (loading) => set({ codexModelsLoading: loading }),

  setCodexModelsError: (error) => set({ codexModelsError: error }),

  setCodexModelsLastFetched: (timestamp) => set({ codexModelsLastFetched: timestamp }),

  setCodexModelsLastFailedAt: (timestamp) => set({ codexModelsLastFailedAt: timestamp }),

  setEnabledOpencodeModels: (models) => set({ enabledOpencodeModels: models }),

  setOpencodeDefaultModel: (model) => set({ opencodeDefaultModel: model }),

  toggleOpencodeModel: (model, enabled) =>
    set((state) => ({
      enabledOpencodeModels: enabled
        ? [...state.enabledOpencodeModels, model]
        : state.enabledOpencodeModels.filter((m) => m !== model),
    })),

  setDynamicOpencodeModels: (models) => {
    const filteredModels = models.filter(
      (model) =>
        model.provider !== OPENCODE_BEDROCK_PROVIDER_ID &&
        !model.id.startsWith(OPENCODE_BEDROCK_MODEL_PREFIX)
    );
    const currentEnabled = get().enabledDynamicModelIds;
    const newModelIds = filteredModels.map((m) => m.id);
    const filteredEnabled = currentEnabled.filter((modelId) => newModelIds.includes(modelId));

    const nextEnabled = currentEnabled.length === 0 ? [] : filteredEnabled;
    set({ dynamicOpencodeModels: filteredModels, enabledDynamicModelIds: nextEnabled });
  },

  setEnabledDynamicModelIds: (ids) => set({ enabledDynamicModelIds: ids }),

  toggleDynamicModel: (modelId, enabled) =>
    set((state) => ({
      enabledDynamicModelIds: enabled
        ? [...state.enabledDynamicModelIds, modelId]
        : state.enabledDynamicModelIds.filter((id) => id !== modelId),
    })),

  setCachedOpencodeProviders: (providers) =>
    set({
      cachedOpencodeProviders: providers.filter(
        (provider) => provider.id !== OPENCODE_BEDROCK_PROVIDER_ID
      ),
    }),
}));

// Type for phase model key (helper for type safety)
export type PhaseModelKey = keyof PhaseModelConfig;
