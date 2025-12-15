"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  rectIntersection,
  pointerWithin,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  useAppStore,
  Feature,
  FeatureImage,
  FeatureImagePath,
  AgentModel,
  ThinkingLevel,
  AIProfile,
  defaultBackgroundSettings,
} from "@/store/app-store";
import { getElectronAPI } from "@/lib/electron";
import { cn, modelSupportsThinking } from "@/lib/utils";
import type { SpecRegenerationEvent } from "@/types/electron";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CategoryAutocomplete } from "@/components/ui/category-autocomplete";
import { FeatureImageUpload } from "@/components/ui/feature-image-upload";
import {
  DescriptionImageDropZone,
  FeatureImagePath as DescriptionImagePath,
  ImagePreviewMap,
} from "@/components/ui/description-image-dropzone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { AgentOutputModal } from "./agent-output-modal";
import { FeatureSuggestionsDialog } from "./feature-suggestions-dialog";
import { BoardBackgroundModal } from "@/components/dialogs/board-background-modal";
import {
  Plus,
  RefreshCw,
  Play,
  StopCircle,
  Loader2,
  Users,
  Trash2,
  FastForward,
  FlaskConical,
  CheckCircle2,
  MessageSquare,
  GitCommit,
  Brain,
  Zap,
  Settings2,
  Scale,
  Cpu,
  Rocket,
  Sparkles,
  UserCircle,
  Lightbulb,
  Search,
  X,
  Minimize2,
  Square,
  Maximize2,
  Shuffle,
  ImageIcon,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { useAutoMode } from "@/hooks/use-auto-mode";
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  KeyboardShortcut,
} from "@/hooks/use-keyboard-shortcuts";
import { useWindowState } from "@/hooks/use-window-state";

type ColumnId = Feature["status"];

const COLUMNS: { id: ColumnId; title: string; colorClass: string }[] = [
  { id: "backlog", title: "Backlog", colorClass: "bg-[var(--status-backlog)]" },
  {
    id: "in_progress",
    title: "In Progress",
    colorClass: "bg-[var(--status-in-progress)]",
  },
  {
    id: "waiting_approval",
    title: "Waiting Approval",
    colorClass: "bg-[var(--status-waiting)]",
  },
  {
    id: "verified",
    title: "Verified",
    colorClass: "bg-[var(--status-success)]",
  },
];

type ModelOption = {
  id: AgentModel;
  label: string;
  description: string;
  badge?: string;
  provider: "claude";
};

const CLAUDE_MODELS: ModelOption[] = [
  {
    id: "haiku",
    label: "Claude Haiku",
    description: "Fast and efficient for simple tasks.",
    badge: "Speed",
    provider: "claude",
  },
  {
    id: "sonnet",
    label: "Claude Sonnet",
    description: "Balanced performance with strong reasoning.",
    badge: "Balanced",
    provider: "claude",
  },
  {
    id: "opus",
    label: "Claude Opus",
    description: "Most capable model for complex work.",
    badge: "Premium",
    provider: "claude",
  },
];

// Profile icon mapping
const PROFILE_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Brain,
  Zap,
  Scale,
  Cpu,
  Rocket,
  Sparkles,
};

export function BoardView() {
  const {
    currentProject,
    features,
    setFeatures,
    addFeature,
    updateFeature,
    removeFeature,
    moveFeature,
    maxConcurrency,
    setMaxConcurrency,
    defaultSkipTests,
    useWorktrees,
    showProfilesOnly,
    aiProfiles,
    kanbanCardDetailLevel,
    setKanbanCardDetailLevel,
    boardBackgroundByProject,
    specCreatingForProject,
    setSpecCreatingForProject,
  } = useAppStore();
  const shortcuts = useKeyboardShortcutsConfig();
  const [activeFeature, setActiveFeature] = useState<Feature | null>(null);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newFeature, setNewFeature] = useState({
    category: "",
    description: "",
    steps: [""],
    images: [] as FeatureImage[],
    imagePaths: [] as DescriptionImagePath[],
    skipTests: false,
    model: "opus" as AgentModel,
    thinkingLevel: "none" as ThinkingLevel,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [outputFeature, setOutputFeature] = useState<Feature | null>(null);
  const [featuresWithContext, setFeaturesWithContext] = useState<Set<string>>(
    new Set()
  );
  const [showDeleteAllVerifiedDialog, setShowDeleteAllVerifiedDialog] =
    useState(false);
  const [showBoardBackgroundModal, setShowBoardBackgroundModal] =
    useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [deleteCompletedFeature, setDeleteCompletedFeature] =
    useState<Feature | null>(null);
  const [persistedCategories, setPersistedCategories] = useState<string[]>([]);
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [followUpFeature, setFollowUpFeature] = useState<Feature | null>(null);
  const [followUpPrompt, setFollowUpPrompt] = useState("");
  const [followUpImagePaths, setFollowUpImagePaths] = useState<
    DescriptionImagePath[]
  >([]);
  // Preview maps to persist image previews across tab switches
  const [newFeaturePreviewMap, setNewFeaturePreviewMap] =
    useState<ImagePreviewMap>(() => new Map());
  const [followUpPreviewMap, setFollowUpPreviewMap] = useState<ImagePreviewMap>(
    () => new Map()
  );
  const [editFeaturePreviewMap, setEditFeaturePreviewMap] =
    useState<ImagePreviewMap>(() => new Map());
  // Local state to temporarily show advanced options when profiles-only mode is enabled
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showEditAdvancedOptions, setShowEditAdvancedOptions] = useState(false);
  const [showSuggestionsDialog, setShowSuggestionsDialog] = useState(false);
  const [suggestionsCount, setSuggestionsCount] = useState(0);
  const [featureSuggestions, setFeatureSuggestions] = useState<
    import("@/lib/electron").FeatureSuggestion[]
  >([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  // Search filter for Kanban cards
  const [searchQuery, setSearchQuery] = useState("");
  // Validation state for add feature form
  const [descriptionError, setDescriptionError] = useState(false);
  // Derive spec creation state from store - check if current project is the one being created
  const isCreatingSpec = specCreatingForProject === currentProject?.path;
  const creatingSpecProjectPath = specCreatingForProject;

  // Make current project available globally for modal
  useEffect(() => {
    if (currentProject) {
      (window as any).__currentProject = currentProject;
    }
    return () => {
      (window as any).__currentProject = null;
    };
  }, [currentProject]);

  // Listen for suggestions events to update count (persists even when dialog is closed)
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.suggestions) return;

    const unsubscribe = api.suggestions.onEvent((event) => {
      if (event.type === "suggestions_complete" && event.suggestions) {
        setSuggestionsCount(event.suggestions.length);
        setFeatureSuggestions(event.suggestions);
        setIsGeneratingSuggestions(false);
      } else if (event.type === "suggestions_error") {
        setIsGeneratingSuggestions(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Subscribe to spec regeneration events to clear creating state on completion
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.specRegeneration) return;

    const unsubscribe = api.specRegeneration.onEvent((event) => {
      console.log(
        "[BoardView] Spec regeneration event:",
        event.type,
        "for project:",
        event.projectPath
      );

      // Only handle completion/error events for the project being created
      // The creating state is set by sidebar when user initiates the action
      if (event.projectPath !== specCreatingForProject) {
        return;
      }

      if (event.type === "spec_regeneration_complete") {
        setSpecCreatingForProject(null);
      } else if (event.type === "spec_regeneration_error") {
        setSpecCreatingForProject(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [specCreatingForProject, setSpecCreatingForProject]);

  // Track previous project to detect switches
  const prevProjectPathRef = useRef<string | null>(null);
  const isSwitchingProjectRef = useRef<boolean>(false);
  // Track if this is the initial load (to avoid showing loading spinner on subsequent reloads)
  const isInitialLoadRef = useRef<boolean>(true);

  // Auto mode hook
  const autoMode = useAutoMode();
  // Get runningTasks from the hook (scoped to current project)
  const runningAutoTasks = autoMode.runningTasks;

  // Window state hook for compact dialog mode
  const { isMaximized } = useWindowState();

  // Get in-progress features for keyboard shortcuts (memoized for shortcuts)
  const inProgressFeaturesForShortcuts = useMemo(() => {
    return features.filter((f) => {
      const isRunning = runningAutoTasks.includes(f.id);
      return isRunning || f.status === "in_progress";
    });
  }, [features, runningAutoTasks]);

  // Ref to hold the start next callback (to avoid dependency issues)
  const startNextFeaturesRef = useRef<() => void>(() => {});

  // Ref for search input to enable keyboard shortcut focus
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts for this view
  const boardShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcutsList: KeyboardShortcut[] = [
      {
        key: shortcuts.addFeature,
        action: () => setShowAddDialog(true),
        description: "Add new feature",
      },
      {
        key: shortcuts.startNext,
        action: () => startNextFeaturesRef.current(),
        description: "Start next features from backlog",
      },
      {
        key: "/",
        action: () => searchInputRef.current?.focus(),
        description: "Focus search input",
      },
    ];

    // Add shortcuts for in-progress cards (1-9 and 0 for 10th)
    inProgressFeaturesForShortcuts.slice(0, 10).forEach((feature, index) => {
      // Keys 1-9 for first 9 cards, 0 for 10th card
      const key = index === 9 ? "0" : String(index + 1);
      shortcutsList.push({
        key,
        action: () => {
          setOutputFeature(feature);
          setShowOutputModal(true);
        },
        description: `View output for in-progress card ${index + 1}`,
      });
    });

    return shortcutsList;
  }, [inProgressFeaturesForShortcuts, shortcuts]);
  useKeyboardShortcuts(boardShortcuts);

  // Prevent hydration issues
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Get unique categories from existing features AND persisted categories for autocomplete suggestions
  const categorySuggestions = useMemo(() => {
    const featureCategories = features.map((f) => f.category).filter(Boolean);
    // Merge feature categories with persisted categories
    const allCategories = [...featureCategories, ...persistedCategories];
    return [...new Set(allCategories)].sort();
  }, [features, persistedCategories]);

  // Custom collision detection that prioritizes columns over cards
  const collisionDetectionStrategy = useCallback((args: any) => {
    // First, check if pointer is within a column
    const pointerCollisions = pointerWithin(args);
    const columnCollisions = pointerCollisions.filter((collision: any) =>
      COLUMNS.some((col) => col.id === collision.id)
    );

    // If we found a column collision, use that
    if (columnCollisions.length > 0) {
      return columnCollisions;
    }

    // Otherwise, use rectangle intersection for cards
    return rectIntersection(args);
  }, []);

  // Load features using features API
  // IMPORTANT: Do NOT add 'features' to dependency array - it would cause infinite reload loop
  const loadFeatures = useCallback(async () => {
    if (!currentProject) return;

    const currentPath = currentProject.path;
    const previousPath = prevProjectPathRef.current;
    const isProjectSwitch =
      previousPath !== null && currentPath !== previousPath;

    // Get cached features from store (without adding to dependencies)
    const cachedFeatures = useAppStore.getState().features;

    // If project switched, mark it but don't clear features yet
    // We'll clear after successful API load to prevent data loss
    if (isProjectSwitch) {
      console.log(
        `[BoardView] Project switch detected: ${previousPath} -> ${currentPath}`
      );
      isSwitchingProjectRef.current = true;
      isInitialLoadRef.current = true;
    }

    // Update the ref to track current project
    prevProjectPathRef.current = currentPath;

    // Only show loading spinner on initial load to prevent board flash during reloads
    if (isInitialLoadRef.current) {
      setIsLoading(true);
    }

    try {
      const api = getElectronAPI();
      if (!api.features) {
        console.error("[BoardView] Features API not available");
        // Keep cached features if API is unavailable
        return;
      }

      const result = await api.features.getAll(currentProject.path);

      if (result.success && result.features) {
        const featuresWithIds = result.features.map(
          (f: any, index: number) => ({
            ...f,
            id: f.id || `feature-${index}-${Date.now()}`,
            status: f.status || "backlog",
            startedAt: f.startedAt, // Preserve startedAt timestamp
            // Ensure model and thinkingLevel are set for backward compatibility
            model: f.model || "opus",
            thinkingLevel: f.thinkingLevel || "none",
          })
        );
        // Successfully loaded features - now safe to set them
        setFeatures(featuresWithIds);

        // Only clear categories on project switch AFTER successful load
        if (isProjectSwitch) {
          setPersistedCategories([]);
        }
      } else if (!result.success && result.error) {
        console.error("[BoardView] API returned error:", result.error);
        // If it's a new project or the error indicates no features found,
        // that's expected - start with empty array
        if (isProjectSwitch) {
          setFeatures([]);
          setPersistedCategories([]);
        }
        // Otherwise keep cached features
      }
    } catch (error) {
      console.error("Failed to load features:", error);
      // On error, keep existing cached features for the current project
      // Only clear on project switch if we have no features from server
      if (isProjectSwitch && cachedFeatures.length === 0) {
        setFeatures([]);
        setPersistedCategories([]);
      }
    } finally {
      setIsLoading(false);
      isInitialLoadRef.current = false;
      isSwitchingProjectRef.current = false;
    }
  }, [currentProject, setFeatures]);

  // Subscribe to spec regeneration complete events to refresh kanban board
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.specRegeneration) return;

    const unsubscribe = api.specRegeneration.onEvent((event) => {
      // Refresh the kanban board when spec regeneration completes for the current project
      if (
        event.type === "spec_regeneration_complete" &&
        currentProject &&
        event.projectPath === currentProject.path
      ) {
        console.log(
          "[BoardView] Spec regeneration complete, refreshing features"
        );
        loadFeatures();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentProject, loadFeatures]);

  // Load persisted categories from file
  const loadCategories = useCallback(async () => {
    if (!currentProject) return;

    try {
      const api = getElectronAPI();
      const result = await api.readFile(
        `${currentProject.path}/.automaker/categories.json`
      );

      if (result.success && result.content) {
        const parsed = JSON.parse(result.content);
        if (Array.isArray(parsed)) {
          setPersistedCategories(parsed);
        }
      } else {
        // File doesn't exist, ensure categories are cleared
        setPersistedCategories([]);
      }
    } catch (error) {
      console.error("Failed to load categories:", error);
      // If file doesn't exist, ensure categories are cleared
      setPersistedCategories([]);
    }
  }, [currentProject]);

  // Save a new category to the persisted categories file
  const saveCategory = useCallback(
    async (category: string) => {
      if (!currentProject || !category.trim()) return;

      try {
        const api = getElectronAPI();

        // Read existing categories
        let categories: string[] = [...persistedCategories];

        // Add new category if it doesn't exist
        if (!categories.includes(category)) {
          categories.push(category);
          categories.sort(); // Keep sorted

          // Write back to file
          await api.writeFile(
            `${currentProject.path}/.automaker/categories.json`,
            JSON.stringify(categories, null, 2)
          );

          // Update state
          setPersistedCategories(categories);
        }
      } catch (error) {
        console.error("Failed to save category:", error);
      }
    },
    [currentProject, persistedCategories]
  );

  // Sync skipTests default when dialog opens
  useEffect(() => {
    if (showAddDialog) {
      setNewFeature((prev) => ({
        ...prev,
        skipTests: defaultSkipTests,
      }));
    }
  }, [showAddDialog, defaultSkipTests]);

  // Listen for auto mode feature completion and errors to reload features
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.autoMode || !currentProject) return;

    const { removeRunningTask } = useAppStore.getState();
    const projectId = currentProject.id;

    const unsubscribe = api.autoMode.onEvent((event) => {
      // Use event's projectPath or projectId if available, otherwise use current project
      // Board view only reacts to events for the currently selected project
      const eventProjectId =
        ("projectId" in event && event.projectId) || projectId;

      if (event.type === "auto_mode_feature_complete") {
        // Reload features when a feature is completed
        console.log("[Board] Feature completed, reloading features...");
        loadFeatures();
        // Play ding sound when feature is done (unless muted)
        const { muteDoneSound } = useAppStore.getState();
        if (!muteDoneSound) {
          const audio = new Audio("/sounds/ding.mp3");
          audio
            .play()
            .catch((err) => console.warn("Could not play ding sound:", err));
        }
      } else if (event.type === "auto_mode_error") {
        // Reload features when an error occurs (feature moved to waiting_approval)
        console.log(
          "[Board] Feature error, reloading features...",
          event.error
        );

        // Remove from running tasks so it moves to the correct column
        if (event.featureId) {
          removeRunningTask(eventProjectId, event.featureId);
        }

        loadFeatures();

        // Check for authentication errors and show a more helpful message
        const isAuthError =
          event.errorType === "authentication" ||
          (event.error &&
            (event.error.includes("Authentication failed") ||
              event.error.includes("Invalid API key")));

        if (isAuthError) {
          toast.error("Authentication Failed", {
            description:
              "Your API key is invalid or expired. Please check Settings or run 'claude login' in terminal.",
            duration: 10000,
          });
        } else {
          toast.error("Agent encountered an error", {
            description: event.error || "Check the logs for details",
          });
        }
      }
    });

    return unsubscribe;
  }, [loadFeatures, currentProject]);

  useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  // Load persisted categories on mount
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Sync running tasks from electron backend on mount
  useEffect(() => {
    if (!currentProject) return;

    const syncRunningTasks = async () => {
      try {
        const api = getElectronAPI();
        if (!api?.autoMode?.status) return;

        const status = await api.autoMode.status(currentProject.path);
        if (status.success) {
          const projectId = currentProject.id;
          const { clearRunningTasks, addRunningTask, setAutoModeRunning } =
            useAppStore.getState();

          // Sync running features if available
          if (status.runningFeatures) {
            console.log(
              "[Board] Syncing running tasks from backend:",
              status.runningFeatures
            );

            // Clear existing running tasks for this project and add the actual running ones
            clearRunningTasks(projectId);

            // Add each running feature to the store
            status.runningFeatures.forEach((featureId: string) => {
              addRunningTask(projectId, featureId);
            });
          }

          // Sync auto mode running state (backend returns autoLoopRunning, mock returns isRunning)
          const isAutoModeRunning =
            status.autoLoopRunning ?? status.isRunning ?? false;
          console.log(
            "[Board] Syncing auto mode running state:",
            isAutoModeRunning
          );
          setAutoModeRunning(projectId, isAutoModeRunning);
        }
      } catch (error) {
        console.error("[Board] Failed to sync running tasks:", error);
      }
    };

    syncRunningTasks();
  }, [currentProject]);

  // Check which features have context files
  useEffect(() => {
    const checkAllContexts = async () => {
      // Check context for in_progress, waiting_approval, and verified features
      const featuresWithPotentialContext = features.filter(
        (f) =>
          f.status === "in_progress" ||
          f.status === "waiting_approval" ||
          f.status === "verified"
      );
      const contextChecks = await Promise.all(
        featuresWithPotentialContext.map(async (f) => ({
          id: f.id,
          hasContext: await checkContextExists(f.id),
        }))
      );

      const newSet = new Set<string>();
      contextChecks.forEach(({ id, hasContext }) => {
        if (hasContext) {
          newSet.add(id);
        }
      });

      setFeaturesWithContext(newSet);
    };

    if (features.length > 0 && !isLoading) {
      checkAllContexts();
    }
  }, [features, isLoading]);

  // Persist feature update to API (replaces saveFeatures)
  const persistFeatureUpdate = useCallback(
    async (featureId: string, updates: Partial<Feature>) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api.features) {
          console.error("[BoardView] Features API not available");
          return;
        }

        const result = await api.features.update(
          currentProject.path,
          featureId,
          updates
        );
        if (result.success && result.feature) {
          updateFeature(result.feature.id, result.feature);
        }
      } catch (error) {
        console.error("Failed to persist feature update:", error);
      }
    },
    [currentProject, updateFeature]
  );

  // Persist feature creation to API
  const persistFeatureCreate = useCallback(
    async (feature: Feature) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api.features) {
          console.error("[BoardView] Features API not available");
          return;
        }

        const result = await api.features.create(currentProject.path, feature);
        if (result.success && result.feature) {
          updateFeature(result.feature.id, result.feature);
        }
      } catch (error) {
        console.error("Failed to persist feature creation:", error);
      }
    },
    [currentProject, updateFeature]
  );

  // Persist feature deletion to API
  const persistFeatureDelete = useCallback(
    async (featureId: string) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api.features) {
          console.error("[BoardView] Features API not available");
          return;
        }

        await api.features.delete(currentProject.path, featureId);
      } catch (error) {
        console.error("Failed to persist feature deletion:", error);
      }
    },
    [currentProject]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const feature = features.find((f) => f.id === active.id);
    if (feature) {
      setActiveFeature(feature);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveFeature(null);

    if (!over) return;

    const featureId = active.id as string;
    const overId = over.id as string;

    // Find the feature being dragged
    const draggedFeature = features.find((f) => f.id === featureId);
    if (!draggedFeature) return;

    // Check if this is a running task (non-skipTests, TDD)
    const isRunningTask = runningAutoTasks.includes(featureId);

    // Determine if dragging is allowed based on status and skipTests
    // - Backlog items can always be dragged
    // - waiting_approval items can always be dragged (to allow manual verification via drag)
    // - verified items can always be dragged (to allow moving back to waiting_approval)
    // - skipTests (non-TDD) items can be dragged between in_progress and verified
    // - Non-skipTests (TDD) items that are in progress cannot be dragged (they are running)
    if (
      draggedFeature.status !== "backlog" &&
      draggedFeature.status !== "waiting_approval" &&
      draggedFeature.status !== "verified"
    ) {
      // Only allow dragging in_progress if it's a skipTests feature and not currently running
      if (!draggedFeature.skipTests || isRunningTask) {
        console.log(
          "[Board] Cannot drag feature - TDD feature or currently running"
        );
        return;
      }
    }

    let targetStatus: ColumnId | null = null;

    // Check if we dropped on a column
    const column = COLUMNS.find((c) => c.id === overId);
    if (column) {
      targetStatus = column.id;
    } else {
      // Dropped on another feature - find its column
      const overFeature = features.find((f) => f.id === overId);
      if (overFeature) {
        targetStatus = overFeature.status;
      }
    }

    if (!targetStatus) return;

    // Same column, nothing to do
    if (targetStatus === draggedFeature.status) return;

    // Handle different drag scenarios
    if (draggedFeature.status === "backlog") {
      // From backlog
      if (targetStatus === "in_progress") {
        // Use helper function to handle concurrency check and start implementation
        await handleStartImplementation(draggedFeature);
      } else {
        moveFeature(featureId, targetStatus);
        persistFeatureUpdate(featureId, { status: targetStatus });
      }
    } else if (draggedFeature.status === "waiting_approval") {
      // waiting_approval features can be dragged to verified for manual verification
      // NOTE: This check must come BEFORE skipTests check because waiting_approval
      // features often have skipTests=true, and we want status-based handling first
      if (targetStatus === "verified") {
        moveFeature(featureId, "verified");
        // Clear justFinishedAt timestamp when manually verifying via drag
        persistFeatureUpdate(featureId, {
          status: "verified",
          justFinishedAt: undefined,
        });
        toast.success("Feature verified", {
          description: `Manually verified: ${draggedFeature.description.slice(
            0,
            50
          )}${draggedFeature.description.length > 50 ? "..." : ""}`,
        });
      } else if (targetStatus === "backlog") {
        // Allow moving waiting_approval cards back to backlog
        moveFeature(featureId, "backlog");
        // Clear justFinishedAt timestamp when moving back to backlog
        persistFeatureUpdate(featureId, {
          status: "backlog",
          justFinishedAt: undefined,
        });
        toast.info("Feature moved to backlog", {
          description: `Moved to Backlog: ${draggedFeature.description.slice(
            0,
            50
          )}${draggedFeature.description.length > 50 ? "..." : ""}`,
        });
      }
    } else if (draggedFeature.skipTests) {
      // skipTests feature being moved between in_progress and verified
      if (
        targetStatus === "verified" &&
        draggedFeature.status === "in_progress"
      ) {
        // Manual verify via drag
        moveFeature(featureId, "verified");
        persistFeatureUpdate(featureId, { status: "verified" });
        toast.success("Feature verified", {
          description: `Marked as verified: ${draggedFeature.description.slice(
            0,
            50
          )}${draggedFeature.description.length > 50 ? "..." : ""}`,
        });
      } else if (
        targetStatus === "waiting_approval" &&
        draggedFeature.status === "verified"
      ) {
        // Move verified feature back to waiting_approval
        moveFeature(featureId, "waiting_approval");
        persistFeatureUpdate(featureId, { status: "waiting_approval" });
        toast.info("Feature moved back", {
          description: `Moved back to Waiting Approval: ${draggedFeature.description.slice(
            0,
            50
          )}${draggedFeature.description.length > 50 ? "..." : ""}`,
        });
      } else if (targetStatus === "backlog") {
        // Allow moving skipTests cards back to backlog
        moveFeature(featureId, "backlog");
        persistFeatureUpdate(featureId, { status: "backlog" });
        toast.info("Feature moved to backlog", {
          description: `Moved to Backlog: ${draggedFeature.description.slice(
            0,
            50
          )}${draggedFeature.description.length > 50 ? "..." : ""}`,
        });
      }
    } else if (draggedFeature.status === "verified") {
      // Handle verified TDD (non-skipTests) features being moved back
      if (targetStatus === "waiting_approval") {
        // Move verified feature back to waiting_approval
        moveFeature(featureId, "waiting_approval");
        persistFeatureUpdate(featureId, { status: "waiting_approval" });
        toast.info("Feature moved back", {
          description: `Moved back to Waiting Approval: ${draggedFeature.description.slice(
            0,
            50
          )}${draggedFeature.description.length > 50 ? "..." : ""}`,
        });
      } else if (targetStatus === "backlog") {
        // Allow moving verified cards back to backlog
        moveFeature(featureId, "backlog");
        persistFeatureUpdate(featureId, { status: "backlog" });
        toast.info("Feature moved to backlog", {
          description: `Moved to Backlog: ${draggedFeature.description.slice(
            0,
            50
          )}${draggedFeature.description.length > 50 ? "..." : ""}`,
        });
      }
    }
  };

  const handleAddFeature = () => {
    // Validate description is required
    if (!newFeature.description.trim()) {
      setDescriptionError(true);
      return;
    }
    const category = newFeature.category || "Uncategorized";
    const selectedModel = newFeature.model;
    const normalizedThinking = modelSupportsThinking(selectedModel)
      ? newFeature.thinkingLevel
      : "none";
    const newFeatureData = {
      category,
      description: newFeature.description,
      steps: newFeature.steps.filter((s) => s.trim()),
      status: "backlog" as const,
      images: newFeature.images,
      imagePaths: newFeature.imagePaths,
      skipTests: newFeature.skipTests,
      model: selectedModel,
      thinkingLevel: normalizedThinking,
    };
    const createdFeature = addFeature(newFeatureData);
    persistFeatureCreate(createdFeature);
    // Persist the category
    saveCategory(category);
    setNewFeature({
      category: "",
      description: "",
      steps: [""],
      images: [],
      imagePaths: [],
      skipTests: defaultSkipTests,
      model: "opus",
      thinkingLevel: "none",
    });
    // Clear the preview map when the feature is added
    setNewFeaturePreviewMap(new Map());
    setShowAddDialog(false);
  };

  const handleUpdateFeature = () => {
    if (!editingFeature) return;

    const selectedModel = (editingFeature.model ?? "opus") as AgentModel;
    const normalizedThinking = modelSupportsThinking(selectedModel)
      ? editingFeature.thinkingLevel
      : "none";

    const updates = {
      category: editingFeature.category,
      description: editingFeature.description,
      steps: editingFeature.steps,
      skipTests: editingFeature.skipTests,
      model: selectedModel,
      thinkingLevel: normalizedThinking,
      imagePaths: editingFeature.imagePaths,
    };
    updateFeature(editingFeature.id, updates);
    persistFeatureUpdate(editingFeature.id, updates);
    // Clear the preview map after saving
    setEditFeaturePreviewMap(new Map());
    // Persist the category if it's new
    if (editingFeature.category) {
      saveCategory(editingFeature.category);
    }
    setEditingFeature(null);
  };

  const handleDeleteFeature = async (featureId: string) => {
    const feature = features.find((f) => f.id === featureId);
    if (!feature) return;

    // Check if the feature is currently running
    const isRunning = runningAutoTasks.includes(featureId);

    // If the feature is running, stop the agent first
    if (isRunning) {
      try {
        await autoMode.stopFeature(featureId);
        toast.success("Agent stopped", {
          description: `Stopped and deleted: ${feature.description.slice(
            0,
            50
          )}${feature.description.length > 50 ? "..." : ""}`,
        });
      } catch (error) {
        console.error("[Board] Error stopping feature before delete:", error);
        toast.error("Failed to stop agent", {
          description: "The feature will still be deleted.",
        });
      }
    }

    // Note: Agent context file will be deleted automatically when feature folder is deleted
    // via persistFeatureDelete, so no manual deletion needed
    if (currentProject) {
      try {
        // Feature folder deletion handles agent-output.md automatically
        console.log(
          `[Board] Feature ${featureId} will be deleted (including agent context)`
        );
      } catch (error) {
        // Context file might not exist, which is fine
        console.log(
          `[Board] Context file not found or already deleted for feature ${featureId}`
        );
      }
    }

    // Delete attached images if they exist
    if (feature.imagePaths && feature.imagePaths.length > 0) {
      try {
        const api = getElectronAPI();
        for (const imagePathObj of feature.imagePaths) {
          try {
            await api.deleteFile(imagePathObj.path);
            console.log(`[Board] Deleted image: ${imagePathObj.path}`);
          } catch (error) {
            console.error(
              `[Board] Failed to delete image ${imagePathObj.path}:`,
              error
            );
          }
        }
      } catch (error) {
        console.error(
          `[Board] Error deleting images for feature ${featureId}:`,
          error
        );
      }
    }

    // Remove the feature immediately without confirmation
    removeFeature(featureId);
    persistFeatureDelete(featureId);
  };

  const handleRunFeature = async (feature: Feature) => {
    if (!currentProject) return;

    try {
      const api = getElectronAPI();
      if (!api?.autoMode) {
        console.error("Auto mode API not available");
        return;
      }

      // Call the API to run this specific feature by ID
      const result = await api.autoMode.runFeature(
        currentProject.path,
        feature.id,
        useWorktrees
      );

      if (result.success) {
        console.log("[Board] Feature run started successfully");
        // The feature status will be updated by the auto mode service
        // and the UI will reload features when the agent completes (via event listener)
      } else {
        console.error("[Board] Failed to run feature:", result.error);
        // Reload to revert the UI status change
        await loadFeatures();
      }
    } catch (error) {
      console.error("[Board] Error running feature:", error);
      // Reload to revert the UI status change
      await loadFeatures();
    }
  };

  // Helper function to start implementing a feature (from backlog to in_progress)
  const handleStartImplementation = async (feature: Feature) => {
    if (!autoMode.canStartNewTask) {
      toast.error("Concurrency limit reached", {
        description: `You can only have ${autoMode.maxConcurrency} task${
          autoMode.maxConcurrency > 1 ? "s" : ""
        } running at a time. Wait for a task to complete or increase the limit.`,
      });
      return false;
    }

    const updates = {
      status: "in_progress" as const,
      startedAt: new Date().toISOString(),
    };
    updateFeature(feature.id, updates);
    persistFeatureUpdate(feature.id, updates);
    console.log("[Board] Feature moved to in_progress, starting agent...");
    await handleRunFeature(feature);
    return true;
  };

  const handleVerifyFeature = async (feature: Feature) => {
    if (!currentProject) return;

    console.log("[Board] Verifying feature:", {
      id: feature.id,
      description: feature.description,
    });

    try {
      const api = getElectronAPI();
      if (!api?.autoMode) {
        console.error("Auto mode API not available");
        return;
      }

      // Call the API to verify this specific feature by ID
      const result = await api.autoMode.verifyFeature(
        currentProject.path,
        feature.id
      );

      if (result.success) {
        console.log("[Board] Feature verification started successfully");
        // The feature status will be updated by the auto mode service
        // and the UI will reload features when verification completes
      } else {
        console.error("[Board] Failed to verify feature:", result.error);
        await loadFeatures();
      }
    } catch (error) {
      console.error("[Board] Error verifying feature:", error);
      await loadFeatures();
    }
  };

  const handleResumeFeature = async (feature: Feature) => {
    if (!currentProject) return;

    console.log("[Board] Resuming feature:", {
      id: feature.id,
      description: feature.description,
    });

    try {
      const api = getElectronAPI();
      if (!api?.autoMode) {
        console.error("Auto mode API not available");
        return;
      }

      // Call the API to resume this specific feature by ID with context
      const result = await api.autoMode.resumeFeature(
        currentProject.path,
        feature.id
      );

      if (result.success) {
        console.log("[Board] Feature resume started successfully");
        // The feature status will be updated by the auto mode service
        // and the UI will reload features when resume completes
      } else {
        console.error("[Board] Failed to resume feature:", result.error);
        await loadFeatures();
      }
    } catch (error) {
      console.error("[Board] Error resuming feature:", error);
      await loadFeatures();
    }
  };

  // Manual verification handler for skipTests features
  const handleManualVerify = (feature: Feature) => {
    console.log("[Board] Manually verifying feature:", {
      id: feature.id,
      description: feature.description,
    });
    moveFeature(feature.id, "verified");
    // Clear justFinishedAt timestamp when manually verifying
    persistFeatureUpdate(feature.id, {
      status: "verified",
      justFinishedAt: undefined,
    });
    toast.success("Feature verified", {
      description: `Marked as verified: ${feature.description.slice(0, 50)}${
        feature.description.length > 50 ? "..." : ""
      }`,
    });
  };

  // Move feature back to in_progress from verified (for skipTests features)
  const handleMoveBackToInProgress = (feature: Feature) => {
    console.log("[Board] Moving feature back to in_progress:", {
      id: feature.id,
      description: feature.description,
    });
    const updates = {
      status: "in_progress" as const,
      startedAt: new Date().toISOString(),
    };
    updateFeature(feature.id, updates);
    persistFeatureUpdate(feature.id, updates);
    toast.info("Feature moved back", {
      description: `Moved back to In Progress: ${feature.description.slice(
        0,
        50
      )}${feature.description.length > 50 ? "..." : ""}`,
    });
  };

  // Open follow-up dialog for waiting_approval features
  const handleOpenFollowUp = (feature: Feature) => {
    console.log("[Board] Opening follow-up dialog for feature:", {
      id: feature.id,
      description: feature.description,
    });
    setFollowUpFeature(feature);
    setFollowUpPrompt("");
    setFollowUpImagePaths([]);
    setShowFollowUpDialog(true);
  };

  // Handle sending follow-up prompt
  const handleSendFollowUp = async () => {
    if (!currentProject || !followUpFeature || !followUpPrompt.trim()) return;

    // Save values before clearing state
    const featureId = followUpFeature.id;
    const featureDescription = followUpFeature.description;
    const prompt = followUpPrompt;
    const imagePaths = followUpImagePaths.map((img) => img.path);

    console.log("[Board] Sending follow-up prompt for feature:", {
      id: featureId,
      prompt: prompt,
      imagePaths: imagePaths,
    });

    const api = getElectronAPI();
    if (!api?.autoMode?.followUpFeature) {
      console.error("Follow-up feature API not available");
      toast.error("Follow-up not available", {
        description: "This feature is not available in the current version.",
      });
      return;
    }

    // Move feature back to in_progress before sending follow-up
    // Clear justFinishedAt timestamp since user is now interacting with it
    const updates = {
      status: "in_progress" as const,
      startedAt: new Date().toISOString(),
      justFinishedAt: undefined,
    };
    updateFeature(featureId, updates);
    persistFeatureUpdate(featureId, updates);

    // Reset follow-up state immediately (close dialog, clear form)
    setShowFollowUpDialog(false);
    setFollowUpFeature(null);
    setFollowUpPrompt("");
    setFollowUpImagePaths([]);
    setFollowUpPreviewMap(new Map());

    // Show success toast immediately
    toast.success("Follow-up started", {
      description: `Continuing work on: ${featureDescription.slice(0, 50)}${
        featureDescription.length > 50 ? "..." : ""
      }`,
    });

    // Call the API in the background (don't await - let it run async)
    api.autoMode
      .followUpFeature(currentProject.path, featureId, prompt, imagePaths)
      .catch((error) => {
        console.error("[Board] Error sending follow-up:", error);
        toast.error("Failed to send follow-up", {
          description:
            error instanceof Error ? error.message : "An error occurred",
        });
        // Reload features to revert status if there was an error
        loadFeatures();
      });
  };

  // Handle commit-only for waiting_approval features (marks as verified and commits)
  const handleCommitFeature = async (feature: Feature) => {
    if (!currentProject) return;

    console.log("[Board] Committing feature:", {
      id: feature.id,
      description: feature.description,
    });

    try {
      const api = getElectronAPI();
      if (!api?.autoMode?.commitFeature) {
        console.error("Commit feature API not available");
        toast.error("Commit not available", {
          description: "This feature is not available in the current version.",
        });
        return;
      }

      // Call the API to commit this feature
      const result = await api.autoMode.commitFeature(
        currentProject.path,
        feature.id
      );

      if (result.success) {
        console.log("[Board] Feature committed successfully");
        // Move to verified status
        moveFeature(feature.id, "verified");
        persistFeatureUpdate(feature.id, { status: "verified" });
        toast.success("Feature committed", {
          description: `Committed and verified: ${feature.description.slice(
            0,
            50
          )}${feature.description.length > 50 ? "..." : ""}`,
        });
      } else {
        console.error("[Board] Failed to commit feature:", result.error);
        toast.error("Failed to commit feature", {
          description: result.error || "An error occurred",
        });
        await loadFeatures();
      }
    } catch (error) {
      console.error("[Board] Error committing feature:", error);
      toast.error("Failed to commit feature", {
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
      await loadFeatures();
    }
  };

  // Move feature to waiting_approval (for skipTests features when agent completes)
  const handleMoveToWaitingApproval = (feature: Feature) => {
    console.log("[Board] Moving feature to waiting_approval:", {
      id: feature.id,
      description: feature.description,
    });
    const updates = { status: "waiting_approval" as const };
    updateFeature(feature.id, updates);
    persistFeatureUpdate(feature.id, updates);
    toast.info("Feature ready for review", {
      description: `Ready for approval: ${feature.description.slice(0, 50)}${
        feature.description.length > 50 ? "..." : ""
      }`,
    });
  };

  // Revert feature changes by removing the worktree
  const handleRevertFeature = async (feature: Feature) => {
    if (!currentProject) return;

    console.log("[Board] Reverting feature:", {
      id: feature.id,
      description: feature.description,
      branchName: feature.branchName,
    });

    try {
      const api = getElectronAPI();
      if (!api?.worktree?.revertFeature) {
        console.error("Worktree API not available");
        toast.error("Revert not available", {
          description: "This feature is not available in the current version.",
        });
        return;
      }

      const result = await api.worktree.revertFeature(
        currentProject.path,
        feature.id
      );

      if (result.success) {
        console.log("[Board] Feature reverted successfully");
        // Reload features to update the UI
        await loadFeatures();
        toast.success("Feature reverted", {
          description: `All changes discarded. Moved back to backlog: ${feature.description.slice(
            0,
            50
          )}${feature.description.length > 50 ? "..." : ""}`,
        });
      } else {
        console.error("[Board] Failed to revert feature:", result.error);
        toast.error("Failed to revert feature", {
          description: result.error || "An error occurred",
        });
      }
    } catch (error) {
      console.error("[Board] Error reverting feature:", error);
      toast.error("Failed to revert feature", {
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
    }
  };

  // Merge feature worktree changes back to main branch
  const handleMergeFeature = async (feature: Feature) => {
    if (!currentProject) return;

    console.log("[Board] Merging feature:", {
      id: feature.id,
      description: feature.description,
      branchName: feature.branchName,
    });

    try {
      const api = getElectronAPI();
      if (!api?.worktree?.mergeFeature) {
        console.error("Worktree API not available");
        toast.error("Merge not available", {
          description: "This feature is not available in the current version.",
        });
        return;
      }

      const result = await api.worktree.mergeFeature(
        currentProject.path,
        feature.id
      );

      if (result.success) {
        console.log("[Board] Feature merged successfully");
        // Reload features to update the UI
        await loadFeatures();
        toast.success("Feature merged", {
          description: `Changes merged to main branch: ${feature.description.slice(
            0,
            50
          )}${feature.description.length > 50 ? "..." : ""}`,
        });
      } else {
        console.error("[Board] Failed to merge feature:", result.error);
        toast.error("Failed to merge feature", {
          description: result.error || "An error occurred",
        });
      }
    } catch (error) {
      console.error("[Board] Error merging feature:", error);
      toast.error("Failed to merge feature", {
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
    }
  };

  // Complete a verified feature (move to completed/archived)
  const handleCompleteFeature = (feature: Feature) => {
    console.log("[Board] Completing feature:", {
      id: feature.id,
      description: feature.description,
    });

    const updates = {
      status: "completed" as const,
    };
    updateFeature(feature.id, updates);
    persistFeatureUpdate(feature.id, updates);

    toast.success("Feature completed", {
      description: `Archived: ${feature.description.slice(0, 50)}${
        feature.description.length > 50 ? "..." : ""
      }`,
    });
  };

  // Unarchive a completed feature (move back to verified)
  const handleUnarchiveFeature = (feature: Feature) => {
    console.log("[Board] Unarchiving feature:", {
      id: feature.id,
      description: feature.description,
    });

    const updates = {
      status: "verified" as const,
    };
    updateFeature(feature.id, updates);
    persistFeatureUpdate(feature.id, updates);

    toast.success("Feature restored", {
      description: `Moved back to verified: ${feature.description.slice(
        0,
        50
      )}${feature.description.length > 50 ? "..." : ""}`,
    });
  };

  const checkContextExists = async (featureId: string): Promise<boolean> => {
    if (!currentProject) return false;

    try {
      const api = getElectronAPI();
      if (!api?.autoMode?.contextExists) {
        return false;
      }

      const result = await api.autoMode.contextExists(
        currentProject.path,
        featureId
      );

      return result.success && result.exists === true;
    } catch (error) {
      console.error("[Board] Error checking context:", error);
      return false;
    }
  };

  // Memoize completed features for the archive modal
  const completedFeatures = useMemo(() => {
    return features.filter((f) => f.status === "completed");
  }, [features]);

  // Memoize column features to prevent unnecessary re-renders
  const columnFeaturesMap = useMemo(() => {
    const map: Record<ColumnId, Feature[]> = {
      backlog: [],
      in_progress: [],
      waiting_approval: [],
      verified: [],
      completed: [], // Completed features are shown in the archive modal, not as a column
    };

    // Filter features by search query (case-insensitive)
    const normalizedQuery = searchQuery.toLowerCase().trim();
    const filteredFeatures = normalizedQuery
      ? features.filter(
          (f) =>
            f.description.toLowerCase().includes(normalizedQuery) ||
            f.category?.toLowerCase().includes(normalizedQuery)
        )
      : features;

    filteredFeatures.forEach((f) => {
      // If feature has a running agent, always show it in "in_progress"
      const isRunning = runningAutoTasks.includes(f.id);
      if (isRunning) {
        map.in_progress.push(f);
      } else {
        // Otherwise, use the feature's status (fallback to backlog for unknown statuses)
        const status = f.status as ColumnId;
        if (map[status]) {
          map[status].push(f);
        } else {
          // Unknown status, default to backlog
          map.backlog.push(f);
        }
      }
    });

    // Sort backlog by priority: 1 (high) -> 2 (medium) -> 3 (low) -> no priority
    map.backlog.sort((a, b) => {
      const aPriority = a.priority ?? 999; // Features without priority go last
      const bPriority = b.priority ?? 999;
      return aPriority - bPriority;
    });

    return map;
  }, [features, runningAutoTasks, searchQuery]);

  const getColumnFeatures = useCallback(
    (columnId: ColumnId) => {
      return columnFeaturesMap[columnId];
    },
    [columnFeaturesMap]
  );

  const handleViewOutput = (feature: Feature) => {
    setOutputFeature(feature);
    setShowOutputModal(true);
  };

  // Handle number key press when output modal is open
  const handleOutputModalNumberKeyPress = useCallback(
    (key: string) => {
      // Convert key to index: 1-9 -> 0-8, 0 -> 9
      const index = key === "0" ? 9 : parseInt(key, 10) - 1;

      // Get the feature at that index from in-progress features
      const targetFeature = inProgressFeaturesForShortcuts[index];

      if (!targetFeature) {
        // No feature at this index, do nothing
        return;
      }

      // If pressing the same number key as the currently open feature, close the modal
      if (targetFeature.id === outputFeature?.id) {
        setShowOutputModal(false);
      }
      // If pressing a different number key, switch to that feature's output
      else {
        setOutputFeature(targetFeature);
        // Modal stays open, just showing different content
      }
    },
    [inProgressFeaturesForShortcuts, outputFeature?.id]
  );

  const handleForceStopFeature = async (feature: Feature) => {
    try {
      await autoMode.stopFeature(feature.id);

      // Determine where to move the feature after stopping:
      // - If it's a skipTests feature that was in waiting_approval (i.e., during commit operation),
      //   move it back to waiting_approval so user can try commit again or do follow-up
      // - Otherwise, move to backlog
      const targetStatus =
        feature.skipTests && feature.status === "waiting_approval"
          ? "waiting_approval"
          : "backlog";

      if (targetStatus !== feature.status) {
        moveFeature(feature.id, targetStatus);
        persistFeatureUpdate(feature.id, { status: targetStatus });
      }

      toast.success("Agent stopped", {
        description:
          targetStatus === "waiting_approval"
            ? `Stopped commit - returned to waiting approval: ${feature.description.slice(
                0,
                50
              )}${feature.description.length > 50 ? "..." : ""}`
            : `Stopped working on: ${feature.description.slice(0, 50)}${
                feature.description.length > 50 ? "..." : ""
              }`,
      });
    } catch (error) {
      console.error("[Board] Error stopping feature:", error);
      toast.error("Failed to stop agent", {
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
    }
  };

  // Start next features from backlog up to the concurrency limit
  const handleStartNextFeatures = useCallback(async () => {
    const backlogFeatures = features.filter((f) => f.status === "backlog");
    const availableSlots = maxConcurrency - runningAutoTasks.length;

    if (availableSlots <= 0) {
      toast.error("Concurrency limit reached", {
        description: `You can only have ${maxConcurrency} task${
          maxConcurrency > 1 ? "s" : ""
        } running at a time. Wait for a task to complete or increase the limit.`,
      });
      return;
    }

    if (backlogFeatures.length === 0) {
      toast.info("No features in backlog", {
        description: "Add features to the backlog first.",
      });
      return;
    }

    const featuresToStart = backlogFeatures.slice(0, 1);

    for (const feature of featuresToStart) {
      // Update the feature status with startedAt timestamp
      const updates = {
        status: "in_progress" as const,
        startedAt: new Date().toISOString(),
      };
      updateFeature(feature.id, updates);
      persistFeatureUpdate(feature.id, updates);
      // Start the agent for this feature
      await handleRunFeature(feature);
    }

    toast.success(
      `Started ${featuresToStart.length} feature${
        featuresToStart.length > 1 ? "s" : ""
      }`,
      {
        description: featuresToStart
          .map(
            (f) =>
              f.description.slice(0, 30) +
              (f.description.length > 30 ? "..." : "")
          )
          .join(", "),
      }
    );
  }, [features, maxConcurrency, runningAutoTasks.length, updateFeature]);

  // Update ref when handleStartNextFeatures changes
  useEffect(() => {
    startNextFeaturesRef.current = handleStartNextFeatures;
  }, [handleStartNextFeatures]);

  const renderModelOptions = (
    options: ModelOption[],
    selectedModel: AgentModel,
    onSelect: (model: AgentModel) => void,
    testIdPrefix = "model-select"
  ) => (
    <div className="flex gap-2 flex-wrap">
      {options.map((option) => {
        const isSelected = selectedModel === option.id;
        // Shorter display names for compact view
        const shortName = option.label.replace("Claude ", "");
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            title={option.description}
            className={cn(
              "flex-1 min-w-[80px] px-3 py-2 rounded-md border text-sm font-medium transition-colors",
              isSelected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent border-input"
            )}
            data-testid={`${testIdPrefix}-${option.id}`}
          >
            {shortName}
          </button>
        );
      })}
    </div>
  );

  const newModelAllowsThinking = modelSupportsThinking(newFeature.model);
  const editModelAllowsThinking = modelSupportsThinking(editingFeature?.model);

  if (!currentProject) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="board-view-no-project"
      >
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="board-view-loading"
      >
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden content-bg relative"
      data-testid="board-view"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
        <div>
          <h1 className="text-xl font-bold">Kanban Board</h1>
          <p className="text-sm text-muted-foreground">{currentProject.name}</p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Concurrency Slider - only show after mount to prevent hydration issues */}
          {isMounted && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border"
              data-testid="concurrency-slider-container"
            >
              <Users className="w-4 h-4 text-muted-foreground" />
              <Slider
                value={[maxConcurrency]}
                onValueChange={(value) => setMaxConcurrency(value[0])}
                min={1}
                max={10}
                step={1}
                className="w-20"
                data-testid="concurrency-slider"
              />
              <span
                className="text-sm text-muted-foreground min-w-[2ch] text-center"
                data-testid="concurrency-value"
              >
                {maxConcurrency}
              </span>
            </div>
          )}

          {/* Auto Mode Toggle - only show after mount to prevent hydration issues */}
          {isMounted && (
            <>
              {autoMode.isRunning ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => autoMode.stop()}
                  data-testid="stop-auto-mode"
                >
                  <StopCircle className="w-4 h-4 mr-2" />
                  Stop Auto Mode
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => autoMode.start()}
                  data-testid="start-auto-mode"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Auto Mode
                </Button>
              )}
            </>
          )}

          <HotkeyButton
            size="sm"
            onClick={() => setShowAddDialog(true)}
            hotkey={shortcuts.addFeature}
            hotkeyActive={false}
            data-testid="add-feature-button"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Feature
          </HotkeyButton>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search Bar Row */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div className="relative max-w-md flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Search features by keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-12 border-border"
                data-testid="kanban-search-input"
              />
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-sm hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="kanban-search-clear"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <span
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono rounded bg-brand-500/10 border border-brand-500/30 text-brand-400/70"
                  data-testid="kanban-search-hotkey"
                >
                  /
                </span>
              )}
            </div>
            {/* Spec Creation Loading Badge */}
            {isCreatingSpec &&
              currentProject?.path === creatingSpecProjectPath && (
                <div
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-brand-500/10 border border-brand-500/20 shrink-0"
                  title="Creating App Specification"
                  data-testid="spec-creation-badge"
                >
                  <Loader2 className="w-3 h-3 animate-spin text-brand-500 shrink-0" />
                  <span className="text-xs font-medium text-brand-500 whitespace-nowrap">
                    Creating spec
                  </span>
                </div>
              )}
          </div>

          {/* Board Background & Detail Level Controls */}
          {isMounted && (
            <TooltipProvider>
              <div className="flex items-center gap-2 ml-4">
                {/* Board Background Button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowBoardBackgroundModal(true)}
                      className="h-8 px-2"
                      data-testid="board-background-button"
                    >
                      <ImageIcon className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Board Background Settings</p>
                  </TooltipContent>
                </Tooltip>

                {/* Completed/Archived Features Button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCompletedModal(true)}
                      className="h-8 px-2 relative"
                      data-testid="completed-features-button"
                    >
                      <Archive className="w-4 h-4" />
                      {completedFeatures.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-brand-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                          {completedFeatures.length > 99
                            ? "99+"
                            : completedFeatures.length}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Completed Features ({completedFeatures.length})</p>
                  </TooltipContent>
                </Tooltip>

                {/* Kanban Card Detail Level Toggle */}
                <div
                  className="flex items-center rounded-lg bg-secondary border border-border"
                  data-testid="kanban-detail-toggle"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setKanbanCardDetailLevel("minimal")}
                        className={cn(
                          "p-2 rounded-l-lg transition-colors",
                          kanbanCardDetailLevel === "minimal"
                            ? "bg-brand-500/20 text-brand-500"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        )}
                        data-testid="kanban-toggle-minimal"
                      >
                        <Minimize2 className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Minimal - Title & category only</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setKanbanCardDetailLevel("standard")}
                        className={cn(
                          "p-2 transition-colors",
                          kanbanCardDetailLevel === "standard"
                            ? "bg-brand-500/20 text-brand-500"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        )}
                        data-testid="kanban-toggle-standard"
                      >
                        <Square className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Standard - Steps & progress</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setKanbanCardDetailLevel("detailed")}
                        className={cn(
                          "p-2 rounded-r-lg transition-colors",
                          kanbanCardDetailLevel === "detailed"
                            ? "bg-brand-500/20 text-brand-500"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        )}
                        data-testid="kanban-toggle-detailed"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Detailed - Model, tools & tasks</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </TooltipProvider>
          )}
        </div>
        {/* Kanban Columns */}
        {(() => {
          // Get background settings for current project
          const backgroundSettings =
            (currentProject && boardBackgroundByProject[currentProject.path]) ||
            defaultBackgroundSettings;

          // Build background image style if image exists
          const backgroundImageStyle = backgroundSettings.imagePath
            ? {
                backgroundImage: `url(${
                  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3008"
                }/api/fs/image?path=${encodeURIComponent(
                  backgroundSettings.imagePath
                )}&projectPath=${encodeURIComponent(
                  currentProject?.path || ""
                )}${
                  backgroundSettings.imageVersion
                    ? `&v=${backgroundSettings.imageVersion}`
                    : ""
                })`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }
            : {};

          return (
            <div
              className="flex-1 overflow-x-auto px-4 pb-4 relative"
              style={backgroundImageStyle}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={collisionDetectionStrategy}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div className="flex gap-5 h-full min-w-max py-1">
                  {COLUMNS.map((column) => {
                    const columnFeatures = getColumnFeatures(column.id);
                    return (
                      <KanbanColumn
                        key={column.id}
                        id={column.id}
                        title={column.title}
                        colorClass={column.colorClass}
                        count={columnFeatures.length}
                        opacity={backgroundSettings.columnOpacity}
                        showBorder={backgroundSettings.columnBorderEnabled}
                        hideScrollbar={backgroundSettings.hideScrollbar}
                        headerAction={
                          column.id === "verified" &&
                          columnFeatures.length > 0 ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() =>
                                setShowDeleteAllVerifiedDialog(true)
                              }
                              data-testid="delete-all-verified-button"
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Delete All
                            </Button>
                          ) : column.id === "backlog" ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10 relative"
                                onClick={() => setShowSuggestionsDialog(true)}
                                title="Feature Suggestions"
                                data-testid="feature-suggestions-button"
                              >
                                <Lightbulb className="w-3.5 h-3.5" />
                                {suggestionsCount > 0 && (
                                  <span
                                    className="absolute -top-1 -right-1 w-4 h-4 text-[9px] font-mono rounded-full bg-yellow-500 text-black flex items-center justify-center"
                                    data-testid="suggestions-count"
                                  >
                                    {suggestionsCount}
                                  </span>
                                )}
                              </Button>
                              {columnFeatures.length > 0 && (
                                <HotkeyButton
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
                                  onClick={handleStartNextFeatures}
                                  hotkey={shortcuts.startNext}
                                  hotkeyActive={false}
                                  data-testid="start-next-button"
                                >
                                  <FastForward className="w-3 h-3 mr-1" />
                                  Pull Top
                                </HotkeyButton>
                              )}
                            </div>
                          ) : undefined
                        }
                      >
                        <SortableContext
                          items={columnFeatures.map((f) => f.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {columnFeatures.map((feature, index) => {
                            // Calculate shortcut key for in-progress cards (first 10 get 1-9, 0)
                            let shortcutKey: string | undefined;
                            if (column.id === "in_progress" && index < 10) {
                              shortcutKey =
                                index === 9 ? "0" : String(index + 1);
                            }
                            return (
                              <KanbanCard
                                key={feature.id}
                                feature={feature}
                                onEdit={() => setEditingFeature(feature)}
                                onDelete={() => handleDeleteFeature(feature.id)}
                                onViewOutput={() => handleViewOutput(feature)}
                                onVerify={() => handleVerifyFeature(feature)}
                                onResume={() => handleResumeFeature(feature)}
                                onForceStop={() =>
                                  handleForceStopFeature(feature)
                                }
                                onManualVerify={() =>
                                  handleManualVerify(feature)
                                }
                                onMoveBackToInProgress={() =>
                                  handleMoveBackToInProgress(feature)
                                }
                                onFollowUp={() => handleOpenFollowUp(feature)}
                                onCommit={() => handleCommitFeature(feature)}
                                onRevert={() => handleRevertFeature(feature)}
                                onMerge={() => handleMergeFeature(feature)}
                                onComplete={() =>
                                  handleCompleteFeature(feature)
                                }
                                onImplement={() =>
                                  handleStartImplementation(feature)
                                }
                                hasContext={featuresWithContext.has(feature.id)}
                                isCurrentAutoTask={runningAutoTasks.includes(
                                  feature.id
                                )}
                                shortcutKey={shortcutKey}
                                opacity={backgroundSettings.cardOpacity}
                                glassmorphism={
                                  backgroundSettings.cardGlassmorphism
                                }
                                cardBorderEnabled={
                                  backgroundSettings.cardBorderEnabled
                                }
                                cardBorderOpacity={
                                  backgroundSettings.cardBorderOpacity
                                }
                              />
                            );
                          })}
                        </SortableContext>
                      </KanbanColumn>
                    );
                  })}
                </div>

                <DragOverlay
                  dropAnimation={{
                    duration: 200,
                    easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
                  }}
                >
                  {activeFeature && (
                    <Card className="w-72 rotate-2 shadow-2xl shadow-black/25 border-primary/50 bg-card/95 backdrop-blur-sm transition-transform">
                      <CardHeader className="p-3">
                        <CardTitle className="text-sm font-medium line-clamp-2">
                          {activeFeature.description}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">
                          {activeFeature.category}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  )}
                </DragOverlay>
              </DndContext>
            </div>
          );
        })()}
      </div>

      {/* Board Background Modal */}
      <BoardBackgroundModal
        open={showBoardBackgroundModal}
        onOpenChange={setShowBoardBackgroundModal}
      />

      {/* Completed Features Modal */}
      <Dialog open={showCompletedModal} onOpenChange={setShowCompletedModal}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="w-5 h-5 text-brand-500" />
              Completed Features
            </DialogTitle>
            <DialogDescription>
              {completedFeatures.length === 0
                ? "No completed features yet. Features you complete will appear here."
                : `${completedFeatures.length} completed feature${
                    completedFeatures.length === 1 ? "" : "s"
                  }`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {completedFeatures.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Archive className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">No completed features</p>
                <p className="text-sm">
                  Complete features from the Verified column to archive them
                  here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {completedFeatures.map((feature) => (
                  <Card
                    key={feature.id}
                    className="flex flex-col"
                    data-testid={`completed-card-${feature.id}`}
                  >
                    <CardHeader className="p-3 pb-2 flex-1">
                      <CardTitle className="text-sm leading-tight line-clamp-3">
                        {feature.description || feature.summary || feature.id}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1 truncate">
                        {feature.category || "Uncategorized"}
                      </CardDescription>
                    </CardHeader>
                    <div className="p-3 pt-0 flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 h-7 text-xs"
                        onClick={() => handleUnarchiveFeature(feature)}
                        data-testid={`unarchive-${feature.id}`}
                      >
                        <ArchiveRestore className="w-3 h-3 mr-1" />
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteCompletedFeature(feature)}
                        data-testid={`delete-completed-${feature.id}`}
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowCompletedModal(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Completed Feature Confirmation Dialog */}
      <Dialog
        open={!!deleteCompletedFeature}
        onOpenChange={(open) => !open && setDeleteCompletedFeature(null)}
      >
        <DialogContent data-testid="delete-completed-confirmation-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Feature
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this feature?
              <span className="block mt-2 font-medium text-foreground">
                &quot;{deleteCompletedFeature?.description?.slice(0, 100)}
                {(deleteCompletedFeature?.description?.length ?? 0) > 100
                  ? "..."
                  : ""}
                &quot;
              </span>
              <span className="block mt-2 text-destructive font-medium">
                This action cannot be undone.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteCompletedFeature(null)}
              data-testid="cancel-delete-completed-button"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (deleteCompletedFeature) {
                  await handleDeleteFeature(deleteCompletedFeature.id);
                  setDeleteCompletedFeature(null);
                }
              }}
              data-testid="confirm-delete-completed-button"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Feature Dialog */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          // Clear preview map, validation error, and reset advanced options when dialog closes
          if (!open) {
            setNewFeaturePreviewMap(new Map());
            setShowAdvancedOptions(false);
            setDescriptionError(false);
          }
        }}
      >
        <DialogContent
          compact={!isMaximized}
          data-testid="add-feature-dialog"
          onPointerDownOutside={(e) => {
            // Prevent dialog from closing when clicking on category autocomplete dropdown
            const target = e.target as HTMLElement;
            if (target.closest('[data-testid="category-autocomplete-list"]')) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            // Prevent dialog from closing when clicking on category autocomplete dropdown
            const target = e.target as HTMLElement;
            if (target.closest('[data-testid="category-autocomplete-list"]')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Add New Feature</DialogTitle>
            <DialogDescription>
              Create a new feature card for the Kanban board.
            </DialogDescription>
          </DialogHeader>
          <Tabs
            defaultValue="prompt"
            className="py-4 flex-1 min-h-0 flex flex-col"
          >
            <TabsList className="w-full grid grid-cols-3 mb-4">
              <TabsTrigger value="prompt" data-testid="tab-prompt">
                <MessageSquare className="w-4 h-4 mr-2" />
                Prompt
              </TabsTrigger>
              <TabsTrigger value="model" data-testid="tab-model">
                <Settings2 className="w-4 h-4 mr-2" />
                Model
              </TabsTrigger>
              <TabsTrigger value="testing" data-testid="tab-testing">
                <FlaskConical className="w-4 h-4 mr-2" />
                Testing
              </TabsTrigger>
            </TabsList>

            {/* Prompt Tab */}
            <TabsContent value="prompt" className="space-y-4 overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <DescriptionImageDropZone
                  value={newFeature.description}
                  onChange={(value) => {
                    setNewFeature({ ...newFeature, description: value });
                    if (value.trim()) {
                      setDescriptionError(false);
                    }
                  }}
                  images={newFeature.imagePaths}
                  onImagesChange={(images) =>
                    setNewFeature({ ...newFeature, imagePaths: images })
                  }
                  placeholder="Describe the feature..."
                  previewMap={newFeaturePreviewMap}
                  onPreviewMapChange={setNewFeaturePreviewMap}
                  autoFocus
                  error={descriptionError}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category (optional)</Label>
                <CategoryAutocomplete
                  value={newFeature.category}
                  onChange={(value) =>
                    setNewFeature({ ...newFeature, category: value })
                  }
                  suggestions={categorySuggestions}
                  placeholder="e.g., Core, UI, API"
                  data-testid="feature-category-input"
                />
              </div>
            </TabsContent>

            {/* Model Tab */}
            <TabsContent value="model" className="space-y-4 overflow-y-auto">
              {/* Show Advanced Options Toggle - only when profiles-only mode is enabled */}
              {showProfilesOnly && (
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      Simple Mode Active
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Only showing AI profiles. Advanced model tweaking is
                      hidden.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                    data-testid="show-advanced-options-toggle"
                  >
                    <Settings2 className="w-4 h-4 mr-2" />
                    {showAdvancedOptions ? "Hide" : "Show"} Advanced
                  </Button>
                </div>
              )}

              {/* Quick Select Profile Section */}
              {aiProfiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <UserCircle className="w-4 h-4 text-brand-500" />
                      Quick Select Profile
                    </Label>
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-brand-500/40 text-brand-500">
                      Presets
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {aiProfiles.slice(0, 6).map((profile) => {
                      const IconComponent = profile.icon
                        ? PROFILE_ICONS[profile.icon]
                        : Brain;
                      const isSelected =
                        newFeature.model === profile.model &&
                        newFeature.thinkingLevel === profile.thinkingLevel;
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() => {
                            setNewFeature({
                              ...newFeature,
                              model: profile.model,
                              thinkingLevel: profile.thinkingLevel,
                            });
                          }}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-lg border text-left transition-all",
                            isSelected
                              ? "bg-brand-500/10 border-brand-500 text-foreground"
                              : "bg-background hover:bg-accent border-input"
                          )}
                          data-testid={`profile-quick-select-${profile.id}`}
                        >
                          <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 bg-primary/10">
                            {IconComponent && (
                              <IconComponent className="w-4 h-4 text-primary" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {profile.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {profile.model}
                              {profile.thinkingLevel !== "none" &&
                                ` + ${profile.thinkingLevel}`}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Or customize below. Manage profiles in{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddDialog(false);
                        useAppStore.getState().setCurrentView("profiles");
                      }}
                      className="text-brand-500 hover:underline"
                    >
                      AI Profiles
                    </button>
                  </p>
                </div>
              )}

              {/* Separator */}
              {aiProfiles.length > 0 &&
                (!showProfilesOnly || showAdvancedOptions) && (
                  <div className="border-t border-border" />
                )}

              {/* Claude Models Section - Hidden when showProfilesOnly is true and showAdvancedOptions is false */}
              {(!showProfilesOnly || showAdvancedOptions) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-primary" />
                      Claude (SDK)
                    </Label>
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-primary/40 text-primary">
                      Native
                    </span>
                  </div>
                  {renderModelOptions(
                    CLAUDE_MODELS,
                    newFeature.model,
                    (model) =>
                      setNewFeature({
                        ...newFeature,
                        model,
                        thinkingLevel: modelSupportsThinking(model)
                          ? newFeature.thinkingLevel
                          : "none",
                      })
                  )}

                  {/* Thinking Level - Only shown when Claude model is selected */}
                  {newModelAllowsThinking && (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <Label className="flex items-center gap-2 text-sm">
                        <Brain className="w-3.5 h-3.5 text-muted-foreground" />
                        Thinking Level
                      </Label>
                      <div className="flex gap-2 flex-wrap">
                        {(
                          [
                            "none",
                            "low",
                            "medium",
                            "high",
                            "ultrathink",
                          ] as ThinkingLevel[]
                        ).map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => {
                              setNewFeature({
                                ...newFeature,
                                thinkingLevel: level,
                              });
                            }}
                            className={cn(
                              "flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors min-w-[60px]",
                              newFeature.thinkingLevel === level
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background hover:bg-accent border-input"
                            )}
                            data-testid={`thinking-level-${level}`}
                          >
                            {level === "none" && "None"}
                            {level === "low" && "Low"}
                            {level === "medium" && "Med"}
                            {level === "high" && "High"}
                            {level === "ultrathink" && "Ultra"}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Higher levels give more time to reason through complex
                        problems.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Testing Tab */}
            <TabsContent value="testing" className="space-y-4 overflow-y-auto">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="skip-tests"
                  checked={!newFeature.skipTests}
                  onCheckedChange={(checked) =>
                    setNewFeature({
                      ...newFeature,
                      skipTests: checked !== true,
                    })
                  }
                  data-testid="skip-tests-checkbox"
                />
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="skip-tests"
                    className="text-sm cursor-pointer"
                  >
                    Enable automated testing
                  </Label>
                  <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                When enabled, this feature will use automated TDD. When
                disabled, it will require manual verification.
              </p>

              {/* Verification Steps - Only shown when skipTests is enabled */}
              {newFeature.skipTests && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label>Verification Steps</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Add manual steps to verify this feature works correctly.
                  </p>
                  {newFeature.steps.map((step, index) => (
                    <Input
                      key={index}
                      placeholder={`Verification step ${index + 1}`}
                      value={step}
                      onChange={(e) => {
                        const steps = [...newFeature.steps];
                        steps[index] = e.target.value;
                        setNewFeature({ ...newFeature, steps });
                      }}
                      data-testid={`feature-step-${index}-input`}
                    />
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setNewFeature({
                        ...newFeature,
                        steps: [...newFeature.steps, ""],
                      })
                    }
                    data-testid="add-step-button"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Verification Step
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <HotkeyButton
              onClick={handleAddFeature}
              hotkey={{ key: "Enter", cmdCtrl: true }}
              hotkeyActive={showAddDialog}
              data-testid="confirm-add-feature"
            >
              Add Feature
            </HotkeyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Feature Dialog */}
      <Dialog
        open={!!editingFeature}
        onOpenChange={(open) => {
          if (!open) {
            setEditingFeature(null);
            setShowEditAdvancedOptions(false);
            setEditFeaturePreviewMap(new Map());
          }
        }}
      >
        <DialogContent
          compact={!isMaximized}
          data-testid="edit-feature-dialog"
          onPointerDownOutside={(e) => {
            // Prevent dialog from closing when clicking on category autocomplete dropdown
            const target = e.target as HTMLElement;
            if (target.closest('[data-testid="category-autocomplete-list"]')) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            // Prevent dialog from closing when clicking on category autocomplete dropdown
            const target = e.target as HTMLElement;
            if (target.closest('[data-testid="category-autocomplete-list"]')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit Feature</DialogTitle>
            <DialogDescription>Modify the feature details.</DialogDescription>
          </DialogHeader>
          {editingFeature && (
            <Tabs
              defaultValue="prompt"
              className="py-4 flex-1 min-h-0 flex flex-col"
            >
              <TabsList className="w-full grid grid-cols-3 mb-4">
                <TabsTrigger value="prompt" data-testid="edit-tab-prompt">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Prompt
                </TabsTrigger>
                <TabsTrigger value="model" data-testid="edit-tab-model">
                  <Settings2 className="w-4 h-4 mr-2" />
                  Model
                </TabsTrigger>
                <TabsTrigger value="testing" data-testid="edit-tab-testing">
                  <FlaskConical className="w-4 h-4 mr-2" />
                  Testing
                </TabsTrigger>
              </TabsList>

              {/* Prompt Tab */}
              <TabsContent value="prompt" className="space-y-4 overflow-y-auto">
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <DescriptionImageDropZone
                    value={editingFeature.description}
                    onChange={(value) =>
                      setEditingFeature({
                        ...editingFeature,
                        description: value,
                      })
                    }
                    images={editingFeature.imagePaths ?? []}
                    onImagesChange={(images) =>
                      setEditingFeature({
                        ...editingFeature,
                        imagePaths: images,
                      })
                    }
                    placeholder="Describe the feature..."
                    previewMap={editFeaturePreviewMap}
                    onPreviewMapChange={setEditFeaturePreviewMap}
                    data-testid="edit-feature-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-category">Category (optional)</Label>
                  <CategoryAutocomplete
                    value={editingFeature.category}
                    onChange={(value) =>
                      setEditingFeature({
                        ...editingFeature,
                        category: value,
                      })
                    }
                    suggestions={categorySuggestions}
                    placeholder="e.g., Core, UI, API"
                    data-testid="edit-feature-category"
                  />
                </div>
              </TabsContent>

              {/* Model Tab */}
              <TabsContent value="model" className="space-y-4 overflow-y-auto">
                {/* Show Advanced Options Toggle - only when profiles-only mode is enabled */}
                {showProfilesOnly && (
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        Simple Mode Active
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Only showing AI profiles. Advanced model tweaking is
                        hidden.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setShowEditAdvancedOptions(!showEditAdvancedOptions)
                      }
                      data-testid="edit-show-advanced-options-toggle"
                    >
                      <Settings2 className="w-4 h-4 mr-2" />
                      {showEditAdvancedOptions ? "Hide" : "Show"} Advanced
                    </Button>
                  </div>
                )}

                {/* Quick Select Profile Section */}
                {aiProfiles.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <UserCircle className="w-4 h-4 text-brand-500" />
                        Quick Select Profile
                      </Label>
                      <span className="text-[11px] px-2 py-0.5 rounded-full border border-brand-500/40 text-brand-500">
                        Presets
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {aiProfiles.slice(0, 6).map((profile) => {
                        const IconComponent = profile.icon
                          ? PROFILE_ICONS[profile.icon]
                          : Brain;
                        const isSelected =
                          editingFeature.model === profile.model &&
                          editingFeature.thinkingLevel ===
                            profile.thinkingLevel;
                        return (
                          <button
                            key={profile.id}
                            type="button"
                            onClick={() => {
                              setEditingFeature({
                                ...editingFeature,
                                model: profile.model,
                                thinkingLevel: profile.thinkingLevel,
                              });
                            }}
                            className={cn(
                              "flex items-center gap-2 p-2 rounded-lg border text-left transition-all",
                              isSelected
                                ? "bg-brand-500/10 border-brand-500 text-foreground"
                                : "bg-background hover:bg-accent border-input"
                            )}
                            data-testid={`edit-profile-quick-select-${profile.id}`}
                          >
                            <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 bg-primary/10">
                              {IconComponent && (
                                <IconComponent className="w-4 h-4 text-primary" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {profile.name}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {profile.model}
                                {profile.thinkingLevel !== "none" &&
                                  ` + ${profile.thinkingLevel}`}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Or customize below.
                    </p>
                  </div>
                )}

                {/* Separator */}
                {aiProfiles.length > 0 &&
                  (!showProfilesOnly || showEditAdvancedOptions) && (
                    <div className="border-t border-border" />
                  )}

                {/* Claude Models Section - Hidden when showProfilesOnly is true and showEditAdvancedOptions is false */}
                {(!showProfilesOnly || showEditAdvancedOptions) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-primary" />
                        Claude (SDK)
                      </Label>
                      <span className="text-[11px] px-2 py-0.5 rounded-full border border-primary/40 text-primary">
                        Native
                      </span>
                    </div>
                    {renderModelOptions(
                      CLAUDE_MODELS,
                      (editingFeature.model ?? "opus") as AgentModel,
                      (model) =>
                        setEditingFeature({
                          ...editingFeature,
                          model,
                          thinkingLevel: modelSupportsThinking(model)
                            ? editingFeature.thinkingLevel
                            : "none",
                        }),
                      "edit-model-select"
                    )}

                    {/* Thinking Level - Only shown when Claude model is selected */}
                    {editModelAllowsThinking && (
                      <div className="space-y-2 pt-2 border-t border-border">
                        <Label className="flex items-center gap-2 text-sm">
                          <Brain className="w-3.5 h-3.5 text-muted-foreground" />
                          Thinking Level
                        </Label>
                        <div className="flex gap-2 flex-wrap">
                          {(
                            [
                              "none",
                              "low",
                              "medium",
                              "high",
                              "ultrathink",
                            ] as ThinkingLevel[]
                          ).map((level) => (
                            <button
                              key={level}
                              type="button"
                              onClick={() => {
                                setEditingFeature({
                                  ...editingFeature,
                                  thinkingLevel: level,
                                });
                              }}
                              className={cn(
                                "flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors min-w-[60px]",
                                (editingFeature.thinkingLevel ?? "none") ===
                                  level
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-background hover:bg-accent border-input"
                              )}
                              data-testid={`edit-thinking-level-${level}`}
                            >
                              {level === "none" && "None"}
                              {level === "low" && "Low"}
                              {level === "medium" && "Med"}
                              {level === "high" && "High"}
                              {level === "ultrathink" && "Ultra"}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Higher levels give more time to reason through complex
                          problems.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* Testing Tab */}
              <TabsContent
                value="testing"
                className="space-y-4 overflow-y-auto"
              >
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-skip-tests"
                    checked={!(editingFeature.skipTests ?? false)}
                    onCheckedChange={(checked) =>
                      setEditingFeature({
                        ...editingFeature,
                        skipTests: checked !== true,
                      })
                    }
                    data-testid="edit-skip-tests-checkbox"
                  />
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="edit-skip-tests"
                      className="text-sm cursor-pointer"
                    >
                      Enable automated testing
                    </Label>
                    <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  When enabled, this feature will use automated TDD. When
                  disabled, it will require manual verification.
                </p>

                {/* Verification Steps - Only shown when skipTests is enabled */}
                {editingFeature.skipTests && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <Label>Verification Steps</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Add manual steps to verify this feature works correctly.
                    </p>
                    {editingFeature.steps.map((step, index) => (
                      <Input
                        key={index}
                        value={step}
                        placeholder={`Verification step ${index + 1}`}
                        onChange={(e) => {
                          const steps = [...editingFeature.steps];
                          steps[index] = e.target.value;
                          setEditingFeature({ ...editingFeature, steps });
                        }}
                        data-testid={`edit-feature-step-${index}`}
                      />
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEditingFeature({
                          ...editingFeature,
                          steps: [...editingFeature.steps, ""],
                        })
                      }
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Verification Step
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingFeature(null)}>
              Cancel
            </Button>
            <HotkeyButton
              onClick={handleUpdateFeature}
              hotkey={{ key: "Enter", cmdCtrl: true }}
              hotkeyActive={!!editingFeature}
              data-testid="confirm-edit-feature"
            >
              Save Changes
            </HotkeyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agent Output Modal */}
      <AgentOutputModal
        open={showOutputModal}
        onClose={() => setShowOutputModal(false)}
        featureDescription={outputFeature?.description || ""}
        featureId={outputFeature?.id || ""}
        featureStatus={outputFeature?.status}
        onNumberKeyPress={handleOutputModalNumberKeyPress}
      />

      {/* Delete All Verified Dialog */}
      <Dialog
        open={showDeleteAllVerifiedDialog}
        onOpenChange={setShowDeleteAllVerifiedDialog}
      >
        <DialogContent data-testid="delete-all-verified-dialog">
          <DialogHeader>
            <DialogTitle>Delete All Verified Features</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete all verified features? This action
              cannot be undone.
              {getColumnFeatures("verified").length > 0 && (
                <span className="block mt-2 text-yellow-500">
                  {getColumnFeatures("verified").length} feature(s) will be
                  deleted.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowDeleteAllVerifiedDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const verifiedFeatures = getColumnFeatures("verified");
                const api = getElectronAPI();

                for (const feature of verifiedFeatures) {
                  // Check if the feature is currently running
                  const isRunning = runningAutoTasks.includes(feature.id);

                  // If the feature is running, stop the agent first
                  if (isRunning) {
                    try {
                      await autoMode.stopFeature(feature.id);
                    } catch (error) {
                      console.error(
                        "[Board] Error stopping feature before delete:",
                        error
                      );
                    }
                  }

                  // Note: Agent context file will be deleted automatically when feature folder is deleted
                  // via persistFeatureDelete, so no manual deletion needed
                  try {
                    // Feature folder deletion handles agent-output.md automatically
                    console.log(
                      `[Board] Feature ${feature.id} will be deleted (including agent context)`
                    );
                  } catch (error) {
                    // Context file might not exist, which is fine
                    console.debug(
                      "[Board] No context file to delete for feature:",
                      feature.id
                    );
                  }

                  // Remove the feature
                  removeFeature(feature.id);
                  persistFeatureDelete(feature.id);
                }

                setShowDeleteAllVerifiedDialog(false);
                toast.success("All verified features deleted", {
                  description: `Deleted ${verifiedFeatures.length} feature(s).`,
                });
              }}
              data-testid="confirm-delete-all-verified"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Follow-Up Prompt Dialog */}
      <Dialog
        open={showFollowUpDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowFollowUpDialog(false);
            setFollowUpFeature(null);
            setFollowUpPrompt("");
            setFollowUpImagePaths([]);
            setFollowUpPreviewMap(new Map());
          }
        }}
      >
        <DialogContent
          compact={!isMaximized}
          data-testid="follow-up-dialog"
          onKeyDown={(e) => {
            if (
              (e.metaKey || e.ctrlKey) &&
              e.key === "Enter" &&
              followUpPrompt.trim()
            ) {
              e.preventDefault();
              handleSendFollowUp();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Follow-Up Prompt</DialogTitle>
            <DialogDescription>
              Send additional instructions to continue working on this feature.
              {followUpFeature && (
                <span className="block mt-2 text-primary">
                  Feature: {followUpFeature.description.slice(0, 100)}
                  {followUpFeature.description.length > 100 ? "..." : ""}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
            <div className="space-y-2">
              <Label htmlFor="follow-up-prompt">Instructions</Label>
              <DescriptionImageDropZone
                value={followUpPrompt}
                onChange={setFollowUpPrompt}
                images={followUpImagePaths}
                onImagesChange={setFollowUpImagePaths}
                placeholder="Describe what needs to be fixed or changed..."
                previewMap={followUpPreviewMap}
                onPreviewMapChange={setFollowUpPreviewMap}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The agent will continue from where it left off, using the existing
              context. You can attach screenshots to help explain the issue.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowFollowUpDialog(false);
                setFollowUpFeature(null);
                setFollowUpPrompt("");
                setFollowUpImagePaths([]);
                setFollowUpPreviewMap(new Map());
              }}
            >
              Cancel
            </Button>
            <HotkeyButton
              onClick={handleSendFollowUp}
              disabled={!followUpPrompt.trim()}
              hotkey={{ key: "Enter", cmdCtrl: true }}
              hotkeyActive={showFollowUpDialog}
              data-testid="confirm-follow-up"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Send Follow-Up
            </HotkeyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feature Suggestions Dialog */}
      <FeatureSuggestionsDialog
        open={showSuggestionsDialog}
        onClose={() => {
          setShowSuggestionsDialog(false);
        }}
        projectPath={currentProject.path}
        suggestions={featureSuggestions}
        setSuggestions={(suggestions) => {
          setFeatureSuggestions(suggestions);
          setSuggestionsCount(suggestions.length);
        }}
        isGenerating={isGeneratingSuggestions}
        setIsGenerating={setIsGeneratingSuggestions}
      />
    </div>
  );
}
