"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { WelcomeView } from "@/components/views/welcome-view";
import { BoardView } from "@/components/views/board-view";
import { SpecView } from "@/components/views/spec-view";
import { AgentView } from "@/components/views/agent-view";
import { SettingsView } from "@/components/views/settings-view";
import { AgentToolsView } from "@/components/views/agent-tools-view";
import { InterviewView } from "@/components/views/interview-view";
import { ContextView } from "@/components/views/context-view";
import { ProfilesView } from "@/components/views/profiles-view";
import { SetupView } from "@/components/views/setup-view";
import { RunningAgentsView } from "@/components/views/running-agents-view";
import { useAppStore } from "@/store/app-store";
import { useSetupStore } from "@/store/setup-store";
import { isElectron } from "@/lib/electron";
import { useServiceInit } from "@/services/useServices";
import { services, isBootstrapped } from "@/services";

export default function Home() {
  const { currentView, setCurrentView, setIpcConnected, theme, currentProject } = useAppStore();
  const { isFirstRun, setupComplete } = useSetupStore();
  const [isMounted, setIsMounted] = useState(false);
  const [streamerPanelOpen, setStreamerPanelOpen] = useState(false);

  // Initialize services on mount
  const servicesReady = useServiceInit();

  // Hidden streamer panel - opens with "\" key
  const handleStreamerPanelShortcut = useCallback((event: KeyboardEvent) => {
    // Don't trigger when typing in inputs
    const activeElement = document.activeElement;
    if (activeElement) {
      const tagName = activeElement.tagName.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") {
        return;
      }
      if (activeElement.getAttribute("contenteditable") === "true") {
        return;
      }
      const role = activeElement.getAttribute("role");
      if (role === "textbox" || role === "searchbox" || role === "combobox") {
        return;
      }
    }

    // Don't trigger with modifier keys
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    // Check for "\" key (backslash)
    if (event.key === "\\") {
      event.preventDefault();
      setStreamerPanelOpen((prev) => !prev);
    }
  }, []);

  // Register the "\" shortcut for streamer panel
  useEffect(() => {
    window.addEventListener("keydown", handleStreamerPanelShortcut);
    return () => {
      window.removeEventListener("keydown", handleStreamerPanelShortcut);
    };
  }, [handleStreamerPanelShortcut]);

  // Compute the effective theme: project theme takes priority over global theme
  // This is reactive because it depends on currentProject and theme from the store
  const effectiveTheme = currentProject?.theme || theme;

  // Prevent hydration issues
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Check if this is first run and redirect to setup if needed
  useEffect(() => {
    console.log("[Setup Flow] Checking setup state:", {
      isMounted,
      isFirstRun,
      setupComplete,
      currentView,
      shouldShowSetup: isMounted && isFirstRun && !setupComplete,
    });

    if (isMounted && isFirstRun && !setupComplete) {
      console.log("[Setup Flow] Redirecting to setup wizard (first run, not complete)");
      setCurrentView("setup");
    } else if (isMounted && setupComplete) {
      console.log("[Setup Flow] Setup already complete, showing normal view");
    }
  }, [isMounted, isFirstRun, setupComplete, setCurrentView, currentView]);

  // Test IPC connection on mount (wait for services to be ready)
  useEffect(() => {
    if (!servicesReady) return;

    const testConnection = async () => {
      try {
        if (!isBootstrapped()) {
          setIpcConnected(false);
          return;
        }
        const result = await services.app.ping();
        setIpcConnected(result.success && (result.data === "pong" || result.data === "pong (mock)"));
      } catch (error) {
        console.error("IPC connection failed:", error);
        setIpcConnected(false);
      }
    };

    testConnection();
  }, [setIpcConnected, servicesReady]);

  // Apply theme class to document (uses effective theme - project-specific or global)
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(
      "dark",
      "retro",
      "light",
      "dracula",
      "nord",
      "monokai",
      "tokyonight",
      "solarized",
      "gruvbox",
      "catppuccin",
      "onedark",
      "synthwave"
    );

    if (effectiveTheme === "dark") {
      root.classList.add("dark");
    } else if (effectiveTheme === "retro") {
      root.classList.add("retro");
    } else if (effectiveTheme === "dracula") {
      root.classList.add("dracula");
    } else if (effectiveTheme === "nord") {
      root.classList.add("nord");
    } else if (effectiveTheme === "monokai") {
      root.classList.add("monokai");
    } else if (effectiveTheme === "tokyonight") {
      root.classList.add("tokyonight");
    } else if (effectiveTheme === "solarized") {
      root.classList.add("solarized");
    } else if (effectiveTheme === "gruvbox") {
      root.classList.add("gruvbox");
    } else if (effectiveTheme === "catppuccin") {
      root.classList.add("catppuccin");
    } else if (effectiveTheme === "onedark") {
      root.classList.add("onedark");
    } else if (effectiveTheme === "synthwave") {
      root.classList.add("synthwave");
    } else if (effectiveTheme === "light") {
      root.classList.add("light");
    } else if (effectiveTheme === "system") {
      // System theme
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (isDark) {
        root.classList.add("dark");
      } else {
        root.classList.add("light");
      }
    }
  }, [effectiveTheme]);

  const renderView = () => {
    switch (currentView) {
      case "welcome":
        return <WelcomeView />;
      case "setup":
        return <SetupView />;
      case "board":
        return <BoardView />;
      case "spec":
        return <SpecView />;
      case "agent":
        return <AgentView />;
      case "settings":
        return <SettingsView />;
      case "tools":
        return <AgentToolsView />;
      case "interview":
        return <InterviewView />;
      case "context":
        return <ContextView />;
      case "profiles":
        return <ProfilesView />;
      case "running-agents":
        return <RunningAgentsView />;
      default:
        return <WelcomeView />;
    }
  };

  // Setup view is full-screen without sidebar
  if (currentView === "setup") {
    return (
      <main className="h-screen overflow-hidden" data-testid="app-container">
        <SetupView />
        {/* Environment indicator */}
        {isMounted && !isElectron() && (
          <div className="fixed bottom-4 right-4 px-3 py-1.5 bg-yellow-500/10 text-yellow-500 text-xs rounded-full border border-yellow-500/20 pointer-events-none">
            Web Mode (Mock IPC)
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="flex h-screen overflow-hidden" data-testid="app-container">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300" style={{ marginRight: streamerPanelOpen ? '250px' : '0' }}>
        {renderView()}
      </div>

      {/* Environment indicator - only show after mount to prevent hydration issues */}
      {isMounted && !isElectron() && (
        <div className="fixed bottom-4 right-4 px-3 py-1.5 bg-yellow-500/10 text-yellow-500 text-xs rounded-full border border-yellow-500/20 pointer-events-none">
          Web Mode (Mock IPC)
        </div>
      )}

      {/* Hidden streamer panel - opens with "\" key, pushes content */}
      <div
        className={`fixed top-0 right-0 h-full w-[250px] bg-background border-l border-border transition-transform duration-300 ${
          streamerPanelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      />
    </main>
  );
}
