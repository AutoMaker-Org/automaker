import { useState, useCallback } from 'react';
import { Feature } from '@/store/app-store';
import {
  FeatureImagePath as DescriptionImagePath,
  ImagePreviewMap,
} from '@/components/ui/description-image-dropzone';
import type { FollowUpHistoryEntry } from '../dialogs/follow-up-dialog';

/**
 * Custom hook for managing follow-up dialog state including prompt history
 */
export function useFollowUpState() {
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [followUpFeature, setFollowUpFeature] = useState<Feature | null>(null);
  const [followUpPrompt, setFollowUpPrompt] = useState('');
  const [followUpImagePaths, setFollowUpImagePaths] = useState<DescriptionImagePath[]>([]);
  const [followUpPreviewMap, setFollowUpPreviewMap] = useState<ImagePreviewMap>(() => new Map());
  const [followUpPromptHistory, setFollowUpPromptHistory] = useState<FollowUpHistoryEntry[]>([]);

  const resetFollowUpState = useCallback(() => {
    setShowFollowUpDialog(false);
    setFollowUpFeature(null);
    setFollowUpPrompt('');
    setFollowUpImagePaths([]);
    setFollowUpPreviewMap(new Map());
    setFollowUpPromptHistory([]);
  }, []);

  const handleFollowUpDialogChange = useCallback(
    (open: boolean) => {
      if (!open) {
        resetFollowUpState();
      } else {
        setShowFollowUpDialog(open);
      }
    },
    [resetFollowUpState]
  );

  /**
   * Adds a new entry to the prompt history
   */
  const addToPromptHistory = useCallback((entry: FollowUpHistoryEntry) => {
    setFollowUpPromptHistory((prev) => [...prev, entry]);
  }, []);

  return {
    // State
    showFollowUpDialog,
    followUpFeature,
    followUpPrompt,
    followUpImagePaths,
    followUpPreviewMap,
    followUpPromptHistory,
    // Setters
    setShowFollowUpDialog,
    setFollowUpFeature,
    setFollowUpPrompt,
    setFollowUpImagePaths,
    setFollowUpPreviewMap,
    setFollowUpPromptHistory,
    // Helpers
    resetFollowUpState,
    handleFollowUpDialogChange,
    addToPromptHistory,
  };
}
