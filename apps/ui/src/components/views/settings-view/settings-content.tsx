import { useState } from 'react';
import { useAppStore } from '@/store/app-store';

import { useSettingsView, type SettingsViewId } from './hooks';
import { NAV_ITEMS } from './config/navigation';
import { KeyboardMapDialog } from './components/keyboard-map-dialog';
import { DeleteProjectDialog } from './components/delete-project-dialog';
import { SettingsNavigation } from './components/settings-navigation';
import { ApiKeysSection } from './api-keys/api-keys-section';
import { ModelDefaultsSection } from './model-defaults';
import { AppearanceSection } from './appearance/appearance-section';
import { TerminalSection } from './terminal/terminal-section';
import { AudioSection } from './audio/audio-section';
import { KeyboardShortcutsSection } from './keyboard-shortcuts/keyboard-shortcuts-section';
import { FeatureDefaultsSection } from './feature-defaults/feature-defaults-section';
import { DangerZoneSection } from './danger-zone/danger-zone-section';
import { AccountSection } from './account';
import { SecuritySection } from './security';
import {
  ClaudeSettingsTab,
  CursorSettingsTab,
  CodexSettingsTab,
  OpencodeSettingsTab,
} from './providers';
import { MCPServersSection } from './mcp-servers';
import { PromptCustomizationSection } from './prompts';
import type { Project as SettingsProject, Theme } from './shared/types';
import type { Project as ElectronProject } from '@/lib/electron';

interface SettingsContentProps {
  compact?: boolean;
}

export function SettingsContent({ compact = false }: SettingsContentProps) {
  const {
    theme,
    setTheme,
    setProjectTheme,
    defaultSkipTests,
    setDefaultSkipTests,
    enableDependencyBlocking,
    setEnableDependencyBlocking,
    skipVerificationInAutoMode,
    setSkipVerificationInAutoMode,
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
    autoLoadClaudeMd,
    setAutoLoadClaudeMd,
    promptCustomization,
    setPromptCustomization,
    skipSandboxWarning,
    setSkipSandboxWarning,
  } = useAppStore();

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

  // Use settings view navigation hook
  const { activeView, navigateTo } = useSettingsView();

  // Handle navigation - if navigating to 'providers', default to 'claude-provider'
  const handleNavigate = (viewId: SettingsViewId) => {
    if (viewId === 'providers') {
      navigateTo('claude-provider');
    } else {
      navigateTo(viewId);
    }
  };

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showKeyboardMapDialog, setShowKeyboardMapDialog] = useState(false);

  // Render the active section based on current view
  const renderActiveSection = () => {
    switch (activeView) {
      case 'claude-provider':
        return <ClaudeSettingsTab />;
      case 'cursor-provider':
        return <CursorSettingsTab />;
      case 'codex-provider':
        return <CodexSettingsTab />;
      case 'opencode-provider':
        return <OpencodeSettingsTab />;
      case 'providers':
      case 'claude': // Backwards compatibility - redirect to claude-provider
        return <ClaudeSettingsTab />;
      case 'mcp-servers':
        return <MCPServersSection />;
      case 'prompts':
        return (
          <PromptCustomizationSection
            promptCustomization={promptCustomization}
            onPromptCustomizationChange={setPromptCustomization}
          />
        );
      case 'model-defaults':
        return <ModelDefaultsSection />;
      case 'appearance':
        return (
          <AppearanceSection
            effectiveTheme={effectiveTheme as any}
            currentProject={settingsProject as any}
            onThemeChange={(theme) => handleSetTheme(theme as any)}
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
            skipVerificationInAutoMode={skipVerificationInAutoMode}
            useWorktrees={useWorktrees}
            defaultPlanningMode={defaultPlanningMode}
            defaultRequirePlanApproval={defaultRequirePlanApproval}
            defaultAIProfileId={defaultAIProfileId}
            aiProfiles={aiProfiles}
            onShowProfilesOnlyChange={setShowProfilesOnly}
            onDefaultSkipTestsChange={setDefaultSkipTests}
            onEnableDependencyBlockingChange={setEnableDependencyBlocking}
            onSkipVerificationInAutoModeChange={setSkipVerificationInAutoMode}
            onUseWorktreesChange={setUseWorktrees}
            onDefaultPlanningModeChange={setDefaultPlanningMode}
            onDefaultRequirePlanApprovalChange={setDefaultRequirePlanApproval}
            onDefaultAIProfileIdChange={setDefaultAIProfileId}
          />
        );
      case 'account':
        return <AccountSection />;
      case 'security':
        return (
          <SecuritySection
            skipSandboxWarning={skipSandboxWarning}
            onSkipSandboxWarningChange={setSkipSandboxWarning}
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
    <>
      {/* Content Area with Sidebar */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Side Navigation - No longer scrolls, just switches views */}
        <SettingsNavigation
          navItems={NAV_ITEMS}
          activeSection={activeView}
          currentProject={currentProject}
          onNavigate={handleNavigate}
          compact={compact}
        />

        {/* Content Panel - Shows only the active section */}
        <div className={`flex-1 overflow-y-auto ${compact ? 'p-4' : 'p-8'}`}>
          <div className={compact ? 'max-w-3xl mx-auto' : 'max-w-4xl mx-auto'}>
            {renderActiveSection()}
          </div>
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
    </>
  );
}
