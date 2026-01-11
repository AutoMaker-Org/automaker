/**
 * Editor types for the "Open In" functionality
 */

/**
 * Information about an available code editor
 */
export interface EditorInfo {
  /** Display name of the editor (e.g., "VS Code", "Cursor") */
  name: string;
  /** CLI command or open command to launch the editor */
  command: string;
}
