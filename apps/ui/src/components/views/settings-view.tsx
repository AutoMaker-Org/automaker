import { useState } from 'react';
import { useAppStore } from '@/store/app-store';

import { useCliStatus, useSettingsView } from './settings-view/hooks';
import { NAV_ITEMS } from './settings-view/config/navigation';
import { SettingsHeader } from './settings-view/components/settings-header';
import { KeyboardMapDialog } from './settings-view/components/keyboard-map-dialog';
import { DeleteProjectDialog } from './settings-view/components/delete-project-dialog';
import { SettingsNavigation } from './settings-view/components/settings-navigation';
import { ApiKeysSection } from './settings-view/api-keys/api-keys-section';
import { ClaudeUsageSection } from './settings-view/api-keys/claude-usage-section';
import { ClaudeCliStatus } from './settings-view/cli-status/claude-cli-status';
import { ClaudeMdSettings } from './settings-view/claude/claude-md-settings';
import { AIEnhancementSection } from './settings-view/ai-enhancement';
import { AppearanceSection } from './settings-view/appearance/appearance-section';
import { TerminalSection } from './settings-view/terminal/terminal-section';
import { AudioSection } from './settings-view/audio/audio-section';
import { KeyboardShortcutsSection } from './settings-view/keyboard-shortcuts/keyboard-shortcuts-section';
import { FeatureDefaultsSection } from './settings-view/feature-defaults/feature-defaults-section';
import { DangerZoneSection } from './settings-view/danger-zone/danger-zone-section';
import { MCPServersSection } from './settings-view/mcp-servers';
import type { Project as SettingsProject, Theme } from './settings-view/shared/types';
import type { Project as ElectronProject } from '@/lib/electron';

export function SettingsView() {
  const {
    theme,
    setTheme,
    setProjectTheme,
    defaultSkipTests,
    setDefaultSkipTests,
    enableDependencyBlocking,
    setEnableDependencyBlocking,
    useWorktrees,
    setUseWorktrees,
    showProfilesOnly,
    setShowProfilesOnly,
    muteDoneSound,
    setMuteDoneSound,
    currentProject,
    moveProjectToTrash,
    defaultPlanningMode,
    setDefaultPlanningMode,
    defaultRequirePlanApproval,
    setDefaultRequirePlanApproval,
    defaultAIProfileId,
    setDefaultAIProfileId,
    aiProfiles,
    apiKeys,
    validationModel,
    setValidationModel,
    autoLoadClaudeMd,
    setAutoLoadClaudeMd,
    enableSandboxMode,
    setEnableSandboxMode,
  } = useAppStore();

  // Hide usage tracking when using API key (only show for Claude Code CLI users)
  // Also hide on Windows for now (CLI usage command not supported)
  const isWindows =
    typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('win');
  const showUsageTracking = !apiKeys.anthropic && !isWindows;

  // Convert electron Project to settings-view Project type
  const convertProject = (project: ElectronProject | null): SettingsProject | null => {
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

  // Handler to set theme - always updates global theme (user's preference),
  // and also sets per-project theme if a project is selected
  const handleSetTheme = (newTheme: typeof theme) => {
    // Always update global theme so user's preference persists across all projects
    setTheme(newTheme);
    // Also set per-project theme if a project is selected
    if (currentProject) {
      setProjectTheme(currentProject.id, newTheme);
    }
  };

  // Use CLI status hook
  const { claudeCliStatus, isCheckingClaudeCli, handleRefreshClaudeCli } = useCliStatus();

  // Use settings view navigation hook
  const { activeView, navigateTo } = useSettingsView();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showKeyboardMapDialog, setShowKeyboardMapDialog] = useState(false);

  // Render the active section based on current view
  const renderActiveSection = () => {
    switch (activeView) {
      case 'claude':
        return (
          <div className="space-y-6">
            <ClaudeCliStatus
              status={claudeCliStatus}
              isChecking={isCheckingClaudeCli}
              onRefresh={handleRefreshClaudeCli}
            />
            <ClaudeMdSettings
              autoLoadClaudeMd={autoLoadClaudeMd}
              onAutoLoadClaudeMdChange={setAutoLoadClaudeMd}
              enableSandboxMode={enableSandboxMode}
              onEnableSandboxModeChange={setEnableSandboxMode}
            />
            {showUsageTracking && <ClaudeUsageSection />}
          </div>
        );
      case 'mcp-servers':
        return <MCPServersSection />;
      case 'ai-enhancement':
        return <AIEnhancementSection />;
      case 'appearance':
        return (
          <AppearanceSection
            effectiveTheme={effectiveTheme}
            currentProject={settingsProject}
            onThemeChange={handleSetTheme}
          />
        );
      case 'terminal':
        return <TerminalSection />;
      case 'keyboard':
        return (
          <KeyboardShortcutsSection onOpenKeyboardMap={() => setShowKeyboardMapDialog(true)} />
        );
      case 'audio':
        return (
          <AudioSection muteDoneSound={muteDoneSound} onMuteDoneSoundChange={setMuteDoneSound} />
        );
      case 'defaults':
        return (
          <FeatureDefaultsSection
            showProfilesOnly={showProfilesOnly}
            defaultSkipTests={defaultSkipTests}
            enableDependencyBlocking={enableDependencyBlocking}
            useWorktrees={useWorktrees}
            defaultPlanningMode={defaultPlanningMode}
            defaultRequirePlanApproval={defaultRequirePlanApproval}
            defaultAIProfileId={defaultAIProfileId}
            aiProfiles={aiProfiles}
            validationModel={validationModel}
            onShowProfilesOnlyChange={setShowProfilesOnly}
            onDefaultSkipTestsChange={setDefaultSkipTests}
            onEnableDependencyBlockingChange={setEnableDependencyBlocking}
            onUseWorktreesChange={setUseWorktrees}
            onDefaultPlanningModeChange={setDefaultPlanningMode}
            onDefaultRequirePlanApprovalChange={setDefaultRequirePlanApproval}
            onDefaultAIProfileIdChange={setDefaultAIProfileId}
            onValidationModelChange={setValidationModel}
          />
        );
      case 'danger':
        return (
          <DangerZoneSection
            project={settingsProject}
            onDeleteClick={() => setShowDeleteDialog(true)}
          />
        );
      default:
        return <ApiKeysSection />;
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden content-bg" data-testid="settings-view">
      {/* Header Section */}
      <SettingsHeader />

      {/* Content Area with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Side Navigation - No longer scrolls, just switches views */}
        <SettingsNavigation
          navItems={NAV_ITEMS}
          activeSection={activeView}
          currentProject={currentProject}
          onNavigate={navigateTo}
        />

        {/* Content Panel - Shows only the active section */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">{renderActiveSection()}</div>
        </div>
      </div>

      {/* Keyboard Map Dialog */}
      <KeyboardMapDialog open={showKeyboardMapDialog} onOpenChange={setShowKeyboardMapDialog} />

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
