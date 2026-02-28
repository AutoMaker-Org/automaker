/**
 * Custom hook for handling WebSocket events in AgentOutputModal
 * Centralizes WebSocket event logic to reduce duplication
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { getElectronAPI } from '@/lib/electron';
import { useAgentOutput } from '@/hooks/queries';
import {
  formatAutoModeEventContent,
  formatBacklogPlanEventContent,
} from '@/components/views/board-view/dialogs/event-content-formatter';
import type { AutoModeEvent } from '@/types/electron';
import type { BacklogPlanEvent } from '@automaker/types';
import { MODAL_CONSTANTS } from '@/components/views/board-view/dialogs/agent-output-modal.constants';

interface UseAgentOutputWebSocketProps {
  open: boolean;
  featureId: string;
  isBacklogPlan: boolean;
  projectPath: string;
  onFeatureComplete?: (passes: boolean) => void;
}

export function useAgentOutputWebSocket({
  open,
  featureId,
  isBacklogPlan,
  projectPath,
  onFeatureComplete,
}: UseAgentOutputWebSocketProps) {
  const [streamedContent, setStreamedContent] = useState('');
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Use React Query for initial output loading
  const { data: initialOutput = '', isLoading } = useAgentOutput(projectPath, featureId, {
    enabled: open && !!projectPath,
  });

  // Combine initial output with streamed content
  const output = initialOutput + streamedContent;

  // Handle auto mode events
  const handleAutoModeEvent = useCallback(
    (event: AutoModeEvent) => {
      // Filter events for this specific feature only
      if ('featureId' in event && event.featureId !== featureId) {
        return;
      }

      const newContent = formatAutoModeEventContent(event);

      if (newContent) {
        setStreamedContent((prev) => prev + newContent);
      }

      // Handle feature completion
      if (event.type === 'auto_mode_feature_complete' && event.passes && onFeatureComplete) {
        // Clear any existing timeout first
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
        }

        // Set timeout to close modal after delay
        closeTimeoutRef.current = setTimeout(() => {
          onFeatureComplete(true);
        }, MODAL_CONSTANTS.MODAL_CLOSE_DELAY_MS);
      }
    },
    [featureId, onFeatureComplete]
  );

  // Handle backlog plan events
  const handleBacklogPlanEvent = useCallback((event: BacklogPlanEvent) => {
    const newContent = formatBacklogPlanEventContent(event);

    if (newContent) {
      setStreamedContent((prev) => prev + newContent);
    }
  }, []);

  // Set up WebSocket event listeners
  useEffect(() => {
    if (!open) {
      // Clean up timeout when modal closes
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = undefined;
      }
      return;
    }

    const api = getElectronAPI();
    if (!api) return;

    let unsubscribe: (() => void) | undefined;

    if (isBacklogPlan) {
      // Handle backlog plan events
      if (api.backlogPlan) {
        unsubscribe = api.backlogPlan.onEvent((data: unknown) => {
          if (
            data !== null &&
            typeof data === 'object' &&
            'type' in data &&
            typeof (data as { type: unknown }).type === 'string'
          ) {
            handleBacklogPlanEvent(data as BacklogPlanEvent);
          }
        });
      }
    } else {
      // Handle auto mode events
      if (api.autoMode) {
        unsubscribe = api.autoMode.onEvent(handleAutoModeEvent);
      }
    }

    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      unsubscribe?.();
    };
  }, [open, featureId, isBacklogPlan, handleAutoModeEvent, handleBacklogPlanEvent]);

  // Reset streamed content when modal opens or featureId changes
  useEffect(() => {
    if (open) {
      setStreamedContent('');
    }
  }, [open, featureId]);

  return {
    output,
    isLoading,
    streamedContent,
  };
}
