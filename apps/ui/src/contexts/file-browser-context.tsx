import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { FileBrowserDialog } from '@/components/dialogs/file-browser-dialog';

interface FileBrowserOptions {
  title?: string;
  description?: string;
  initialPath?: string;
}

interface FileBrowserContextValue {
  openFileBrowser: (options?: FileBrowserOptions) => Promise<string | null>;
}

const FileBrowserContext = createContext<FileBrowserContextValue | null>(null);

export function FileBrowserProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [resolver, setResolver] = useState<((value: string | null) => void) | null>(null);
  const [dialogOptions, setDialogOptions] = useState<FileBrowserOptions>({});

  const openFileBrowser = useCallback((options?: FileBrowserOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      setDialogOptions(options || {});
      setIsOpen(true);
      setResolver(() => resolve);
    });
  }, []);

  const handleSelect = useCallback(
    (path: string) => {
      if (resolver) {
        resolver(path);
        setResolver(null);
      }
      setIsOpen(false);
      setDialogOptions({});
    },
    [resolver]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && resolver) {
        resolver(null);
        setResolver(null);
      }
      setIsOpen(open);
      if (!open) {
        setDialogOptions({});
      }
    },
    [resolver]
  );

  return (
    <FileBrowserContext.Provider value={{ openFileBrowser }}>
      {children}
      <FileBrowserDialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        onSelect={handleSelect}
        title={dialogOptions.title}
        description={dialogOptions.description}
        initialPath={dialogOptions.initialPath}
      />
    </FileBrowserContext.Provider>
  );
}

// No-op fallback for HMR transitions when context temporarily becomes unavailable
const hmrFallback: FileBrowserContextValue = {
  openFileBrowser: async () => {
    console.warn('[HMR] FileBrowserContext not available, returning null');
    return null;
  },
};

export function useFileBrowser() {
  const context = useContext(FileBrowserContext);
  // During HMR, the context can temporarily be null as modules reload.
  // Instead of crashing the app, return a safe no-op fallback that will
  // be replaced once the provider re-mounts.
  if (!context) {
    if (import.meta.hot) {
      // In development with HMR active, gracefully degrade
      return hmrFallback;
    }
    // In production, this indicates a real bug - throw to help debug
    throw new Error('useFileBrowser must be used within FileBrowserProvider');
  }
  return context;
}

// Global reference for non-React code (like HttpApiClient)
let globalFileBrowserFn: ((options?: FileBrowserOptions) => Promise<string | null>) | null = null;

export function setGlobalFileBrowser(fn: (options?: FileBrowserOptions) => Promise<string | null>) {
  globalFileBrowserFn = fn;
}

export function getGlobalFileBrowser() {
  return globalFileBrowserFn;
}

// Export the options type for consumers
export type { FileBrowserOptions };
