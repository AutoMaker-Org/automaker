import { useMemo, useRef, useEffect } from 'react';
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  KeyboardShortcut,
} from '@/hooks/use-keyboard-shortcuts';
import { Feature } from '@/store/app-store';
import { useAudioSynopsis } from '@/hooks/use-audio-synopsis';

interface UseBoardKeyboardShortcutsProps {
  features: Feature[];
  runningAutoTasks: string[];
  onAddFeature: () => void;
  onStartNextFeatures: () => void;
  onViewOutput: (feature: Feature) => void;
}

export function useBoardKeyboardShortcuts({
  features,
  runningAutoTasks,
  onAddFeature,
  onStartNextFeatures,
  onViewOutput,
}: UseBoardKeyboardShortcutsProps) {
  const shortcuts = useKeyboardShortcutsConfig();

  // Audio synopsis hook for Cmd+Y shortcut
  const { generateAndPlay: generateAudioSynopsis } = useAudioSynopsis();

  // Get in-progress features for keyboard shortcuts (memoized for shortcuts)
  const inProgressFeaturesForShortcuts = useMemo(() => {
    return features.filter((f) => {
      const isRunning = runningAutoTasks.includes(f.id);
      return isRunning || f.status === 'in_progress';
    });
  }, [features, runningAutoTasks]);

  // Ref to hold the start next callback (to avoid dependency issues)
  const startNextFeaturesRef = useRef<() => void>(() => {});

  // Update ref when callback changes
  useEffect(() => {
    startNextFeaturesRef.current = onStartNextFeatures;
  }, [onStartNextFeatures]);

  // Keyboard shortcuts for this view
  const boardShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcutsList: KeyboardShortcut[] = [
      {
        key: shortcuts.addFeature,
        action: onAddFeature,
        description: 'Add new feature',
      },
      {
        key: shortcuts.startNext,
        action: () => startNextFeaturesRef.current(),
        description: 'Start next features from backlog',
      },
      {
        key: shortcuts.audioSynopsis,
        action: generateAudioSynopsis,
        description: 'Generate audio synopsis of selected features',
      },
    ];

    // Add shortcuts for in-progress cards (1-9 and 0 for 10th)
    inProgressFeaturesForShortcuts.slice(0, 10).forEach((feature, index) => {
      // Keys 1-9 for first 9 cards, 0 for 10th card
      const key = index === 9 ? '0' : String(index + 1);
      shortcutsList.push({
        key,
        action: () => {
          onViewOutput(feature);
        },
        description: `View output for in-progress card ${index + 1}`,
      });
    });

    return shortcutsList;
  }, [inProgressFeaturesForShortcuts, shortcuts, onAddFeature, onViewOutput, generateAudioSynopsis]);

  useKeyboardShortcuts(boardShortcuts);

  return {
    inProgressFeaturesForShortcuts,
  };
}
