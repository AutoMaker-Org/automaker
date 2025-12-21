import { useState, useEffect, useCallback, CSSProperties } from 'react';

export interface ResponsiveKanbanConfig {
  columnWidth: number;
  columnMinWidth: number;
  columnMaxWidth: number;
  gap: number;
  padding: number;
}

const DEFAULT_CONFIG: ResponsiveKanbanConfig = {
  columnWidth: 288, // 18rem = 288px (w-72)
  columnMinWidth: 220, // Minimum column width - increased to ensure usability
  columnMaxWidth: 440, // Maximum column width to ensure responsive scaling
  gap: 20, // gap-5 = 20px
  padding: 32, // px-4 on both sides = 32px
};

export interface UseResponsiveKanbanResult {
  columnWidth: number;
  containerStyle: CSSProperties;
  isCompact: boolean;
}

/**
 * Gets the board container element from the DOM
 * @returns The parent element of the board-view element, or null if not found
 */
function getBoardContainer(): HTMLElement | null {
  return (
    document.querySelector('[data-testid="board-view"]')?.parentElement ?? null
  );
}

/**
 * Hook to calculate responsive Kanban column widths based on window size.
 * Ensures columns scale intelligently to fill available space without
 * dead space on the right or content being cut off.
 *
 * @param columnCount - Number of columns in the Kanban board
 * @param config - Optional configuration for column sizing
 * @returns Object with calculated column width and container styles
 */
export function useResponsiveKanban(
  columnCount: number = 4,
  config: Partial<ResponsiveKanbanConfig> = {}
): UseResponsiveKanbanResult {
  const { columnMinWidth, columnMaxWidth, gap, padding } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const calculateColumnWidth = useCallback(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_CONFIG.columnWidth;
    }

    // Get the actual board container width
    // The flex layout already accounts for sidebar width, so we use the container's actual width
    const boardContainer = getBoardContainer();
    const containerWidth = boardContainer
      ? boardContainer.clientWidth
      : window.innerWidth;

    // Get the available width (subtract padding only)
    const availableWidth = containerWidth - padding;

    // Calculate total gap space needed
    const totalGapWidth = gap * (columnCount - 1);

    // Calculate width available for all columns
    const widthForColumns = availableWidth - totalGapWidth;

    // Calculate ideal column width
    let idealWidth = Math.floor(widthForColumns / columnCount);

    // Clamp to min/max bounds
    idealWidth = Math.max(columnMinWidth, Math.min(columnMaxWidth, idealWidth));

    return idealWidth;
  }, [columnCount, columnMinWidth, columnMaxWidth, gap, padding]);

  const [columnWidth, setColumnWidth] = useState<number>(() =>
    calculateColumnWidth()
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const newWidth = calculateColumnWidth();
      setColumnWidth(newWidth);
    };

    // Set initial width
    handleResize();

    // Flag to prevent race condition when component unmounts before retry timeout fires
    let cleanedUp = false;
    let observer: ResizeObserver | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    const setupObserver = () => {
      const boardContainer = getBoardContainer();
      if (boardContainer && typeof window.ResizeObserver !== 'undefined') {
        observer = new window.ResizeObserver(handleResize);
        observer.observe(boardContainer);
        return true;
      }
      return false;
    };

    const observerCleanup = () => {
      if (observer) {
        observer.disconnect();
      }
    };

    if (setupObserver()) {
      return () => {
        observerCleanup();
      };
    }

    // Element might not be mounted yet, retry after a short delay
    retryTimeout = setTimeout(() => {
      // Guard against race condition: don't create observer if component already unmounted
      if (cleanedUp) return;

      // If the observer is successfully set up on retry, remove the fallback listener
      // to prevent handleResize from being called by both the observer and the window event.
      if (setupObserver()) {
        window.removeEventListener('resize', handleResize);
      }
    }, 100);

    // Fallback to window resize event
    window.addEventListener('resize', handleResize);

    return () => {
      cleanedUp = true; // Set flag first to prevent race condition with pending timeout
      observerCleanup();
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [calculateColumnWidth]);

  // Determine if we're in compact mode (columns at minimum width)
  const isCompact = columnWidth <= columnMinWidth + 10;

  // Container style to center content and prevent overflow
  const containerStyle: CSSProperties = {
    display: 'flex',
    gap: `${gap}px`,
    height: '100%',
    justifyContent: 'center',
  };

  return {
    columnWidth,
    containerStyle,
    isCompact,
  };
}
