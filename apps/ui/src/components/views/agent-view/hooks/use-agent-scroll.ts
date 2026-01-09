import { useRef, useState, useCallback, useEffect } from 'react';

interface UseAgentScrollOptions {
  messagesLength: number;
  currentSessionId: string | null;
}

interface UseAgentScrollResult {
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  isUserAtBottom: boolean;
  handleScroll: () => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export function useAgentScroll({
  messagesLength,
  currentSessionId,
}: UseAgentScrollOptions): UseAgentScrollResult {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);

  // Scroll position detection
  const checkIfUserIsAtBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const threshold = 50; // 50px threshold for "near bottom"
    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;

    setIsUserAtBottom(isAtBottom);
  }, []);

  // Scroll to bottom function
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: behavior,
    });
  }, []);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    checkIfUserIsAtBottom();
  }, [checkIfUserIsAtBottom]);

  // Auto-scroll effect when messages change
  useEffect(() => {
    // Only auto-scroll if user was already at bottom
    if (isUserAtBottom && messagesLength > 0) {
      // Use a small delay to ensure DOM is updated
      setTimeout(() => {
        scrollToBottom('smooth');
      }, 100);
    }
  }, [messagesLength, isUserAtBottom, scrollToBottom]);

  // Initial scroll to bottom when session changes
  useEffect(() => {
    if (currentSessionId && messagesLength > 0) {
      // Scroll immediately without animation when switching sessions
      setTimeout(() => {
        scrollToBottom('auto');
        setIsUserAtBottom(true);
      }, 100);
    }
  }, [currentSessionId, scrollToBottom, messagesLength]);

  return {
    messagesContainerRef,
    isUserAtBottom,
    handleScroll,
    scrollToBottom,
  };
}
