/**
 * Electron main process constants
 *
 * Centralized configuration for window sizing, ports, and file names.
 */

// ============================================
// Window sizing constants for kanban layout
// ============================================
// Calculation: 4 columns × 280px + 3 gaps × 20px + 40px padding = 1220px board content
// With sidebar expanded (288px): 1220 + 288 = 1508px
// Minimum window dimensions - reduced to allow smaller windows since kanban now supports horizontal scrolling
export const MIN_WIDTH_COLLAPSED = 600; // Reduced - horizontal scrolling handles overflow
export const MIN_HEIGHT = 500; // Reduced to allow more flexibility
export const DEFAULT_WIDTH = 1600;
export const DEFAULT_HEIGHT = 950;

// ============================================
// Port defaults
// ============================================
// Default ports (can be overridden via env) - will be dynamically assigned if these are in use
// When launched via root init.mjs we pass:
// - SERVER_PORT (backend API server)
// - PORT (Vite dev server / static file server)
// Guard against NaN from non-numeric environment variables
const parsedServerPort = Number.parseInt(process.env.SERVER_PORT ?? '', 10);
const parsedStaticPort = Number.parseInt(process.env.PORT ?? '', 10);
export const DEFAULT_SERVER_PORT = Number.isFinite(parsedServerPort) ? parsedServerPort : 3008;
export const DEFAULT_STATIC_PORT = Number.isFinite(parsedStaticPort) ? parsedStaticPort : 3007;

// ============================================
// File names for userData storage
// ============================================
export const API_KEY_FILENAME = '.api-key';
export const WINDOW_BOUNDS_FILENAME = 'window-bounds.json';

// ============================================
// Window bounds interface
// ============================================
// Matches @automaker/types WindowBounds
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}
