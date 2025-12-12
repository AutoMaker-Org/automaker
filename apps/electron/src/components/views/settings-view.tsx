"use client";

import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Label } from "@/components/ui/label";
import {
  Key,
  Palette,
  Terminal,
  Atom,
  FlaskConical,
  Trash2,
  Settings2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

import { useCliStatus } from "./settings-view/hooks/use-cli-status";
import { useScrollTracking } from "@/hooks/use-scroll-tracking";
import { SettingsHeader } from "./settings-view/components/settings-header";
import { KeyboardMapDialog } from "./settings-view/components/keyboard-map-dialog";
import { DeleteProjectDialog } from "./settings-view/components/delete-project-dialog";
import { SettingsNavigation } from "./settings-view/components/settings-navigation";
import { ApiKeysSection } from "./settings-view/api-keys/api-keys-section";
import { ClaudeCliStatus } from "./settings-view/cli-status/claude-cli-status";
import { CodexCliStatus } from "./settings-view/cli-status/codex-cli-status";
import { AppearanceSection } from "./settings-view/appearance/appearance-section";
import { KeyboardShortcutsSection } from "./settings-view/keyboard-shortcuts/keyboard-shortcuts-section";
import { FeatureDefaultsSection } from "./settings-view/feature-defaults/feature-defaults-section";
import { DangerZoneSection } from "./settings-view/danger-zone/danger-zone-section";
import type {
  Project as SettingsProject,
  Theme,
} from "./settings-view/shared/types";
import type { Project as ElectronProject } from "@/lib/electron";

// Navigation items for the side panel
const NAV_ITEMS = [
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "claude", label: "Claude", icon: Terminal },
  { id: "codex", label: "Codex", icon: Atom },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "audio", label: "Audio", icon: Volume2 },
  { id: "keyboard", label: "Keyboard Shortcuts", icon: Settings2 },
  { id: "defaults", label: "Feature Defaults", icon: FlaskConical },
  { id: "danger", label: "Danger Zone", icon: Trash2 },
];

export function SettingsView() {
  const {
    theme,
    setTheme,
    setProjectTheme,
    defaultSkipTests,
    setDefaultSkipTests,
    useWorktrees,
    setUseWorktrees,
    showProfilesOnly,
    setShowProfilesOnly,
    muteDoneSound,
    setMuteDoneSound,
    currentProject,
    moveProjectToTrash,
  } = useAppStore();

  // Convert electron Project to settings-view Project type
  const convertProject = (
    project: ElectronProject | null
  ): SettingsProject | null => {
    if (!project) return null;
    return {
      id: project.id,
      name: project.name,
      path: project.path,
      theme: project.theme as Theme | undefined,
    };
  };

  const settingsProject = convertProject(currentProject);

  // Compute the effective theme for the current project
  const effectiveTheme = (settingsProject?.theme || theme) as Theme;

  // Handler to set theme - saves to project if one is selected, otherwise to global
  const handleSetTheme = (newTheme: typeof theme) => {
    if (currentProject) {
      setProjectTheme(currentProject.id, newTheme);
    } else {
      setTheme(newTheme);
    }
  };

  // Use CLI status hook
  const {
    claudeCliStatus,
    codexCliStatus,
    isCheckingClaudeCli,
    isCheckingCodexCli,
    handleRefreshClaudeCli,
    handleRefreshCodexCli,
  } = useCliStatus();

  // Use scroll tracking hook
  const { activeSection, scrollToSection, scrollContainerRef } =
    useScrollTracking({
      items: NAV_ITEMS,
      filterFn: (item) => item.id !== "danger" || !!currentProject,
      initialSection: "api-keys",
    });

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showKeyboardMapDialog, setShowKeyboardMapDialog] = useState(false);

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden content-bg"
      data-testid="settings-view"
    >
      {/* Header Section */}
      <SettingsHeader />

      {/* Content Area with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sticky Side Navigation */}
        <SettingsNavigation
          navItems={NAV_ITEMS}
          activeSection={activeSection}
          currentProject={currentProject}
          onNavigate={scrollToSection}
        />

        {/* Scrollable Content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto space-y-6 pb-96">
            {/* API Keys Section */}
            <ApiKeysSection />

            {/* Claude CLI Status Section */}
            {claudeCliStatus && (
              <ClaudeCliStatus
                status={claudeCliStatus}
                isChecking={isCheckingClaudeCli}
                onRefresh={handleRefreshClaudeCli}
              />
            )}

            {/* Codex CLI Status Section */}
            {codexCliStatus && (
              <CodexCliStatus
                status={codexCliStatus}
                isChecking={isCheckingCodexCli}
                onRefresh={handleRefreshCodexCli}
              />
            )}

            {/* Appearance Section */}
            <AppearanceSection
              effectiveTheme={effectiveTheme}
              currentProject={settingsProject}
              onThemeChange={handleSetTheme}
            />


            {/* Keyboard Shortcuts Section */}
            <KeyboardShortcutsSection
              onOpenKeyboardMap={() => setShowKeyboardMapDialog(true)}
            />

            {/* Audio Section */}
            <div
              id="audio"
              className="rounded-xl border border-border bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
            >
              <div className="p-6 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Volume2 className="w-5 h-5 text-brand-500" />
                  <h2 className="text-lg font-semibold text-foreground">
                    Audio
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Configure audio and notification settings.
                </p>
              </div>
              <div className="p-6 space-y-4">
                {/* Mute Done Sound Setting */}
                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="mute-done-sound"
                      checked={muteDoneSound}
                      onCheckedChange={(checked) =>
                        setMuteDoneSound(checked === true)
                      }
                      className="mt-0.5"
                      data-testid="mute-done-sound-checkbox"
                    />
                    <div className="space-y-1">
                      <Label
                        htmlFor="mute-done-sound"
                        className="text-foreground cursor-pointer font-medium flex items-center gap-2"
                      >
                        <VolumeX className="w-4 h-4 text-brand-500" />
                        Mute notification sound when agents complete
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        When enabled, disables the &quot;ding&quot; sound that
                        plays when an agent completes a feature. The feature
                        will still move to the completed column, but without
                        audio notification.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature Defaults Section */}
            <FeatureDefaultsSection
              showProfilesOnly={showProfilesOnly}
              defaultSkipTests={defaultSkipTests}
              useWorktrees={useWorktrees}
              onShowProfilesOnlyChange={setShowProfilesOnly}
              onDefaultSkipTestsChange={setDefaultSkipTests}
              onUseWorktreesChange={setUseWorktrees}
            />

            {/* Danger Zone Section - Only show when a project is selected */}
            <DangerZoneSection
              project={settingsProject}
              onDeleteClick={() => setShowDeleteDialog(true)}
            />
          </div>
        </div>
      </div>

      {/* Keyboard Map Dialog */}
      <KeyboardMapDialog
        open={showKeyboardMapDialog}
        onOpenChange={setShowKeyboardMapDialog}
      />

      {/* Delete Project Confirmation Dialog */}
      <DeleteProjectDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        project={currentProject}
        onConfirm={moveProjectToTrash}
      />
    </div>
  );
}
