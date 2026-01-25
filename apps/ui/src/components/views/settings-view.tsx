import { useState, useEffect } from 'react';
import { useSearch } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';

import { useSettingsView, type SettingsViewId } from './settings-view/hooks';
import { NAV_ITEMS } from './settings-view/config/navigation';
import { SettingsHeader } from './settings-view/components/settings-header';
import { KeyboardMapDialog } from './settings-view/components/keyboard-map-dialog';
import { SettingsNavigation } from './settings-view/components/settings-navigation';
import { ApiKeysSection } from './settings-view/api-keys/api-keys-section';
import { ModelDefaultsSection } from './settings-view/model-defaults';
import { AppearanceSection } from './settings-view/appearance/appearance-section';
import { TerminalSection } from './settings-view/terminal/terminal-section';
import { AudioSection } from './settings-view/audio/audio-section';
import { KeyboardShortcutsSection } from './settings-view/keyboard-shortcuts/keyboard-shortcuts-section';
import { FeatureDefaultsSection } from './settings-view/feature-defaults/feature-defaults-section';
import { WorktreesSection } from './settings-view/worktrees';
import { AccountSection } from './settings-view/account';
import { SecuritySection } from './settings-view/security';
import { DeveloperSection } from './settings-view/developer/developer-section';
import {
  ClaudeSettingsTab,
  CursorSettingsTab,
  CodexSettingsTab,
  OpencodeSettingsTab,
} from './settings-view/providers';
import { MCPServersSection } from './settings-view/mcp-servers';
import { PromptCustomizationSection } from './settings-view/prompts';
import { EventHooksSection } from './settings-view/event-hooks';
import { ImportExportDialog } from './settings-view/components/import-export-dialog';
import type { Theme } from './settings-view/shared/types';

// Breakpoint constant for mobile (matches Tailwind lg breakpoint)
const LG_BREAKPOINT = 1024;

export function SettingsView() {
  const {
    theme,
    setTheme,
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
    skipSandboxWarning,
    setSkipSandboxWarning,
  } = useAppStore();

  // Global theme (project-specific themes are managed in Project Settings)
  const globalTheme = theme as Theme;

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

  const [showKeyboardMapDialog, setShowKeyboardMapDialog] = useState(false);
  const [showImportExportDialog, setShowImportExportDialog] = useState(false);

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
      case 'model-defaults':
        return <ModelDefaultsSection />;
      case 'appearance':
        return (
          <AppearanceSection
            effectiveTheme={globalTheme}
            onThemeChange={(newTheme) => setTheme(newTheme as typeof theme)}
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
      case 'event-hooks':
        return <EventHooksSection />;
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
      case 'developer':
        return <DeveloperSection />;
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
        onImportExportClick={() => setShowImportExportDialog(true)}
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

      {/* Import/Export Settings Dialog */}
      <ImportExportDialog open={showImportExportDialog} onOpenChange={setShowImportExportDialog} />
    </div>
  );
}
