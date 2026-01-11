import { useState, useCallback } from 'react';
import { getElectronAPI, LinearImportOptions, LinearImportResult } from '@/lib/electron';
import { createLogger } from '@automaker/utils/logger';
import { toast } from 'sonner';

const logger = createLogger('useLinearImport');

interface UseLinearImportOptions {
  projectPath: string | null;
  onSuccess?: (result: LinearImportResult) => void;
}

export function useLinearImport({ projectPath, onSuccess }: UseLinearImportOptions) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<LinearImportResult | null>(null);

  const importIssues = useCallback(
    async (issueIds: string[], options?: Partial<LinearImportOptions>) => {
      const api = getElectronAPI();

      if (!api.linear) {
        toast.error('Linear API not available');
        return null;
      }

      if (!projectPath) {
        toast.error('No project selected');
        return null;
      }

      if (issueIds.length === 0) {
        toast.error('No issues selected');
        return null;
      }

      try {
        setImporting(true);

        const importOptions: LinearImportOptions = {
          issueIds,
          targetStatus: options?.targetStatus ?? 'backlog',
          includeDescription: options?.includeDescription ?? true,
          includeLabelsAsCategory: options?.includeLabelsAsCategory ?? true,
          linkBackToLinear: options?.linkBackToLinear ?? true,
        };

        const importResult = await api.linear.importIssues(projectPath, importOptions);
        setResult(importResult);

        if (importResult.success) {
          toast.success(`Imported ${importResult.importedCount} issue(s) to board`);
          onSuccess?.(importResult);
        } else {
          toast.error(importResult.error || 'Import failed');
        }

        // Log any partial errors
        if (importResult.errors && importResult.errors.length > 0) {
          importResult.errors.forEach((err) => {
            logger.warn(`Failed to import ${err.linearIssueId}: ${err.error}`);
          });
        }

        return importResult;
      } catch (err) {
        logger.error('Import failed:', err);
        toast.error(err instanceof Error ? err.message : 'Import failed');
        return null;
      } finally {
        setImporting(false);
      }
    },
    [projectPath, onSuccess]
  );

  const clearResult = useCallback(() => {
    setResult(null);
  }, []);

  return {
    importing,
    result,
    importIssues,
    clearResult,
  };
}
