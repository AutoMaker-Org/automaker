"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { WelcomeView } from "@/components/views/welcome-view";
import { BoardView } from "@/components/views/board-view";
import { SpecView } from "@/components/views/spec-view";
import { AgentView } from "@/components/views/agent-view";
import { SettingsView } from "@/components/views/settings-view";
import { AgentToolsView } from "@/components/views/agent-tools-view";
import { InterviewView } from "@/components/views/interview-view";
import { ContextView } from "@/components/views/context-view";
import { useAppStore } from "@/store/app-store";
import { getElectronAPI, isElectron } from "@/lib/electron";
import { HelperConnectionStatus } from "@/components/ui/helper-connection-status";

export default function Home() {
  const { currentView, setIpcConnected, theme } = useAppStore();
  const [isMounted, setIsMounted] = useState(false);

  // Prevent hydration issues
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Test IPC connection on mount
  useEffect(() => {
    const testConnection = async () => {
      try {
        const api = await getElectronAPI();
        if (api) {
          const result = await api.ping();
          setIpcConnected(result === "pong" || result === "pong (helper)");
        } else {
          setIpcConnected(false);
        }
      } catch (error) {
        console.error("IPC connection failed:", error);
        setIpcConnected(false);
      }
    };

    testConnection();
  }, [setIpcConnected]);

  // Apply theme class to document
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

    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "retro") {
      root.classList.add("retro");
    } else if (theme === "dracula") {
      root.classList.add("dracula");
    } else if (theme === "nord") {
      root.classList.add("nord");
    } else if (theme === "monokai") {
      root.classList.add("monokai");
    } else if (theme === "tokyonight") {
      root.classList.add("tokyonight");
    } else if (theme === "solarized") {
      root.classList.add("solarized");
    } else if (theme === "gruvbox") {
      root.classList.add("gruvbox");
    } else if (theme === "catppuccin") {
      root.classList.add("catppuccin");
    } else if (theme === "onedark") {
      root.classList.add("onedark");
    } else if (theme === "synthwave") {
      root.classList.add("synthwave");
    } else if (theme === "light") {
      root.classList.add("light");
    } else if (theme === "system") {
      // System theme
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (isDark) {
        root.classList.add("dark");
      } else {
        root.classList.add("light");
      }
    }
  }, [theme]);

  const renderView = () => {
    switch (currentView) {
      case "welcome":
        return <WelcomeView />;
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
      default:
        return <WelcomeView />;
    }
  };

  return (
    <main className="flex h-screen overflow-hidden" data-testid="app-container">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">{renderView()}</div>

      {/* Environment indicator - only show after mount to prevent hydration issues */}
      {isMounted && !isElectron() && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2">
          <HelperConnectionStatus />
        </div>
      )}
    </main>
  );
}
