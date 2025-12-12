import { useState, useEffect } from "react";

export interface WindowState {
  isMaximized: boolean;
  windowWidth: number;
  windowHeight: number;
}

/**
 * Hook to track window state (dimensions and maximized status)
 * For Electron apps, considers window maximized if width > 1400px
 * Also listens for window resize events to update state
 */
export function useWindowState(): WindowState {
  const [windowState, setWindowState] = useState<WindowState>(() => {
    if (typeof window === "undefined") {
      return { isMaximized: false, windowWidth: 0, windowHeight: 0 };
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    return {
      isMaximized: width > 1400,
      windowWidth: width,
      windowHeight: height,
    };
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateWindowState = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setWindowState({
        isMaximized: width > 1400,
        windowWidth: width,
        windowHeight: height,
      });
    };

    // Set initial state
    updateWindowState();

    // Listen for resize events
    window.addEventListener("resize", updateWindowState);

    return () => {
      window.removeEventListener("resize", updateWindowState);
    };
  }, []);

  return windowState;
}



