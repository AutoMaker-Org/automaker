/**
 * Font options for per-project font customization
 *
 * All fonts listed here are bundled with the app via @fontsource packages
 * or custom font files (Zed fonts from zed-industries/zed-fonts).
 * They are self-hosted and will work without any system installation.
 */

// Sentinel value for "use default font" - Radix Select doesn't allow empty strings
export const DEFAULT_FONT_VALUE = 'default';

export interface UIFontOption {
  value: string; // CSS font-family value ('default' means "use default")
  label: string; // Display label for the dropdown
}

/**
 * Sans/UI fonts for headings, labels, and general text (Top 10)
 *
 * 'default' value means "use the theme default" (Geist Sans for all themes)
 */
export const UI_SANS_FONT_OPTIONS: readonly UIFontOption[] = [
  { value: DEFAULT_FONT_VALUE, label: 'Default (Geist Sans)' },
  // Sans fonts (alphabetical)
  { value: 'Inter, system-ui, sans-serif', label: 'Inter' },
  { value: 'Lato, system-ui, sans-serif', label: 'Lato' },
  { value: 'Montserrat, system-ui, sans-serif', label: 'Montserrat' },
  { value: "'Open Sans', system-ui, sans-serif", label: 'Open Sans' },
  { value: 'Poppins, system-ui, sans-serif', label: 'Poppins' },
  { value: 'Raleway, system-ui, sans-serif', label: 'Raleway' },
  { value: 'Roboto, system-ui, sans-serif', label: 'Roboto' },
  { value: "'Source Sans 3', system-ui, sans-serif", label: 'Source Sans' },
  { value: "'Work Sans', system-ui, sans-serif", label: 'Work Sans' },
  { value: "'Zed Sans', system-ui, sans-serif", label: 'Zed Sans' },
  // Monospace fonts (alphabetical, for users who prefer mono UI)
  { value: "'Cascadia Code', monospace", label: 'Cascadia Code' },
  { value: "'Fira Code', monospace", label: 'Fira Code' },
  { value: "'IBM Plex Mono', monospace", label: 'IBM Plex Mono' },
  { value: 'Inconsolata, monospace', label: 'Inconsolata' },
  { value: 'Iosevka, monospace', label: 'Iosevka' },
  { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono' },
  { value: "'Source Code Pro', monospace", label: 'Source Code Pro' },
  { value: "'Zed Mono', monospace", label: 'Zed Mono' },
] as const;

/**
 * Mono/code fonts for code blocks, terminals, and monospaced text (Top 10)
 *
 * 'default' value means "use the theme default" (Geist Mono for all themes)
 * Many of these support ligatures for coding symbols (-> => != etc.)
 */
export const UI_MONO_FONT_OPTIONS: readonly UIFontOption[] = [
  { value: DEFAULT_FONT_VALUE, label: 'Default (Geist Mono)' },
  // Bundled fonts (alphabetical)
  { value: "'Cascadia Code', monospace", label: 'Cascadia Code' },
  { value: "'Fira Code', monospace", label: 'Fira Code' },
  { value: "'IBM Plex Mono', monospace", label: 'IBM Plex Mono' },
  { value: 'Inconsolata, monospace', label: 'Inconsolata' },
  { value: 'Iosevka, monospace', label: 'Iosevka' },
  { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono' },
  { value: "'Source Code Pro', monospace", label: 'Source Code Pro' },
  { value: "'Zed Mono', monospace", label: 'Zed Mono' },
  // System fonts
  { value: 'Menlo, Monaco, monospace', label: 'Menlo / Monaco (macOS)' },
] as const;

/**
 * Get the display label for a font value
 */
export function getFontLabel(
  fontValue: string | undefined,
  options: readonly UIFontOption[]
): string {
  if (!fontValue || fontValue === DEFAULT_FONT_VALUE) return options[0].label;
  const option = options.find((o) => o.value === fontValue);
  return option?.label ?? fontValue;
}
