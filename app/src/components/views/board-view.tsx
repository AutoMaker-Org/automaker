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
} from "@/store/app-store";
import { getElectronAPI } from "@/lib/electron";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CategoryAutocomplete } from "@/components/ui/category-autocomplete";
import { FeatureImageUpload } from "@/components/ui/feature-image-upload";
import {
  DescriptionImageDropZone,
  FeatureImagePath as DescriptionImagePath,
} from "@/components/ui/description-image-dropzone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { AgentOutputModal } from "./agent-output-modal";
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
} from "lucide-react";
import { toast } from "sonner";
import { safeJoin } from "@/lib/path-utils";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { useAutoMode } from "@/hooks/use-auto-mode";
import {
  useKeyboardShortcuts,
  ACTION_SHORTCUTS,
  KeyboardShortcut,
} from "@/hooks/use-keyboard-shortcuts";

type ColumnId = Feature["status"];

const COLUMNS: { id: ColumnId; title: string; color: string }[] = [
  { id: "backlog", title: "Backlog", color: "bg-zinc-500" },
  { id: "in_progress", title: "In Progress", color: "bg-yellow-500" },
  { id: "waiting_approval", title: "Waiting Approval", color: "bg-orange-500" },
  { id: "verified", title: "Verified", color: "bg-green-500" },
];

export function BoardView() {
  const {
    currentProject,
    features,
    setFeatures,
    addFeature,
    updateFeature,
    removeFeature,
    moveFeature,
    runningAutoTasks,
    maxConcurrency,
    setMaxConcurrency,
    defaultSkipTests,
  } = useAppStore();
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
  const [persistedCategories, setPersistedCategories] = useState<string[]>([]);
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [followUpFeature, setFollowUpFeature] = useState<Feature | null>(null);
  const [followUpPrompt, setFollowUpPrompt] = useState("");
  const [followUpImagePaths, setFollowUpImagePaths] = useState<
    DescriptionImagePath[]
  >([]);

  // Make current project available globally for modal
  useEffect(() => {
    if (currentProject) {
      (window as any).__currentProject = currentProject;
    }
    return () => {
      (window as any).__currentProject = null;
    };
  }, [currentProject]);

  // Track previous project to detect switches
  const prevProjectPathRef = useRef<string | null>(null);
  const isSwitchingProjectRef = useRef<boolean>(false);

  // Auto mode hook
  const autoMode = useAutoMode();

  // Get in-progress features for keyboard shortcuts (memoized for shortcuts)
  const inProgressFeaturesForShortcuts = useMemo(() => {
    return features.filter((f) => {
      const isRunning = runningAutoTasks.includes(f.id);
      return isRunning || f.status === "in_progress";
    });
  }, [features, runningAutoTasks]);

  // Ref to hold the start next callback (to avoid dependency issues)
  const startNextFeaturesRef = useRef<() => void>(() => {});

  // Keyboard shortcuts for this view
  const boardShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcuts: KeyboardShortcut[] = [
      {
        key: ACTION_SHORTCUTS.addFeature,
        action: () => setShowAddDialog(true),
        description: "Add new feature",
      },
      {
        key: ACTION_SHORTCUTS.startNext,
        action: () => startNextFeaturesRef.current(),
        description: "Start next features from backlog",
      },
    ];

    // Add shortcuts for in-progress cards (1-9 and 0 for 10th)
    inProgressFeaturesForShortcuts.slice(0, 10).forEach((feature, index) => {
      // Keys 1-9 for first 9 cards, 0 for 10th card
      const key = index === 9 ? "0" : String(index + 1);
      shortcuts.push({
        key,
        action: () => {
          setOutputFeature(feature);
          setShowOutputModal(true);
        },
        description: `View output for in-progress card ${index + 1}`,
      });
    });

    return shortcuts;
  }, [inProgressFeaturesForShortcuts]);
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

  // Load features from file
  const loadFeatures = useCallback(async () => {
    if (!currentProject) return;

    const currentPath = currentProject.path;
    const previousPath = prevProjectPathRef.current;

    // If project switched, clear features first to prevent cross-contamination
    if (previousPath !== null && currentPath !== previousPath) {
      console.log(
        `[BoardView] Project switch detected: ${previousPath} -> ${currentPath}, clearing features`
      );
      isSwitchingProjectRef.current = true;
      setFeatures([]);
      setPersistedCategories([]); // Also clear categories
    }

    // Update the ref to track current project
    prevProjectPathRef.current = currentPath;

    setIsLoading(true);
    try {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      const result = await api.readFile(
        safeJoin(currentProject.path, '.automaker', 'feature_list.json')
      );

      if (result.success && result.content) {
        const parsed = JSON.parse(result.content);
        const featuresWithIds = parsed.map((f: any, index: number) => ({
          ...f,
          id: f.id || `feature-${index}-${Date.now()}`,
          status: f.status || "backlog",
          startedAt: f.startedAt, // Preserve startedAt timestamp
        }));
        setFeatures(featuresWithIds);
      }
    } catch (error) {
      console.error("Failed to load features:", error);
    } finally {
      setIsLoading(false);
      isSwitchingProjectRef.current = false;
    }
  }, [currentProject, setFeatures]);

  // Load persisted categories from file
  const loadCategories = useCallback(async () => {
    if (!currentProject) return;

    try {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      const result = await api.readFile(
        safeJoin(currentProject.path, '.automaker', 'categories.json')
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
        const api = await getElectronAPI();
        if (!api) {
          console.error("Failed to get Electron API");
          return;
        }

        // Read existing categories
        let categories: string[] = [...persistedCategories];

        // Add new category if it doesn't exist
        if (!categories.includes(category)) {
          categories.push(category);
          categories.sort(); // Keep sorted

          // Write back to file
          await api.writeFile(
            safeJoin(currentProject.path, '.automaker', 'categories.json'),
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
    const setupEventListener = async () => {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      if (!api.autoMode) return;

    const { removeRunningTask } = useAppStore.getState();

    const unsubscribe = api.autoMode.onEvent((event) => {
      if (event.type === "auto_mode_feature_complete") {
        // Reload features when a feature is completed
        console.log("[Board] Feature completed, reloading features...");
        loadFeatures();
      } else if (event.type === "auto_mode_error") {
        // Reload features when an error occurs (feature moved to waiting_approval)
        console.log(
          "[Board] Feature error, reloading features...",
          event.error
        );

        // Remove from running tasks so it moves to the correct column
        if (event.featureId) {
          removeRunningTask(event.featureId);
        }

        loadFeatures();
        // Show error toast
        toast.error("Agent encountered an error", {
          description: event.error || "Check the logs for details",
        });
      }
    });

      return unsubscribe;
    };

    const cleanup = setupEventListener();
    return () => {
      cleanup.then(unsubscribe => unsubscribe?.());
    };
  }, [loadFeatures]);

  useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  // Load persisted categories on mount
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Sync running tasks from electron backend on mount
  useEffect(() => {
    const syncRunningTasks = async () => {
      try {
        const api = await getElectronAPI();
        if (!api) {
          console.error("Failed to get Electron API");
          return;
        }
        if (!api.autoMode?.status) return;

        const status = await api.autoMode.status();
        if (status.success && status.runningFeatures) {
          console.log(
            "[Board] Syncing running tasks from backend:",
            status.runningFeatures
          );

          // Clear existing running tasks and add the actual running ones
          const { clearRunningTasks, addRunningTask } = useAppStore.getState();
          clearRunningTasks();

          // Add each running feature to the store
          status.runningFeatures.forEach((featureId: string) => {
            addRunningTask(featureId);
          });
        }
      } catch (error) {
        console.error("[Board] Failed to sync running tasks:", error);
      }
    };

    syncRunningTasks();
  }, []);

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

  // Save features to file
  const saveFeatures = useCallback(async () => {
    if (!currentProject) return;

    try {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      const toSave = features.map((f) => ({
        id: f.id,
        category: f.category,
        description: f.description,
        steps: f.steps,
        status: f.status,
        startedAt: f.startedAt,
        imagePaths: f.imagePaths,
        skipTests: f.skipTests,
        summary: f.summary,
        error: f.error,
      }));
      await api.writeFile(
        safeJoin(currentProject.path, '.automaker', 'feature_list.json'),
        JSON.stringify(toSave, null, 2)
      );
    } catch (error) {
      console.error("Failed to save features:", error);
    }
  }, [currentProject, features]);

  // Save when features change (after initial load is complete)
  useEffect(() => {
    if (!isLoading && !isSwitchingProjectRef.current) {
      saveFeatures();
    }
  }, [features, saveFeatures, isLoading]);

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
    // - skipTests (non-TDD) items can be dragged between in_progress and verified
    // - Non-skipTests (TDD) items that are in progress or verified cannot be dragged
    if (draggedFeature.status !== "backlog") {
      // Only allow dragging in_progress/verified if it's a skipTests feature and not currently running
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

    // Check concurrency limit before moving to in_progress (only for backlog -> in_progress and if running agent)
    if (
      targetStatus === "in_progress" &&
      draggedFeature.status === "backlog" &&
      !autoMode.canStartNewTask
    ) {
      console.log("[Board] Cannot start new task - at max concurrency limit");
      toast.error("Concurrency limit reached", {
        description: `You can only have ${autoMode.maxConcurrency} task${
          autoMode.maxConcurrency > 1 ? "s" : ""
        } running at a time. Wait for a task to complete or increase the limit.`,
      });
      return;
    }

    // Handle different drag scenarios
    if (draggedFeature.status === "backlog") {
      // From backlog
      if (targetStatus === "in_progress") {
        // Update with startedAt timestamp
        updateFeature(featureId, {
          status: targetStatus,
          startedAt: new Date().toISOString(),
        });
        console.log("[Board] Feature moved to in_progress, starting agent...");
        await handleRunFeature(draggedFeature);
      } else {
        moveFeature(featureId, targetStatus);
      }
    } else if (draggedFeature.skipTests) {
      // skipTests feature being moved between in_progress and verified
      if (
        targetStatus === "verified" &&
        draggedFeature.status === "in_progress"
      ) {
        // Manual verify via drag
        moveFeature(featureId, "verified");
        toast.success("Feature verified", {
          description: `Marked as verified: ${draggedFeature.description.slice(
            0,
            50
          )}${draggedFeature.description.length > 50 ? "..." : ""}`,
        });
      } else if (
        targetStatus === "in_progress" &&
        draggedFeature.status === "verified"
      ) {
        // Move back to in_progress
        updateFeature(featureId, {
          status: "in_progress",
          startedAt: new Date().toISOString(),
        });
        toast.info("Feature moved back", {
          description: `Moved back to In Progress: ${draggedFeature.description.slice(
            0,
            50
          )}${draggedFeature.description.length > 50 ? "..." : ""}`,
        });
      } else if (targetStatus === "backlog") {
        // Allow moving skipTests cards back to backlog
        moveFeature(featureId, "backlog");
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
    const category = newFeature.category || "Uncategorized";
    addFeature({
      category,
      description: newFeature.description,
      steps: newFeature.steps.filter((s) => s.trim()),
      status: "backlog",
      images: newFeature.images,
      imagePaths: newFeature.imagePaths,
      skipTests: newFeature.skipTests,
    });
    // Persist the category
    saveCategory(category);
    setNewFeature({
      category: "",
      description: "",
      steps: [""],
      images: [],
      imagePaths: [],
      skipTests: defaultSkipTests,
    });
    setShowAddDialog(false);
  };

  const handleUpdateFeature = () => {
    if (!editingFeature) return;

    updateFeature(editingFeature.id, {
      category: editingFeature.category,
      description: editingFeature.description,
      steps: editingFeature.steps,
      skipTests: editingFeature.skipTests,
    });
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

    // Delete agent context file if it exists
    try {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      const contextPath = safeJoin(currentProject.path, '.automaker', 'agents-context', `${featureId}.md`);
      await api.deleteFile(contextPath);
      console.log(`[Board] Deleted agent context for feature ${featureId}`);
    } catch (error) {
      // Context file might not exist, which is fine
      console.log(
        `[Board] Context file not found or already deleted for feature ${featureId}`
      );
    }

    // Delete attached images if they exist
    if (feature.imagePaths && feature.imagePaths.length > 0) {
      try {
        const api = await getElectronAPI();
        if (!api) {
          console.error("Failed to get Electron API");
          return;
        }
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
  };

  const handleRunFeature = async (feature: Feature) => {
    if (!currentProject) return;

    try {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      if (!api.autoMode) {
        console.error("Auto mode API not available");
        return;
      }

      // Call the API to run this specific feature by ID
      const result = await api.autoMode.runFeature(
        currentProject.path,
        feature.id
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

  const handleVerifyFeature = async (feature: Feature) => {
    if (!currentProject) return;

    console.log("[Board] Verifying feature:", {
      id: feature.id,
      description: feature.description,
    });

    try {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      if (!api.autoMode) {
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
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      if (!api.autoMode) {
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
    updateFeature(feature.id, {
      status: "in_progress",
      startedAt: new Date().toISOString(),
    });
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

    const api = await getElectronAPI();
    if (!api) {
      console.error("Failed to get Electron API");
      return;
    }
    if (!api.autoMode?.followUpFeature) {
      console.error("Follow-up feature API not available");
      toast.error("Follow-up not available", {
        description: "This feature is not available in the current version.",
      });
      return;
    }

    // Move feature back to in_progress before sending follow-up
    updateFeature(featureId, {
      status: "in_progress",
      startedAt: new Date().toISOString(),
    });

    // Reset follow-up state immediately (close dialog, clear form)
    setShowFollowUpDialog(false);
    setFollowUpFeature(null);
    setFollowUpPrompt("");
    setFollowUpImagePaths([]);

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
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      if (!api.autoMode?.commitFeature) {
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
    updateFeature(feature.id, { status: "waiting_approval" });
    toast.info("Feature ready for review", {
      description: `Ready for approval: ${feature.description.slice(0, 50)}${
        feature.description.length > 50 ? "..." : ""
      }`,
    });
  };

  const checkContextExists = async (featureId: string): Promise<boolean> => {
    if (!currentProject) return false;

    try {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return false;
      }
      if (!api.autoMode?.contextExists) {
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

  const getColumnFeatures = (columnId: ColumnId) => {
    return features.filter((f) => {
      // If feature has a running agent, always show it in "in_progress"
      const isRunning = runningAutoTasks.includes(f.id);
      if (isRunning) {
        return columnId === "in_progress";
      }
      // Otherwise, use the feature's status
      return f.status === columnId;
    });
  };

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

    const featuresToStart = backlogFeatures.slice(0, availableSlots);

    for (const feature of featuresToStart) {
      // Update the feature status with startedAt timestamp
      updateFeature(feature.id, {
        status: "in_progress",
        startedAt: new Date().toISOString(),
      });
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

          <Button
            size="sm"
            onClick={() => setShowAddDialog(true)}
            data-testid="add-feature-button"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Feature
            <span
              className="ml-2 px-1.5 py-0.5 text-[10px] font-mono rounded bg-white/10 border border-white/20"
              data-testid="shortcut-add-feature"
            >
              {ACTION_SHORTCUTS.addFeature}
            </span>
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Kanban Columns */}
        <div className="flex-1 overflow-x-auto p-4">
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 h-full min-w-max">
              {COLUMNS.map((column) => {
                const columnFeatures = getColumnFeatures(column.id);
                return (
                  <KanbanColumn
                    key={column.id}
                    id={column.id}
                    title={column.title}
                    color={column.color}
                    count={columnFeatures.length}
                    headerAction={
                      column.id === "verified" && columnFeatures.length > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setShowDeleteAllVerifiedDialog(true)}
                          data-testid="delete-all-verified-button"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete All
                        </Button>
                      ) : column.id === "backlog" &&
                        columnFeatures.length > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
                          onClick={handleStartNextFeatures}
                          data-testid="start-next-button"
                        >
                          <FastForward className="w-3 h-3 mr-1" />
                          Start Next
                          <span className="ml-1 px-1 py-0.5 text-[9px] font-mono rounded bg-white/10 border border-white/20">
                            {ACTION_SHORTCUTS.startNext}
                          </span>
                        </Button>
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
                          shortcutKey = index === 9 ? "0" : String(index + 1);
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
                            onForceStop={() => handleForceStopFeature(feature)}
                            onManualVerify={() => handleManualVerify(feature)}
                            onMoveBackToInProgress={() =>
                              handleMoveBackToInProgress(feature)
                            }
                            onFollowUp={() => handleOpenFollowUp(feature)}
                            onCommit={() => handleCommitFeature(feature)}
                            hasContext={featuresWithContext.has(feature.id)}
                            isCurrentAutoTask={runningAutoTasks.includes(
                              feature.id
                            )}
                            shortcutKey={shortcutKey}
                          />
                        );
                      })}
                    </SortableContext>
                  </KanbanColumn>
                );
              })}
            </div>

            <DragOverlay>
              {activeFeature && (
                <Card className="w-72 opacity-90 rotate-3 shadow-xl">
                  <CardHeader className="p-3">
                    <CardTitle className="text-sm">
                      {activeFeature.description}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {activeFeature.category}
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {/* Add Feature Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent
          data-testid="add-feature-dialog"
          onKeyDown={(e) => {
            if (
              (e.metaKey || e.ctrlKey) &&
              e.key === "Enter" &&
              newFeature.description
            ) {
              e.preventDefault();
              handleAddFeature();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Add New Feature</DialogTitle>
            <DialogDescription>
              Create a new feature card for the Kanban board.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <DescriptionImageDropZone
                value={newFeature.description}
                onChange={(value) =>
                  setNewFeature({ ...newFeature, description: value })
                }
                images={newFeature.imagePaths}
                onImagesChange={(images) =>
                  setNewFeature({ ...newFeature, imagePaths: images })
                }
                placeholder="Describe the feature..."
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
            <div className="flex items-center space-x-2">
              <Checkbox
                id="skip-tests"
                checked={newFeature.skipTests}
                onCheckedChange={(checked) =>
                  setNewFeature({ ...newFeature, skipTests: checked === true })
                }
                data-testid="skip-tests-checkbox"
              />
              <div className="flex items-center gap-2">
                <Label htmlFor="skip-tests" className="text-sm cursor-pointer">
                  Skip automated testing
                </Label>
                <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, this feature will require manual verification
              instead of automated TDD.
            </p>
            {newFeature.skipTests && (
              <div className="space-y-2">
                <Label>Verification Steps</Label>
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddFeature}
              disabled={!newFeature.description}
              data-testid="confirm-add-feature"
            >
              Add Feature
              <span
                className="ml-2 px-1.5 py-0.5 text-[10px] font-mono rounded bg-white/10 border border-white/20"
                data-testid="shortcut-confirm-add-feature"
              >
                ⌘↵
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Feature Dialog */}
      <Dialog
        open={!!editingFeature}
        onOpenChange={() => setEditingFeature(null)}
      >
        <DialogContent data-testid="edit-feature-dialog">
          <DialogHeader>
            <DialogTitle>Edit Feature</DialogTitle>
            <DialogDescription>Modify the feature details.</DialogDescription>
          </DialogHeader>
          {editingFeature && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  placeholder="Describe the feature..."
                  value={editingFeature.description}
                  onChange={(e) =>
                    setEditingFeature({
                      ...editingFeature,
                      description: e.target.value,
                    })
                  }
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
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-skip-tests"
                  checked={editingFeature.skipTests ?? false}
                  onCheckedChange={(checked) =>
                    setEditingFeature({
                      ...editingFeature,
                      skipTests: checked === true,
                    })
                  }
                  data-testid="edit-skip-tests-checkbox"
                />
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="edit-skip-tests"
                    className="text-sm cursor-pointer"
                  >
                    Skip automated testing
                  </Label>
                  <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                When enabled, this feature will require manual verification
                instead of automated TDD.
              </p>
              {editingFeature.skipTests && (
                <div className="space-y-2">
                  <Label>Verification Steps</Label>
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
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingFeature(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateFeature}
              data-testid="confirm-edit-feature"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agent Output Modal */}
      <AgentOutputModal
        open={showOutputModal}
        onClose={() => setShowOutputModal(false)}
        featureDescription={outputFeature?.description || ""}
        featureId={outputFeature?.id || ""}
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
                const api = await getElectronAPI();
                if (!api) {
                  console.error("Failed to get Electron API");
                  return;
                }

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

                  // Delete agent context file if it exists
                  try {
                    const contextPath = safeJoin(currentProject.path, '.automaker', 'agents-context', `${feature.id}.md`);
                    await api.deleteFile(contextPath);
                    console.log(
                      `[Board] Deleted agent context for feature ${feature.id}`
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
          }
        }}
      >
        <DialogContent
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
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="follow-up-prompt">Instructions</Label>
              <DescriptionImageDropZone
                value={followUpPrompt}
                onChange={setFollowUpPrompt}
                images={followUpImagePaths}
                onImagesChange={setFollowUpImagePaths}
                placeholder="Describe what needs to be fixed or changed..."
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
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendFollowUp}
              disabled={!followUpPrompt.trim()}
              data-testid="confirm-follow-up"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Send Follow-Up
              <span className="ml-2 px-1.5 py-0.5 text-[10px] font-mono rounded bg-white/10 border border-white/20">
                ⌘↵
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
