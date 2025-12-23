/**
 * Hook for generating and playing audio synopses of selected features
 *
 * Uses the synopsis API endpoints to:
 * 1. Generate a text summary using Claude AI
 * 2. Convert the summary to speech using ElevenLabs TTS
 * 3. Play the audio in the browser
 */

import { useState, useCallback, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';

interface SynopsisGenerateResponse {
  success: boolean;
  text?: string;
  error?: string;
}

interface SynopsisTTSResponse {
  success: boolean;
  audioData?: string;
  error?: string;
}

// Get server URL from environment
const getServerUrl = (): string => {
  if (typeof window !== 'undefined') {
    const envUrl = import.meta.env.VITE_SERVER_URL;
    if (envUrl) return envUrl;
  }
  return 'http://localhost:3008';
};

/**
 * Hook for generating and playing audio synopses of selected features
 */
export function useAudioSynopsis() {
  const { selectedFeatureIds, features, apiKeys } = useAppStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Feature is only enabled if ElevenLabs API key is configured
  const isEnabled = Boolean(apiKeys?.elevenLabs);
  const hasSelection = selectedFeatureIds.length > 0;

  /**
   * Stop any currently playing audio
   */
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  /**
   * Generate and play an audio synopsis of the selected features
   */
  const generateAndPlay = useCallback(async () => {
    // Stop any currently playing audio
    stopAudio();

    // Check if feature is enabled
    if (!isEnabled) {
      toast.error('Configure ElevenLabs API key in Settings to use audio synopsis');
      return;
    }

    // Check if any features are selected
    if (!hasSelection) {
      toast.info('Select tasks with Shift+Click first');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Get selected feature data
      const selectedFeatures = features.filter((f) =>
        selectedFeatureIds.includes(f.id)
      );

      const featureData = selectedFeatures.map((f) => ({
        id: f.id,
        title: f.title,
        description: f.description,
      }));

      const serverUrl = getServerUrl();

      // Step 1: Generate synopsis text
      toast.loading('Generating synopsis...', { id: 'synopsis' });

      const generateResponse = await fetch(`${serverUrl}/api/synopsis/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ features: featureData }),
      });

      const generateResult: SynopsisGenerateResponse = await generateResponse.json();

      if (!generateResult.success || !generateResult.text) {
        throw new Error(generateResult.error || 'Failed to generate synopsis');
      }

      // Step 2: Convert to speech
      toast.loading('Converting to speech...', { id: 'synopsis' });

      const ttsResponse = await fetch(`${serverUrl}/api/synopsis/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: generateResult.text }),
      });

      const ttsResult: SynopsisTTSResponse = await ttsResponse.json();

      if (!ttsResult.success || !ttsResult.audioData) {
        throw new Error(ttsResult.error || 'Failed to generate audio');
      }

      // Step 3: Play the audio
      toast.success('Playing synopsis', { id: 'synopsis' });
      setIsPlaying(true);

      const audio = new Audio(`data:audio/mpeg;base64,${ttsResult.audioData}`);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setIsPlaying(false);
        audioRef.current = null;
        toast.error('Failed to play audio');
      };

      await audio.play();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate synopsis';
      setError(errorMessage);
      toast.error(errorMessage, { id: 'synopsis' });
    } finally {
      setIsGenerating(false);
    }
  }, [selectedFeatureIds, features, isEnabled, hasSelection, stopAudio]);

  return {
    generateAndPlay,
    stopAudio,
    isGenerating,
    isPlaying,
    error,
    hasSelection,
    isEnabled,
  };
}
