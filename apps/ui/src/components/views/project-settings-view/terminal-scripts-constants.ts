/**
 * Shared terminal script constants used by both the settings section
 * (terminal-scripts-section.tsx) and the terminal header dropdown
 * (terminal-scripts-dropdown.tsx).
 *
 * Centralising the default scripts here ensures both components show
 * the same fallback list and removes the duplicated definition.
 */

export interface TerminalScript {
  id: string;
  name: string;
  command: string;
}

/** Default scripts shown when the user has not configured any custom scripts yet. */
export const DEFAULT_TERMINAL_SCRIPTS: TerminalScript[] = [
  { id: 'default-dev', name: 'Dev Server', command: 'npm run dev' },
  { id: 'default-format', name: 'Format', command: 'npm run format' },
  { id: 'default-test', name: 'Test', command: 'npm run test' },
  { id: 'default-lint', name: 'Lint', command: 'npm run lint' },
];
