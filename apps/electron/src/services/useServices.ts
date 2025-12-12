/**
 * React hooks for service layer
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { bootstrapServices, isBootstrapped, services } from "./index";

/**
 * Hook to ensure services are bootstrapped
 * Returns loading state and services accessor
 */
export function useServices() {
  const [isReady, setIsReady] = useState(isBootstrapped());
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (isBootstrapped()) {
      setIsReady(true);
      return;
    }

    let mounted = true;

    const init = async () => {
      try {
        await bootstrapServices();
        if (mounted) {
          setIsReady(true);
        }
      } catch (err) {
        console.error("[useServices] Failed to bootstrap services:", err);
        if (mounted) {
          setError(err instanceof Error ? err : new Error("Failed to bootstrap services"));
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    isReady,
    error,
    services: isReady ? services : null,
  };
}

/**
 * Hook to initialize services on component mount
 * Use this at the app root to ensure services are ready
 */
export function useServiceInit() {
  const [initialized, setInitialized] = useState(isBootstrapped());

  useEffect(() => {
    if (isBootstrapped()) {
      setInitialized(true);
      return;
    }

    bootstrapServices()
      .then(() => setInitialized(true))
      .catch((err) => {
        console.error("[useServiceInit] Bootstrap failed:", err);
      });
  }, []);

  return initialized;
}
