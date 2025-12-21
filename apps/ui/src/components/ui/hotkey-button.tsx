
import React, { useEffect, useCallback, useRef } from "react";
import { Button, buttonVariants } from "./button";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

export interface HotkeyConfig {
  /** The key to trigger the hotkey (e.g., "Enter", "s", "n") */
  key: string;
  /** Whether the Cmd/Ctrl modifier is required */
  cmdCtrl?: boolean;
  /** Whether the Shift modifier is required */
  shift?: boolean;
  /** Whether the Alt/Option modifier is required */
  alt?: boolean;
  /** Custom display label for the hotkey (overrides auto-generated label) */
  label?: string;
}

export interface HotkeyButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  /** Hotkey configuration - can be a simple key string or a full config object */
  hotkey?: string | HotkeyConfig;
  /** Whether to show the hotkey indicator badge */
  showHotkeyIndicator?: boolean;
  /** Whether the hotkey listener is active (registers keyboard listener). Set to false if hotkey is already handled elsewhere. */
  hotkeyActive?: boolean;
  /** Optional scope element ref - hotkey will only work when this element is visible */
  scopeRef?: React.RefObject<HTMLElement | null>;
  /** Callback when hotkey is triggered */
  onHotkeyTrigger?: () => void;
  /** Whether to use the Slot component for composition */
  asChild?: boolean;
}

/**
 * Get the modifier key symbol based on platform
 */
function getModifierSymbol(isMac: boolean): string {
  return isMac ? "⌘" : "Ctrl";
}

/**
 * Parse hotkey config into a normalized format
 */
function parseHotkeyConfig(hotkey: string | HotkeyConfig): HotkeyConfig {
  if (typeof hotkey === "string") {
    return { key: hotkey };
  }
  return hotkey;
}

/**
 * Generate the display label for the hotkey
 */
function getHotkeyDisplayLabel(
  config: HotkeyConfig,
  isMac: boolean
): React.ReactNode {
  if (config.label) {
    return config.label;
  }

  const parts: React.ReactNode[] = [];

  if (config.cmdCtrl) {
    parts.push(
      <span key="mod" className="leading-none flex items-center justify-center">
        {getModifierSymbol(isMac)}
      </span>
    );
  }

  if (config.shift) {
    parts.push(
      <span
        key="shift"
        className="leading-none flex items-center justify-center"
      >
        ⇧
      </span>
    );
  }

  if (config.alt) {
    parts.push(
      <span key="alt" className="leading-none flex items-center justify-center">
        {isMac ? "⌥" : "Alt"}
      </span>
    );
  }

  // Convert key to display format
  let keyDisplay = config.key;
  switch (config.key.toLowerCase()) {
    case "enter":
      keyDisplay = "↵";
      break;
    case "escape":
    case "esc":
      keyDisplay = "Esc";
      break;
    case "arrowup":
      keyDisplay = "↑";
      break;
    case "arrowdown":
      keyDisplay = "↓";
      break;
    case "arrowleft":
      keyDisplay = "←";
      break;
    case "arrowright":
      keyDisplay = "→";
      break;
    case "backspace":
      keyDisplay = "⌫";
      break;
    case "delete":
      keyDisplay = "⌦";
      break;
    case "tab":
      keyDisplay = "⇥";
      break;
    case " ":
      keyDisplay = "Space";
      break;
    default:
      // Capitalize single letters
      if (config.key.length === 1) {
        keyDisplay = config.key.toUpperCase();
      }
  }

  parts.push(
    <span key="key" className="leading-none flex items-center justify-center">
      {keyDisplay}
    </span>
  );

  return <span className="inline-flex items-center gap-1.5">{parts}</span>;
}

/**
 * Check if an element is a form input
 */
function isInputElement(element: Element | null): boolean {
  if (!element) return false;

  const tagName = element.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  if (element.getAttribute("contenteditable") === "true") {
    return true;
  }

  const role = element.getAttribute("role");
  if (role === "textbox" || role === "searchbox" || role === "combobox") {
    return true;
  }

  return false;
}

/**
 * A button component that supports keyboard hotkeys
 *
 * Features:
 * - Automatic hotkey listening when mounted
 * - Visual hotkey indicator badge
 * - Support for modifier keys (Cmd/Ctrl, Shift, Alt)
 * - Respects focus context (doesn't trigger when typing in inputs)
 * - Scoped activation via scopeRef
 */
export function HotkeyButton({
  hotkey,
  showHotkeyIndicator = true,
  hotkeyActive = true,
  scopeRef,
  onHotkeyTrigger,
  onClick,
  disabled,
  children,
  className,
  variant,
  size,
  asChild = false,
  ...props
}: HotkeyButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isMac, setIsMac] = React.useState(true);

  // Detect platform on mount
  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes("mac"));
  }, []);

  const config = hotkey ? parseHotkeyConfig(hotkey) : null;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!config || !hotkeyActive || disabled) return;

      // Don't trigger when typing in inputs (unless explicitly scoped or using cmdCtrl modifier)
      // cmdCtrl shortcuts like Cmd+Enter should work even in inputs as they're intentional submit actions
      if (
        !scopeRef &&
        !config.cmdCtrl &&
        isInputElement(document.activeElement)
      ) {
        return;
      }

      // Check modifier keys
      const cmdCtrlPressed = event.metaKey || event.ctrlKey;
      const shiftPressed = event.shiftKey;
      const altPressed = event.altKey;

      // Validate modifier requirements
      if (config.cmdCtrl && !cmdCtrlPressed) return;
      if (!config.cmdCtrl && cmdCtrlPressed) return;
      if (config.shift && !shiftPressed) return;
      if (!config.shift && shiftPressed) return;
      if (config.alt && !altPressed) return;
      if (!config.alt && altPressed) return;

      // Check if the key matches
      if (event.key.toLowerCase() !== config.key.toLowerCase()) return;

      // If scoped, check that the scope element is visible
      if (scopeRef && scopeRef.current) {
        const scopeEl = scopeRef.current;
        const isVisible =
          scopeEl.offsetParent !== null ||
          getComputedStyle(scopeEl).display !== "none";
        if (!isVisible) return;
      }

      event.preventDefault();
      event.stopPropagation();

      // Trigger the click handler or custom onHotkeyTrigger
      if (onHotkeyTrigger) {
        onHotkeyTrigger();
      } else if (onClick) {
        onClick(event as unknown as React.MouseEvent<HTMLButtonElement>);
      } else if (buttonRef.current) {
        buttonRef.current.click();
      }
    },
    [config, hotkeyActive, disabled, scopeRef, onHotkeyTrigger, onClick]
  );

  // Set up global key listener
  useEffect(() => {
    if (!config || !hotkeyActive) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [config, hotkeyActive, handleKeyDown]);

  // Render the hotkey indicator
  const hotkeyIndicator =
    config && showHotkeyIndicator ? (
      <span
        className="px-2 py-0.5 text-[10px] font-mono rounded bg-primary-foreground/10 border border-primary-foreground/20 inline-flex items-center gap-1.5"
        data-testid="hotkey-indicator"
      >
        {getHotkeyDisplayLabel(config, isMac)}
      </span>
    ) : null;

  return (
    <Button
      ref={buttonRef}
      variant={variant}
      size={size}
      disabled={disabled}
      onClick={onClick}
      className={cn(className)}
      asChild={asChild}
      {...props}
    >
      {typeof children === "string" ? (
        <>
          {children}
          {hotkeyIndicator}
        </>
      ) : (
        <>
          {children}
          {hotkeyIndicator}
        </>
      )}
    </Button>
  );
}

export { getHotkeyDisplayLabel, parseHotkeyConfig };
