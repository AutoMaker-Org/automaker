/**
 * Unit tests for AgentOutputModal responsive behavior
 *
 * These tests verify that Tailwind CSS responsive classes are correctly applied
 * to the modal across different viewport sizes (mobile, tablet, desktop).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AgentOutputModal } from '../../../src/components/views/board-view/dialogs/agent-output-modal';
import { useAppStore } from '@automaker/ui/store/app-store';
import { useAgentOutput } from '@automaker/ui/hooks/queries';
import { getElectronAPI } from '@automaker/ui/lib/electron';

// Mock dependencies
vi.mock('@automaker/ui/hooks/queries');
vi.mock('@automaker/ui/lib/electron');
vi.mock('@automaker/ui/store/app-store');

const mockUseAppStore = useAppStore as ReturnType<typeof useAppStore>;
const mockUseAgentOutput = useAgentOutput as ReturnType<typeof useAgentOutput>;
const mockGetElectronAPI = getElectronAPI as ReturnType<typeof getElectronAPI>;

describe('AgentOutputModal Responsive Behavior', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    featureDescription: 'Test feature description',
    featureId: 'test-feature-123',
    featureStatus: 'running',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock useAppStore
    mockUseAppStore.mockImplementation((selector) => {
      if (selector === 'state') {
        return { useWorktrees: false };
      }
      return selector({ useWorktrees: false });
    });

    // Mock useAgentOutput
    mockUseAgentOutput.mockReturnValue({
      data: '',
      isLoading: false,
      error: null,
    } as ReturnType<typeof useAgentOutput>);

    // Mock electron API
    mockGetElectronAPI.mockReturnValue(null);
  });

  describe('Mobile Screen (< 640px)', () => {
    it('should use full width on mobile screens', () => {
      // Set up viewport for mobile
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 639px)',
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }));

      render(<AgentOutputModal {...defaultProps} />);

      // Find the DialogContent element
      const dialogContent = screen.getByTestId('agent-output-modal');
      // Base class should be present
      expect(dialogContent).toHaveClass('w-full');
      // In Tailwind, all responsive classes are always present on the element
      // The browser determines which ones apply based on viewport
      expect(dialogContent).toHaveClass('sm:w-[60vw]');
      expect(dialogContent).toHaveClass('md:w-[90vw]');
      expect(dialogContent).toHaveClass('md:max-w-[1200px]');
    });

    it('should use max-w-[calc(100%-2rem)] on mobile', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 639px)',
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }));

      render(<AgentOutputModal {...defaultProps} />);

      const dialogContent = screen.getByTestId('agent-output-modal');
      expect(dialogContent).toHaveClass('max-w-[calc(100%-2rem)]');
    });
  });

  describe('Small Screen (640px - < 768px)', () => {
    it('should use 60vw on small screens', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(min-width: 640px) and (max-width: 767px)',
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }));

      render(<AgentOutputModal {...defaultProps} />);

      const dialogContent = screen.getByTestId('agent-output-modal');
      // At sm breakpoint, sm:w-[60vw] should be applied (takes precedence over w-full)
      expect(dialogContent).toHaveClass('sm:w-[60vw]');
      expect(dialogContent).toHaveClass('sm:max-w-[60vw]');
      // md: classes are still present in Tailwind (just not applied at sm breakpoint)
      expect(dialogContent).toHaveClass('md:w-[90vw]');
    });

    it('should use 80vh height on small screens', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(min-width: 640px) and (max-width: 767px)',
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }));

      render(<AgentOutputModal {...defaultProps} />);

      const dialogContent = screen.getByTestId('agent-output-modal');
      // At sm breakpoint, sm:max-h-[80vh] should be applied
      expect(dialogContent).toHaveClass('sm:max-h-[80vh]');
      // md: class is still present in Tailwind (just not applied at sm breakpoint)
      expect(dialogContent).toHaveClass('md:max-h-[85vh]');
    });
  });

  describe('Tablet Screen (≥ 768px)', () => {
    it('should use 90vw on tablet screens', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(min-width: 768px)',
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }));

      render(<AgentOutputModal {...defaultProps} />);

      const dialogContent = screen.getByTestId('agent-output-modal');
      // At md breakpoint, the md:w-[90vw] class should be present
      expect(dialogContent).toHaveClass('md:w-[90vw]');
      // The md:max-w-[1200px] overrides the sm:max-w-[60vw]
      expect(dialogContent).toHaveClass('md:max-w-[1200px]');
      // The md:max-h-[85vh] overrides the sm:max-h-[80vh]
      expect(dialogContent).toHaveClass('md:max-h-[85vh]');
      // sm: classes are still present (Tailwind cascades), but md: classes take precedence
      expect(dialogContent).toHaveClass('sm:max-w-[60vw]');
      expect(dialogContent).toHaveClass('sm:max-h-[80vh]');
    });

    it('should use max-w-[1200px] on tablet screens', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(min-width: 768px)',
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }));

      render(<AgentOutputModal {...defaultProps} />);

      const dialogContent = screen.getByTestId('agent-output-modal');
      // At md breakpoint, md:max-w-[1200px] should be present and override sm:max-w-[60vw]
      expect(dialogContent).toHaveClass('md:max-w-[1200px]');
      // sm: class is still present but md: takes precedence in Tailwind
      expect(dialogContent).toHaveClass('sm:max-w-[60vw]');
    });

    it('should use 85vh height on tablet screens', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(min-width: 768px)',
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }));

      render(<AgentOutputModal {...defaultProps} />);

      const dialogContent = screen.getByTestId('agent-output-modal');
      // At md breakpoint, md:max-h-[85vh] should be present and override sm:max-h-[80vh]
      expect(dialogContent).toHaveClass('md:max-h-[85vh]');
      // sm: class is still present but md: takes precedence in Tailwind
      expect(dialogContent).toHaveClass('sm:max-h-[80vh]');
    });
  });

  describe('Responsive behavior combinations', () => {
    it('should apply all responsive classes correctly', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(min-width: 768px)',
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }));

      render(<AgentOutputModal {...defaultProps} />);

      const dialogContent = screen.getByTestId('agent-output-modal');

      // Check base classes
      expect(dialogContent).toHaveClass('w-full');
      expect(dialogContent).toHaveClass('max-h-[85dvh]');
      expect(dialogContent).toHaveClass('max-w-[calc(100%-2rem)]');

      // Check small screen classes
      expect(dialogContent).toHaveClass('sm:w-[60vw]');
      expect(dialogContent).toHaveClass('sm:max-w-[60vw]');
      expect(dialogContent).toHaveClass('sm:max-h-[80vh]');

      // Check medium screen classes
      expect(dialogContent).toHaveClass('md:w-[90vw]');
      expect(dialogContent).toHaveClass('md:max-w-[1200px]');
      expect(dialogContent).toHaveClass('md:max-h-[85vh]');
    });
  });

  describe('Modal closed state', () => {
    it('should not render when closed', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 639px)',
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }));

      render(<AgentOutputModal {...defaultProps} open={false} />);

      expect(screen.queryByTestId('agent-output-modal')).not.toBeInTheDocument();
    });
  });

  describe('Viewport changes', () => {
    it('should update when window is resized', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 639px)',
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }));

      const { rerender } = render(<AgentOutputModal {...defaultProps} />);

      // Update to tablet size
      (window.matchMedia as any).mockImplementation((query: string) => ({
        matches: query === '(min-width: 768px)',
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }));

      // Simulate resize by re-rendering
      rerender(<AgentOutputModal {...defaultProps} />);

      const dialogContent = screen.getByTestId('agent-output-modal');
      expect(dialogContent).toHaveClass('md:w-[90vw]');
    });
  });
});
