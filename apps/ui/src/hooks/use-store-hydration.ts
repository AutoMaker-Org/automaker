import { useEffect, useState } from 'react';

interface StoreWithPersist {
  persist?: {
    hasHydrated?: () => boolean;
    onFinishHydration?: (cb: () => void) => () => void;
  };
}

/**
 * Hook for tracking store hydration status from persistence.
 *
 * Monitors whether a persisted store has finished loading from storage.
 * Returns true once the store has completed hydration, false otherwise.
 *
 * @param store - The store instance with persist configuration
 * @returns Boolean indicating if the store has finished hydrating
 */
export function useStoreHydration(store: StoreWithPersist) {
  const [hydrated, setHydrated] = useState(() => store.persist?.hasHydrated?.() ?? false);

  useEffect(() => {
    if (store.persist?.hasHydrated?.()) {
      setHydrated(true);
      return;
    }

    const unsubscribe = store.persist?.onFinishHydration?.(() => {
      setHydrated(true);
    });

    return () => unsubscribe?.();
  }, [store]);

  return hydrated;
}
