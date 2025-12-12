"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAppStore } from "@/store/app-store";
import { services, isBootstrapped } from "@/services";
import { Button } from "@/components/ui/button";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Save, RefreshCw, FileText, Sparkles, Loader2, FilePlus2, AlertCircle, ListPlus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { XmlSyntaxEditor } from "@/components/ui/xml-syntax-editor";
import type { SpecRegenerationEvent } from "@/types/electron";

// Delay before reloading spec file to ensure it's written to disk
const SPEC_FILE_WRITE_DELAY = 500;

// Interval for polling backend status during generation
const STATUS_CHECK_INTERVAL_MS = 2000;

export function SpecView() {
  const { currentProject, appSpec, setAppSpec } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [specExists, setSpecExists] = useState(true);

  // Regeneration state
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [projectDefinition, setProjectDefinition] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Create spec state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [projectOverview, setProjectOverview] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [generateFeatures, setGenerateFeatures] = useState(true);
  
  // Generate features only state
  const [isGeneratingFeatures, setIsGeneratingFeatures] = useState(false);
  
  // Logs state (kept for internal tracking, but UI removed)
  const [logs, setLogs] = useState<string>("");
  const logsRef = useRef<string>("");
  
  // Phase tracking and status
  const [currentPhase, setCurrentPhase] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const statusCheckRef = useRef<boolean>(false);
  const stateRestoredRef = useRef<boolean>(false);

  // Load spec from file
  const loadSpec = useCallback(async () => {
    if (!currentProject || !isBootstrapped()) return;

    setIsLoading(true);
    try {
      const result = await services.fileSystem.readFile(
        `${currentProject.path}/.automaker/app_spec.txt`
      );

      if (result.success && result.data) {
        setAppSpec(result.data);
        setSpecExists(true);
        setHasChanges(false);
      } else {
        // File doesn't exist
        setAppSpec("");
        setSpecExists(false);
      }
    } catch (error) {
      console.error("Failed to load spec:", error);
      setSpecExists(false);
    } finally {
      setIsLoading(false);
    }
  }, [currentProject, setAppSpec]);

  useEffect(() => {
    loadSpec();
  }, [loadSpec]);

  // Check if spec regeneration is running when component mounts or project changes
  useEffect(() => {
    const checkStatus = async () => {
      if (!currentProject || statusCheckRef.current || !isBootstrapped()) return;
      statusCheckRef.current = true;

      try {
        const status = await services.specRegeneration.status();
        console.log("[SpecView] Status check on mount:", status);

        if (status.success && status.isRunning) {
          // Something is running - restore state using backend's authoritative phase
          console.log("[SpecView] Spec generation is running - restoring state", { phase: status.currentPhase });
          
          if (!stateRestoredRef.current) {
            setIsCreating(true);
            setIsRegenerating(true);
            stateRestoredRef.current = true;
          }
          
          // Use the backend's currentPhase directly - single source of truth
          if (status.currentPhase) {
            setCurrentPhase(status.currentPhase);
          } else {
            setCurrentPhase("in progress");
          }
          
          // Add resume message to logs if needed
          if (!logsRef.current) {
            const resumeMessage = "[Status] Resumed monitoring existing spec generation process...\n";
            logsRef.current = resumeMessage;
            setLogs(resumeMessage);
          } else if (!logsRef.current.includes("Resumed monitoring")) {
            const resumeMessage = "\n[Status] Resumed monitoring existing spec generation process...\n";
            logsRef.current = logsRef.current + resumeMessage;
            setLogs(logsRef.current);
          }
        } else if (status.success && !status.isRunning) {
          // Not running - clear all state
          setIsCreating(false);
          setIsRegenerating(false);
          setCurrentPhase("");
          stateRestoredRef.current = false;
        }
      } catch (error) {
        console.error("[SpecView] Failed to check status:", error);
      } finally {
        statusCheckRef.current = false;
      }
    };

    // Reset restoration flag when project changes
    stateRestoredRef.current = false;
    checkStatus();
  }, [currentProject]);

  // Sync state when tab becomes visible (user returns to spec editor)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!document.hidden && currentProject && (isCreating || isRegenerating || isGeneratingFeatures)) {
        // Tab became visible and we think we're still generating - verify status from backend
        try {
          if (!isBootstrapped()) return;

          const status = await services.specRegeneration.status();
          console.log("[SpecView] Visibility change - status check:", status);
          
          if (!status.isRunning) {
            // Backend says not running - clear state
            console.log("[SpecView] Visibility change: Backend indicates generation complete - clearing state");
            setIsCreating(false);
            setIsRegenerating(false);
            setIsGeneratingFeatures(false);
            setCurrentPhase("");
            stateRestoredRef.current = false;
            loadSpec();
          } else if (status.currentPhase) {
            // Still running - update phase from backend
            setCurrentPhase(status.currentPhase);
          }
        } catch (error) {
          console.error("[SpecView] Failed to check status on visibility change:", error);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentProject, isCreating, isRegenerating, isGeneratingFeatures, loadSpec]);

  // Periodic status check to ensure state stays in sync (only when we think we're running)
  useEffect(() => {
    if (!currentProject || (!isCreating && !isRegenerating && !isGeneratingFeatures)) return;

    const intervalId = setInterval(async () => {
      try {
        if (!isBootstrapped()) return;

        const status = await services.specRegeneration.status();
        
        if (!status.isRunning) {
          // Backend says not running - clear state
          console.log("[SpecView] Periodic check: Backend indicates generation complete - clearing state");
          setIsCreating(false);
          setIsRegenerating(false);
          setIsGeneratingFeatures(false);
          setCurrentPhase("");
          stateRestoredRef.current = false;
          loadSpec();
        } else if (status.currentPhase && status.currentPhase !== currentPhase) {
          // Still running but phase changed - update from backend
          console.log("[SpecView] Periodic check: Phase updated from backend", { 
            old: currentPhase, 
            new: status.currentPhase 
          });
          setCurrentPhase(status.currentPhase);
        }
      } catch (error) {
        console.error("[SpecView] Periodic status check error:", error);
      }
    }, STATUS_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [currentProject, isCreating, isRegenerating, isGeneratingFeatures, currentPhase, loadSpec]);

  // Subscribe to spec regeneration events
  useEffect(() => {
    if (!isBootstrapped()) return;

    const { unsubscribe } = services.specRegeneration.onEvent((event: SpecRegenerationEvent) => {
      console.log("[SpecView] Regeneration event:", event.type);

      if (event.type === "spec_regeneration_progress") {
        // Extract phase from content if present
        const phaseMatch = event.content.match(/\[Phase:\s*([^\]]+)\]/);
        if (phaseMatch) {
          const phase = phaseMatch[1];
          setCurrentPhase(phase);
          console.log(`[SpecView] Phase updated: ${phase}`);
          
          // If phase is "complete", clear running state immediately
          if (phase === "complete") {
            console.log("[SpecView] Phase is complete - clearing state");
            setIsCreating(false);
            setIsRegenerating(false);
            stateRestoredRef.current = false;
            // Small delay to ensure spec file is written
            setTimeout(() => {
              loadSpec();
            }, SPEC_FILE_WRITE_DELAY);
          }
        }

        // Check for completion indicators in content
        if (event.content.includes("All tasks completed") || 
            event.content.includes("✓ All tasks completed")) {
          // This indicates everything is done - clear state immediately
          console.log("[SpecView] Detected completion in progress message - clearing state");
          setIsCreating(false);
          setIsRegenerating(false);
          setCurrentPhase("");
          stateRestoredRef.current = false;
          setTimeout(() => {
            loadSpec();
          }, SPEC_FILE_WRITE_DELAY);
        }

        // Append progress to logs
        const newLog = logsRef.current + event.content;
        logsRef.current = newLog;
        setLogs(newLog);
        console.log("[SpecView] Progress:", event.content.substring(0, 100));
        
        // Clear error message when we get new progress
        if (errorMessage) {
          setErrorMessage("");
        }
      } else if (event.type === "spec_regeneration_tool") {
        // Check if this is a feature creation tool
        const isFeatureTool = event.tool === "mcp__automaker-tools__UpdateFeatureStatus" || 
                             event.tool === "UpdateFeatureStatus" ||
                             event.tool?.includes("Feature");
        
        if (isFeatureTool) {
          // Ensure we're in feature generation phase
          if (currentPhase !== "feature_generation") {
            setCurrentPhase("feature_generation");
            setIsCreating(true);
            setIsRegenerating(true);
            console.log("[SpecView] Detected feature creation tool - setting phase to feature_generation");
          }
        }
        
        // Log tool usage with details
        const toolInput = event.input ? ` (${JSON.stringify(event.input).substring(0, 100)}...)` : "";
        const toolLog = `\n[Tool] ${event.tool}${toolInput}\n`;
        const newLog = logsRef.current + toolLog;
        logsRef.current = newLog;
        setLogs(newLog);
        console.log("[SpecView] Tool:", event.tool, event.input);
      } else if (event.type === "spec_regeneration_complete") {
        // Add completion message to logs first
        const completionLog = logsRef.current + `\n[Complete] ${event.message}\n`;
        logsRef.current = completionLog;
        setLogs(completionLog);
        
        // --- Completion Detection Logic ---
        // The backend sends explicit signals for completion:
        // 1. "All tasks completed" in the message
        // 2. [Phase: complete] marker in logs
        const isFinalCompletionMessage = event.message?.includes("All tasks completed") ||
                                         event.message === "All tasks completed!" ||
                                         event.message === "All tasks completed";
        
        const hasCompletePhase = logsRef.current.includes("[Phase: complete]");
        
        // Rely solely on explicit backend signals
        const shouldComplete = isFinalCompletionMessage || hasCompletePhase;
        
        if (shouldComplete) {
          // Fully complete - clear all states immediately
          console.log("[SpecView] Final completion detected - clearing state", { 
            isFinalCompletionMessage, 
            hasCompletePhase, 
            message: event.message 
          });
          setIsRegenerating(false);
          setIsCreating(false);
          setIsGeneratingFeatures(false);
          setCurrentPhase("");
          setShowRegenerateDialog(false);
          setShowCreateDialog(false);
          setProjectDefinition("");
          setProjectOverview("");
          setErrorMessage("");
          stateRestoredRef.current = false;
          // Reload the spec to show the new content
          loadSpec();
        } else {
          // Intermediate completion - keep state active for feature generation
          setIsCreating(true);
          setIsRegenerating(true);
          setCurrentPhase("feature_generation");
          console.log("[SpecView] Intermediate completion, continuing with feature generation");
        }
        
        console.log("[SpecView] Spec generation event:", event.message);
      } else if (event.type === "spec_regeneration_error") {
        setIsRegenerating(false);
        setIsCreating(false);
        setIsGeneratingFeatures(false);
        setCurrentPhase("error");
        setErrorMessage(event.error);
        stateRestoredRef.current = false; // Reset restoration flag
        // Add error to logs
        const errorLog = logsRef.current + `\n\n[ERROR] ${event.error}\n`;
        logsRef.current = errorLog;
        setLogs(errorLog);
        console.error("[SpecView] Regeneration error:", event.error);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [loadSpec]);

  // Save spec to file
  const saveSpec = async () => {
    if (!currentProject || !isBootstrapped()) return;

    setIsSaving(true);
    try {
      await services.fileSystem.writeFile(
        `${currentProject.path}/.automaker/app_spec.txt`,
        appSpec
      );
      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save spec:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (value: string) => {
    setAppSpec(value);
    setHasChanges(true);
  };

  const handleRegenerate = async () => {
    if (!currentProject || !projectDefinition.trim() || !isBootstrapped()) return;

    setIsRegenerating(true);
    setCurrentPhase("initialization");
    setErrorMessage("");
    // Reset logs when starting new regeneration
    logsRef.current = "";
    setLogs("");
    console.log("[SpecView] Starting spec regeneration");
    try {
      const result = await services.specRegeneration.generate(
        currentProject.path,
        projectDefinition.trim()
      );

      if (!result.success) {
        const errorMsg = result.error || "Unknown error";
        console.error("[SpecView] Failed to start regeneration:", errorMsg);
        setIsRegenerating(false);
        setCurrentPhase("error");
        setErrorMessage(errorMsg);
        const errorLog = `[Error] Failed to start regeneration: ${errorMsg}\n`;
        logsRef.current = errorLog;
        setLogs(errorLog);
      }
      // If successful, we'll wait for the events to update the state
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[SpecView] Failed to regenerate spec:", errorMsg);
      setIsRegenerating(false);
      setCurrentPhase("error");
      setErrorMessage(errorMsg);
      const errorLog = `[Error] Failed to regenerate spec: ${errorMsg}\n`;
      logsRef.current = errorLog;
      setLogs(errorLog);
    }
  };

  const handleCreateSpec = async () => {
    if (!currentProject || !projectOverview.trim() || !isBootstrapped()) return;

    setIsCreating(true);
    setShowCreateDialog(false);
    setCurrentPhase("initialization");
    setErrorMessage("");
    // Reset logs when starting new generation
    logsRef.current = "";
    setLogs("");
    console.log("[SpecView] Starting spec creation, generateFeatures:", generateFeatures);
    try {
      const result = await services.specRegeneration.create(
        currentProject.path,
        projectOverview.trim(),
        generateFeatures
      );

      if (!result.success) {
        const errorMsg = result.error || "Unknown error";
        console.error("[SpecView] Failed to start spec creation:", errorMsg);
        setIsCreating(false);
        setCurrentPhase("error");
        setErrorMessage(errorMsg);
        const errorLog = `[Error] Failed to start spec creation: ${errorMsg}\n`;
        logsRef.current = errorLog;
        setLogs(errorLog);
      }
      // If successful, we'll wait for the events to update the state
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[SpecView] Failed to create spec:", errorMsg);
      setIsCreating(false);
      setCurrentPhase("error");
      setErrorMessage(errorMsg);
      const errorLog = `[Error] Failed to create spec: ${errorMsg}\n`;
      logsRef.current = errorLog;
      setLogs(errorLog);
    }
  };

  const handleGenerateFeatures = async () => {
    if (!currentProject || !isBootstrapped()) return;

    setIsGeneratingFeatures(true);
    setShowRegenerateDialog(false);
    setCurrentPhase("initialization");
    setErrorMessage("");
    // Reset logs when starting feature generation
    logsRef.current = "";
    setLogs("");
    console.log("[SpecView] Starting feature generation from existing spec");
    try {
      const result = await services.specRegeneration.generateFeatures(
        currentProject.path
      );

      if (!result.success) {
        const errorMsg = result.error || "Unknown error";
        console.error("[SpecView] Failed to start feature generation:", errorMsg);
        setIsGeneratingFeatures(false);
        setCurrentPhase("error");
        setErrorMessage(errorMsg);
        const errorLog = `[Error] Failed to start feature generation: ${errorMsg}\n`;
        logsRef.current = errorLog;
        setLogs(errorLog);
      }
      // If successful, we'll wait for the events to update the state
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[SpecView] Failed to generate features:", errorMsg);
      setIsGeneratingFeatures(false);
      setCurrentPhase("error");
      setErrorMessage(errorMsg);
      const errorLog = `[Error] Failed to generate features: ${errorMsg}\n`;
      logsRef.current = errorLog;
      setLogs(errorLog);
    }
  };

  if (!currentProject) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="spec-view-no-project"
      >
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="spec-view-loading"
      >
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show empty state when no spec exists (isCreating is handled by bottom-right indicator in sidebar)
  if (!specExists) {
    return (
      <div
        className="flex-1 flex flex-col overflow-hidden content-bg"
        data-testid="spec-view-empty"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <div>
              <h1 className="text-xl font-bold">App Specification</h1>
              <p className="text-sm text-muted-foreground">
                {currentProject.path}/.automaker/app_spec.txt
              </p>
            </div>
          </div>
          {(isCreating || isRegenerating) && (
            <div className="flex items-center gap-3 px-6 py-3.5 rounded-xl bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/30 shadow-lg backdrop-blur-md">
              <div className="relative">
                <Loader2 className="w-5 h-5 animate-spin text-primary flex-shrink-0" />
                <div className="absolute inset-0 w-5 h-5 animate-ping text-primary/20" />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-sm font-semibold text-primary leading-tight tracking-tight">
                  {isCreating ? "Generating Specification" : "Regenerating Specification"}
                </span>
                {currentPhase && (
                  <span className="text-xs text-muted-foreground/90 leading-tight font-medium">
                    {currentPhase === "initialization" && "Initializing..."}
                    {currentPhase === "setup" && "Setting up tools..."}
                    {currentPhase === "analysis" && "Analyzing project structure..."}
                    {currentPhase === "spec_complete" && "Spec created! Generating features..."}
                    {currentPhase === "feature_generation" && "Creating features from roadmap..."}
                    {currentPhase === "complete" && "Complete!"}
                    {currentPhase === "error" && "Error occurred"}
                    {!["initialization", "setup", "analysis", "spec_complete", "feature_generation", "complete", "error"].includes(currentPhase) && currentPhase}
                  </span>
                )}
              </div>
            </div>
          )}
          {errorMessage && (
            <div className="flex items-center gap-2 text-destructive">
              <span className="text-sm font-medium">Error: {errorMessage}</span>
            </div>
          )}
        </div>

        {/* Empty State */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="mb-6 flex justify-center">
              <div className="p-4 rounded-full bg-primary/10">
                {isCreating ? (
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                ) : (
                  <FilePlus2 className="w-12 h-12 text-primary" />
                )}
              </div>
            </div>
            <h2 className="text-2xl font-semibold mb-4">
              {isCreating ? (
                <>
                  <div className="mb-4">
                    <span>Generating App Specification</span>
                  </div>
                  {currentPhase && (
                    <div className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/30 shadow-lg backdrop-blur-md inline-flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary text-center tracking-tight">
                        {currentPhase === "initialization" && "Initializing..."}
                        {currentPhase === "setup" && "Setting up tools..."}
                        {currentPhase === "analysis" && "Analyzing project structure..."}
                        {currentPhase === "spec_complete" && "Spec created! Generating features..."}
                        {currentPhase === "feature_generation" && "Creating features from roadmap..."}
                        {currentPhase === "complete" && "Complete!"}
                        {currentPhase === "error" && "Error occurred"}
                        {!["initialization", "setup", "analysis", "spec_complete", "feature_generation", "complete", "error"].includes(currentPhase) && currentPhase}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                "No App Specification Found"
              )}
            </h2>
            <p className="text-muted-foreground mb-6">
              {isCreating
                ? currentPhase === "feature_generation"
                  ? "The app specification has been created! Now generating features from the implementation roadmap..."
                  : "We're analyzing your project and generating a comprehensive specification. This may take a few moments..."
                : "Create an app specification to help our system understand your project. We'll analyze your codebase and generate a comprehensive spec based on your description."}
            </p>
            {errorMessage && (
              <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive font-medium">Error:</p>
                <p className="text-sm text-destructive">{errorMessage}</p>
              </div>
            )}
            {!isCreating && (
              <div className="flex gap-2 justify-center">
                <Button
                  size="lg"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <FilePlus2 className="w-5 h-5 mr-2" />
                  Create app_spec
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Create Dialog */}
        <Dialog 
          open={showCreateDialog} 
          onOpenChange={(open) => {
            if (!open && !isCreating) {
              setShowCreateDialog(false);
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create App Specification</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                We didn&apos;t find an app_spec.txt file. Let us help you generate your app_spec.txt
                to help describe your project for our system. We&apos;ll analyze your project&apos;s
                tech stack and create a comprehensive specification.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Project Overview
                </label>
                <p className="text-xs text-muted-foreground">
                  Describe what your project does and what features you want to build.
                  Be as detailed as you want - this will help us create a better specification.
                </p>
                <textarea
                  className="w-full h-48 p-3 rounded-md border border-border bg-background font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  value={projectOverview}
                  onChange={(e) => setProjectOverview(e.target.value)}
                  placeholder="e.g., A project management tool that allows teams to track tasks, manage sprints, and visualize progress through kanban boards. It should support user authentication, real-time updates, and file attachments..."
                  autoFocus
                  disabled={isCreating}
                />
              </div>

              <div className="flex items-start space-x-3 pt-2">
                <Checkbox
                  id="generate-features"
                  checked={generateFeatures}
                  onCheckedChange={(checked) => setGenerateFeatures(checked === true)}
                  disabled={isCreating}
                />
                <div className="space-y-1">
                  <label
                    htmlFor="generate-features"
                    className={`text-sm font-medium ${isCreating ? "" : "cursor-pointer"}`}
                  >
                    Generate feature list
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Automatically create features in the features folder from the
                    implementation roadmap after the spec is generated.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowCreateDialog(false)}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <HotkeyButton
                onClick={handleCreateSpec}
                disabled={!projectOverview.trim() || isCreating}
                hotkey={{ key: "Enter", cmdCtrl: true }}
                hotkeyActive={showCreateDialog && !isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Spec
                  </>
                )}
              </HotkeyButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden content-bg"
      data-testid="spec-view"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">App Specification</h1>
            <p className="text-sm text-muted-foreground">
              {currentProject.path}/.automaker/app_spec.txt
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {(isRegenerating || isCreating || isGeneratingFeatures) && (
            <div className="flex items-center gap-3 px-6 py-3.5 rounded-xl bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/30 shadow-lg backdrop-blur-md">
              <div className="relative">
                <Loader2 className="w-5 h-5 animate-spin text-primary flex-shrink-0" />
                <div className="absolute inset-0 w-5 h-5 animate-ping text-primary/20" />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-sm font-semibold text-primary leading-tight tracking-tight">
                  {isGeneratingFeatures ? "Generating Features" : isCreating ? "Generating Specification" : "Regenerating Specification"}
                </span>
                {currentPhase && (
                  <span className="text-xs text-muted-foreground/90 leading-tight font-medium">
                    {currentPhase === "initialization" && "Initializing..."}
                    {currentPhase === "setup" && "Setting up tools..."}
                    {currentPhase === "analysis" && "Analyzing project structure..."}
                    {currentPhase === "spec_complete" && "Spec created! Generating features..."}
                    {currentPhase === "feature_generation" && "Creating features from roadmap..."}
                    {currentPhase === "complete" && "Complete!"}
                    {currentPhase === "error" && "Error occurred"}
                    {!["initialization", "setup", "analysis", "spec_complete", "feature_generation", "complete", "error"].includes(currentPhase) && currentPhase}
                  </span>
                )}
              </div>
            </div>
          )}
          {errorMessage && (
            <div className="flex items-center gap-3 px-6 py-3.5 rounded-xl bg-gradient-to-r from-destructive/15 to-destructive/5 border border-destructive/30 shadow-lg backdrop-blur-md">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-sm font-semibold text-destructive leading-tight tracking-tight">Error</span>
                <span className="text-xs text-destructive/90 leading-tight font-medium">{errorMessage}</span>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowRegenerateDialog(true)}
              disabled={isRegenerating || isCreating || isGeneratingFeatures}
              data-testid="regenerate-spec"
            >
              {isRegenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {isRegenerating ? "Regenerating..." : "Regenerate"}
            </Button>
            <Button
              size="sm"
              onClick={saveSpec}
              disabled={!hasChanges || isSaving || isCreating || isRegenerating || isGeneratingFeatures}
              data-testid="save-spec"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? "Saving..." : hasChanges ? "Save Changes" : "Saved"}
            </Button>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 p-4 overflow-hidden">
        <Card className="h-full overflow-hidden">
          <XmlSyntaxEditor
            value={appSpec}
            onChange={handleChange}
            placeholder="Write your app specification here..."
            data-testid="spec-editor"
          />
        </Card>
      </div>

      {/* Regenerate Dialog */}
      <Dialog 
        open={showRegenerateDialog} 
        onOpenChange={(open) => {
          if (!open && !isRegenerating) {
            setShowRegenerateDialog(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Regenerate App Specification</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              We will regenerate your app spec based on a short project definition and the
              current tech stack found in your project. The agent will analyze your codebase
              to understand your existing technologies and create a comprehensive specification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Describe your project
              </label>
              <p className="text-xs text-muted-foreground">
                Provide a clear description of what your app should do. Be as detailed as you
                want - the more context you provide, the more comprehensive the spec will be.
              </p>
              <textarea
                className="w-full h-40 p-3 rounded-md border border-border bg-background font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                value={projectDefinition}
                onChange={(e) => setProjectDefinition(e.target.value)}
                placeholder="e.g., A task management app where users can create projects, add tasks with due dates, assign tasks to team members, track progress with a kanban board, and receive notifications for upcoming deadlines..."
                disabled={isRegenerating}
              />
            </div>
          </div>

          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="outline"
              onClick={handleGenerateFeatures}
              disabled={isRegenerating || isGeneratingFeatures}
              title="Generate features from the existing app_spec.txt without regenerating the spec"
            >
              {isGeneratingFeatures ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <ListPlus className="w-4 h-4 mr-2" />
                  Generate Features
                </>
              )}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowRegenerateDialog(false)}
                disabled={isRegenerating || isGeneratingFeatures}
              >
                Cancel
              </Button>
              <HotkeyButton
                onClick={handleRegenerate}
                disabled={!projectDefinition.trim() || isRegenerating || isGeneratingFeatures}
                hotkey={{ key: "Enter", cmdCtrl: true }}
                hotkeyActive={showRegenerateDialog && !isRegenerating && !isGeneratingFeatures}
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Regenerate Spec
                  </>
                )}
              </HotkeyButton>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
