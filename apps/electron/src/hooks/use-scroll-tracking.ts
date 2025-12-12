import { useState, useEffect, useRef, useCallback } from "react";

interface ScrollTrackingItem {
  id: string;
}

interface UseScrollTrackingOptions<T extends ScrollTrackingItem> {
  /** Navigation items with at least an id property */
  items: T[];
  /** Optional filter function to determine which items should be tracked */
  filterFn?: (item: T) => boolean;
  /** Optional initial active section (defaults to first item's id) */
  initialSection?: string;
  /** Optional offset from top when scrolling to section (defaults to 24) */
  scrollOffset?: number;
}

/**
 * Generic custom hook for managing scroll-based navigation tracking
 * Automatically highlights the active section based on scroll position
 * and provides smooth scrolling to sections
 */
export function useScrollTracking<T extends ScrollTrackingItem>({
  items,
  filterFn = () => true,
  initialSection,
  scrollOffset = 24,
}: UseScrollTrackingOptions<T>) {
  const [activeSection, setActiveSection] = useState(
    initialSection || items[0]?.id || ""
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Track scroll position to highlight active nav item
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const sections = items
        .filter(filterFn)
        .map((item) => ({
          id: item.id,
          element: document.getElementById(item.id),
        }))
        .filter((s) => s.element);

      const containerRect = container.getBoundingClientRect();
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;

      // Check if scrolled to bottom (within a small threshold)
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;

      if (isAtBottom && sections.length > 0) {
        // If at bottom, highlight the last visible section
        setActiveSection(sections[sections.length - 1].id);
        return;
      }

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section.element) {
          const rect = section.element.getBoundingClientRect();
          const relativeTop = rect.top - containerRect.top + scrollTop;
          if (scrollTop >= relativeTop - 100) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [items, filterFn]);

  // Scroll to a specific section with smooth animation
  const scrollToSection = useCallback(
    (sectionId: string) => {
      const element = document.getElementById(sectionId);
      if (element && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const relativeTop =
          elementRect.top - containerRect.top + container.scrollTop;

        container.scrollTo({
          top: relativeTop - scrollOffset,
          behavior: "smooth",
        });
      }
    },
    [scrollOffset]
  );

  return {
    activeSection,
    scrollToSection,
    scrollContainerRef,
  };
}
