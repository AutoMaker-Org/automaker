import { useState, useEffect } from 'react';
import { useSearch } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';

import { useSettingsView, type SettingsViewId } from './settings-view/hooks';
import { NAV_ITEMS } from './settings-view/config/navigation';
import { SettingsHeader } from './settings-view/components/settings-header';
import { KeyboardMapDialog } from './settings-view/components/keyboard-map-dialog';
import { DeleteProjectDialog } from './settings-view/components/delete-project-dialog';
import { SettingsNavigation } from './settings-view/components/settings-navigation';
import { ApiKeysSection } from './settings-view/api-keys/api-keys-section';
import { ModelDefaultsSection } from './settings-view/model-defaults';
import { AppearanceSection } from './settings-view/appearance/appearance-section';
import { TerminalSection } from './settings-view/terminal/terminal-section';
import { AudioSection } from './settings-view/audio/audio-section';
import { KeyboardShortcutsSection } from './settings-view/keyboard-shortcuts/keyboard-shortcuts-section';
import { FeatureDefaultsSection } from './settings-view/feature-defaults/feature-defaults-section';
import { WorktreesSection } from './settings-view/worktrees';
import { DangerZoneSection } from './settings-view/danger-zone/danger-zone-section';
import { AccountSection } from './settings-view/account';
import { SecuritySection } from './settings-view/security';
import {
  ClaudeSettingsTab,
  CursorSettingsTab,
  CodexSettingsTab,
  OpencodeSettingsTab,
} from './settings-view/providers';
import { MCPServersSection } from './settings-view/mcp-servers';
import { PromptCustomizationSection } from './settings-view/prompts';
import { LanguageSection } from './settings-view/language/language-section';
import type { Project as SettingsProject, Theme } from './settings-view/shared/types';
import type { Project as ElectronProject } from '@/lib/electron';

// Breakpoint constant for mobile (matches Tailwind lg breakpoint)
const LG_BREAKPOINT = 1024;

export function SettingsView() {
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
    enableAiCommitMessages,
    setEnableAiCommitMessages,
    useWorktrees,
    setUseWorktrees,
    muteDoneSound,
    setMuteDoneSound,
    currentProject,
    moveProjectToTrash,
    defaultPlanningMode,
    setDefaultPlanningMode,
    defaultRequirePlanApproval,
    setDefaultRequirePlanApproval,
    defaultFeatureModel,
    setDefaultFeatureModel,
    autoLoadClaudeMd,
    setAutoLoadClaudeMd,
    promptCustomization,
    setPromptCustomization,
    languageInstruction,
    setLanguageInstruction,
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
      icon: project.icon,
      customIconPath: project.customIconPath,
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

  // Get initial view from URL search params
  const { view: initialView } = useSearch({ from: '/settings' });

  // Use settings view navigation hook
  const { activeView, navigateTo } = useSettingsView({ initialView });

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

  // Mobile navigation state - default to showing on desktop, hidden on mobile
  const [showNavigation, setShowNavigation] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= LG_BREAKPOINT;
    }
    return true; // Default to showing on SSR
  });

  // Auto-close navigation on mobile when a section is selected
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < LG_BREAKPOINT) {
      setShowNavigation(false);
    }
  }, [activeView]);

  // Handle window resize to show/hide navigation appropriately
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= LG_BREAKPOINT) {
        setShowNavigation(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      case 'language':
        return (
          <LanguageSection
            languageInstruction={languageInstruction}
            onLanguageInstructionChange={setLanguageInstruction}
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
            defaultSkipTests={defaultSkipTests}
            enableDependencyBlocking={enableDependencyBlocking}
            skipVerificationInAutoMode={skipVerificationInAutoMode}
            defaultPlanningMode={defaultPlanningMode}
            defaultRequirePlanApproval={defaultRequirePlanApproval}
            enableAiCommitMessages={enableAiCommitMessages}
            defaultFeatureModel={defaultFeatureModel}
            onDefaultSkipTestsChange={setDefaultSkipTests}
            onEnableDependencyBlockingChange={setEnableDependencyBlocking}
            onSkipVerificationInAutoModeChange={setSkipVerificationInAutoMode}
            onDefaultPlanningModeChange={setDefaultPlanningMode}
            onDefaultRequirePlanApprovalChange={setDefaultRequirePlanApproval}
            onEnableAiCommitMessagesChange={setEnableAiCommitMessages}
            onDefaultFeatureModelChange={setDefaultFeatureModel}
          />
        );
      case 'worktrees':
        return (
          <WorktreesSection useWorktrees={useWorktrees} onUseWorktreesChange={setUseWorktrees} />
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
    <div className="flex-1 flex flex-col overflow-hidden content-bg" data-testid="settings-view">
      {/* Header Section */}
      <SettingsHeader
        showNavigation={showNavigation}
        onToggleNavigation={() => setShowNavigation(!showNavigation)}
      />

      {/* Content Area with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Side Navigation - Overlay on mobile, sidebar on desktop */}
        <SettingsNavigation
          navItems={NAV_ITEMS}
          activeSection={activeView}
          currentProject={currentProject}
          onNavigate={handleNavigate}
          isOpen={showNavigation}
          onClose={() => setShowNavigation(false)}
        />

        {/* Content Panel - Shows only the active section */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
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
