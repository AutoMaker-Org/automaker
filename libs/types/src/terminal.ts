/**
 * Terminal types for the "Open In Terminal" functionality
 */

/**
 * Information about an available external terminal
 */
export interface TerminalInfo {
  /** Unique identifier for the terminal (e.g., 'iterm2', 'warp') */
  id: string;
  /** Display name of the terminal (e.g., "iTerm2", "Warp") */
  name: string;
  /** CLI command or open command to launch the terminal */
  command: string;
}
