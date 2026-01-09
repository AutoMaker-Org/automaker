import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('CliInstallation');

interface UseCliInstallationOptions {
  cliType: 'claude';
  installApi: () => Promise<any>;
  onProgressEvent?: (callback: (progress: any) => void) => (() => void) | undefined;
  onSuccess?: () => void;
  getStoreState?: () => any;
}

export function useCliInstallation({
  cliType,
  installApi,
  onProgressEvent,
  onSuccess,
  getStoreState,
}: UseCliInstallationOptions) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<{ output: string[] }>({
    output: [],
  });

  const install = useCallback(async () => {
    setIsInstalling(true);
    setInstallProgress({ output: [] });

    try {
      let unsubscribe: (() => void) | undefined;

      if (onProgressEvent) {
        unsubscribe = onProgressEvent(
          (progress: { cli?: string; data?: string; type?: string }) => {
            if (progress.cli === cliType) {
              setInstallProgress((prev) => ({
                output: [...prev.output, progress.data || progress.type || ''],
              }));
            }
          }
        );
      }

      const result = await installApi();
      unsubscribe?.();

      if (result.success) {
        if (cliType === 'claude' && onSuccess && getStoreState) {
          // Claude-specific: retry logic to detect installation
          let retries = 5;
          let detected = false;

          await new Promise((resolve) => setTimeout(resolve, 1500));

          for (let i = 0; i < retries; i++) {
            await onSuccess();
            await new Promise((resolve) => setTimeout(resolve, 300));

            const currentStatus = getStoreState();
            if (currentStatus?.installed) {
              detected = true;
              toast.success(`${cliType} CLI installed and detected successfully`);
              break;
            }

            if (i < retries - 1) {
              await new Promise((resolve) => setTimeout(resolve, 2000 + i * 500));
            }
          }

          if (!detected) {
            toast.success(`${cliType} CLI installation completed`, {
              description:
                'The CLI was installed but may need a terminal restart to be detected. You can continue with authentication if you have a token.',
              duration: 7000,
            });
          }
        } else {
          toast.success(`${cliType} CLI installed successfully`);
          onSuccess?.();
        }
      } else {
        toast.error('Installation failed', { description: result.error });
      }
    } catch (error) {
      logger.error(`Failed to install ${cliType}:`, error);
      toast.error('Installation failed');
    } finally {
      setIsInstalling(false);
    }
  }, [cliType, installApi, onProgressEvent, onSuccess, getStoreState]);

  return { isInstalling, installProgress, install };
}
