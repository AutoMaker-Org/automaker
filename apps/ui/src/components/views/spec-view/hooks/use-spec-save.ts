import { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { useSaveSpec } from '@/hooks/mutations';

export function useSpecSave() {
  const { currentProject, appSpec, setAppSpec } = useAppStore();
  const [hasChanges, setHasChanges] = useState(false);

  // React Query mutation
  const saveMutation = useSaveSpec(currentProject?.path ?? '');

  const saveSpec = async () => {
    if (!currentProject) return;

    saveMutation.mutate(appSpec, {
      onSuccess: () => setHasChanges(false),
    });
  };

  const handleChange = (value: string) => {
    setAppSpec(value);
    setHasChanges(true);
  };

  return {
    isSaving: saveMutation.isPending,
    hasChanges,
    setHasChanges,
    saveSpec,
    handleChange,
  };
}
