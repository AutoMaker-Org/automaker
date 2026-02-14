/**
 * Centralized port configuration for AutoMaker
 *
 * These ports are reserved for the Automaker application and should never be
 * killed or terminated by AI agents during feature implementation.
 */

/** Default port for the static/UI server (Vite dev server) */
export const STATIC_PORT = 3007;

/** Default port for the backend API server (Express + WebSocket) */
export const SERVER_PORT = 3008;

/** Array of default reserved Automaker ports */
export const RESERVED_PORTS = [STATIC_PORT, SERVER_PORT] as const;

/**
 * Runtime port registry for tracking actual ports in use by Automaker.
 * When ports are dynamically assigned (due to conflicts), the actual ports
 * are registered here so they can be protected from being killed.
 */
const runtimePorts = new Set<number>([STATIC_PORT, SERVER_PORT]);

/** Register a port as actively used by Automaker */
export function registerRuntimePort(port: number): void {
  runtimePorts.add(port);
}

/** Check if a port is reserved or actively used by Automaker */
export function isAutomakerPort(port: number): boolean {
  return runtimePorts.has(port);
}

/** Get all ports currently reserved/used by Automaker */
export function getAutomakerPorts(): readonly number[] {
  return [...runtimePorts];
}
