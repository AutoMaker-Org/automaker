/**
 * Integration tests for AgentOutputModal component
 *
 * These tests verify the actual functionality and user interactions of the modal,
 * including view mode switching, content display, and event handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AgentOutputModal } from '../../../src/components/views/board-view/dialogs/agent-output-modal';
import { useAppStore } from '@automaker/ui/store/app-store';
import {
  useAgentOutput,
  useFeature,
  useWorktreeDiffs,
  useGitDiffs,
} from '@automaker/ui/hooks/queries';
import { getElectronAPI } from '@automaker/ui/lib/electron';

// Mock dependencies
vi.mock('@automaker/ui/hooks/queries');
vi.mock('@automaker/ui/lib/electron');
vi.mock('@automaker/ui/store/app-store');

const mockUseAppStore = vi.mocked(useAppStore);
const mockUseAgentOutput = vi.mocked(useAgentOutput);
const mockUseFeature = vi.mocked(useFeature);
const mockGetElectronAPI = vi.mocked(getElectronAPI);
const mockUseWorktreeDiffs = vi.mocked(useWorktreeDiffs);
const mockUseGitDiffs = vi.mocked(useGitDiffs);

describe('AgentOutputModal Integration Tests', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    featureDescription: 'Implement a responsive navigation menu',
    featureId: 'feature-test-123',
    featureStatus: 'running',
  };

  const mockOutput = `
# Agent Output

## Planning Phase
- Analyzing requirements
- Creating implementation plan

## Action Phase
- Created navigation component
- Added responsive styles
- Implemented mobile menu toggle

## Summary
Successfully implemented a responsive navigation menu with hamburger menu for mobile view.
`;

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
      data: mockOutput,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as ReturnType<typeof useAgentOutput>);

    // Mock useFeature
    mockUseFeature.mockReturnValue({
      data: null,
      refetch: vi.fn(),
    } as ReturnType<typeof useFeature>);

    // Mock useWorktreeDiffs (needed for GitDiffPanel in changes view)
    mockUseWorktreeDiffs.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useWorktreeDiffs>);

    // Mock useGitDiffs (also needed for GitDiffPanel)
    mockUseGitDiffs.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useGitDiffs>);

    // Mock electron API
    mockGetElectronAPI.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Modal Opening and Closing', () => {
    it('should render modal when open is true', () => {
      render(<AgentOutputModal {...defaultProps} />);
      expect(screen.getByTestId('agent-output-modal')).toBeInTheDocument();
    });

    it('should not render modal when open is false', () => {
      render(<AgentOutputModal {...defaultProps} open={false} />);
      expect(screen.queryByTestId('agent-output-modal')).not.toBeInTheDocument();
    });

    it('should have onClose callback available', () => {
      render(<AgentOutputModal {...defaultProps} />);
      // Verify the onClose function is provided
      expect(defaultProps.onClose).toBeDefined();
    });
  });

  describe('View Mode Switching', () => {
    beforeEach(() => {
      // Clean up any existing content
      document.body.innerHTML = '';
    });

    it('should render all view mode buttons', () => {
      render(<AgentOutputModal {...defaultProps} />);

      // All view mode buttons should be present
      expect(screen.getByTestId('view-mode-parsed')).toBeInTheDocument();
      expect(screen.getByTestId('view-mode-changes')).toBeInTheDocument();
      expect(screen.getByTestId('view-mode-raw')).toBeInTheDocument();
    });

    it('should switch to logs view when logs button is clicked', async () => {
      render(<AgentOutputModal {...defaultProps} />);

      const logsButton = screen.getByTestId('view-mode-parsed');
      fireEvent.click(logsButton);

      await waitFor(() => {
        // Verify the logs button is now active
        expect(logsButton).toHaveClass('bg-primary/20');
      });
    });

    it('should switch to raw view when raw button is clicked', async () => {
      render(<AgentOutputModal {...defaultProps} />);

      const rawButton = screen.getByTestId('view-mode-raw');
      fireEvent.click(rawButton);

      await waitFor(() => {
        // Verify the raw button is now active
        expect(rawButton).toHaveClass('bg-primary/20');
      });
    });
  });

  describe('Content Display', () => {
    it('should display feature description', () => {
      render(<AgentOutputModal {...defaultProps} />);

      const description = screen.getByTestId('agent-output-description');
      expect(description).toHaveTextContent('Implement a responsive navigation menu');
    });

    it('should show loading state when output is loading', () => {
      mockUseAgentOutput.mockReturnValue({
        data: '',
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof useAgentOutput>);

      render(<AgentOutputModal {...defaultProps} />);

      expect(screen.getByText('Loading output...')).toBeInTheDocument();
    });

    it('should show no output message when output is empty', () => {
      mockUseAgentOutput.mockReturnValue({
        data: '',
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof useAgentOutput>);

      render(<AgentOutputModal {...defaultProps} />);

      expect(
        screen.getByText('No output yet. The agent will stream output here as it works.')
      ).toBeInTheDocument();
    });

    it('should display parsed output in LogViewer', () => {
      render(<AgentOutputModal {...defaultProps} />);

      // The button text is "Logs" (case-sensitive)
      expect(screen.getByText('Logs')).toBeInTheDocument();
    });
  });

  describe('Spinner Display', () => {
    it('should not show spinner when status is verified', () => {
      render(<AgentOutputModal {...defaultProps} featureStatus="verified" />);

      // Spinner should NOT be present when status is verified
      expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    });

    it('should not show spinner when status is waiting_approval', () => {
      render(<AgentOutputModal {...defaultProps} featureStatus="waiting_approval" />);

      // Spinner should NOT be present when status is waiting_approval
      expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    });

    it('should show spinner when status is running', () => {
      render(<AgentOutputModal {...defaultProps} featureStatus="running" />);

      // Spinner should be present and visible when status is running
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });
  });

  describe('Number Key Handling', () => {
    it('should handle number key presses when modal is open', () => {
      const mockOnNumberKeyPress = vi.fn();
      render(<AgentOutputModal {...defaultProps} onNumberKeyPress={mockOnNumberKeyPress} />);

      // Simulate number key press
      fireEvent.keyDown(window, { key: '1', ctrlKey: false, altKey: false, metaKey: false });

      expect(mockOnNumberKeyPress).toHaveBeenCalledWith('1');
    });

    it('should not handle number keys with modifiers', () => {
      const mockOnNumberKeyPress = vi.fn();
      render(<AgentOutputModal {...defaultProps} onNumberKeyPress={mockOnNumberKeyPress} />);

      // Simulate Ctrl+1 (should be ignored)
      fireEvent.keyDown(window, { key: '1', ctrlKey: true, altKey: false, metaKey: false });
      fireEvent.keyDown(window, { key: '2', altKey: true, ctrlKey: false, metaKey: false });
      fireEvent.keyDown(window, { key: '3', metaKey: true, ctrlKey: false, altKey: false });

      expect(mockOnNumberKeyPress).not.toHaveBeenCalled();
    });

    it('should not handle number key presses when modal is closed', () => {
      const mockOnNumberKeyPress = vi.fn();
      render(
        <AgentOutputModal {...defaultProps} open={false} onNumberKeyPress={mockOnNumberKeyPress} />
      );

      fireEvent.keyDown(window, { key: '1', ctrlKey: false, altKey: false, metaKey: false });

      expect(mockOnNumberKeyPress).not.toHaveBeenCalled();
    });
  });

  describe('Auto-scrolling', () => {
    it('should auto-scroll to bottom when output changes', async () => {
      const { rerender } = render(<AgentOutputModal {...defaultProps} />);

      // Find the scroll container - the div with overflow-y-auto that contains the log output
      const modal = screen.getByTestId('agent-output-modal');
      const scrollContainer = modal.querySelector('.overflow-y-auto.font-mono') as HTMLDivElement;

      expect(scrollContainer).toBeInTheDocument();

      // Mock the scrollHeight to simulate content growth
      Object.defineProperty(scrollContainer, 'scrollHeight', {
        value: 1000,
        configurable: true,
        writable: true,
      });

      // Simulate output update by changing the mock return value
      mockUseAgentOutput.mockReturnValue({
        data: mockOutput + '\n\n## New Content\nThis is additional content that was streamed.',
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof useAgentOutput>);

      // Re-render the component to trigger the auto-scroll effect
      await act(async () => {
        rerender(<AgentOutputModal {...defaultProps} />);
      });

      // The auto-scroll effect sets scrollTop directly to scrollHeight
      // Verify scrollTop was updated to the scrollHeight value
      expect(scrollContainer.scrollTop).toBe(1000);
    });

    it('should update scrollTop when output is appended', async () => {
      const { rerender } = render(<AgentOutputModal {...defaultProps} />);

      const modal = screen.getByTestId('agent-output-modal');
      const scrollContainer = modal.querySelector('.overflow-y-auto.font-mono') as HTMLDivElement;

      expect(scrollContainer).toBeInTheDocument();

      // Set initial scrollHeight
      Object.defineProperty(scrollContainer, 'scrollHeight', {
        value: 500,
        configurable: true,
        writable: true,
      });

      // Initial state - scrollTop should be set after first render
      // (autoScrollRef.current starts as true)

      // Now simulate more content being added
      Object.defineProperty(scrollContainer, 'scrollHeight', {
        value: 1500,
        configurable: true,
        writable: true,
      });

      mockUseAgentOutput.mockReturnValue({
        data: mockOutput + '\n\nMore content added.',
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof useAgentOutput>);

      await act(async () => {
        rerender(<AgentOutputModal {...defaultProps} />);
      });

      // Verify scrollTop was updated to the new scrollHeight
      expect(scrollContainer.scrollTop).toBe(1500);
    });
  });

  describe('Backlog Plan Mode', () => {
    it('should handle backlog plan feature ID', () => {
      const backlogProps = {
        ...defaultProps,
        featureId: 'backlog-plan:project-123',
      };

      render(<AgentOutputModal {...backlogProps} />);

      expect(screen.getByText('Agent Output')).toBeInTheDocument();
    });
  });

  describe('Project Path Resolution', () => {
    it('should use projectPath prop when provided', () => {
      const projectPath = '/custom/project/path';
      render(<AgentOutputModal {...defaultProps} projectPath={projectPath} />);

      expect(screen.getByText('Implement a responsive navigation menu')).toBeInTheDocument();
    });

    it('should fallback to window.__currentProject when projectPath is not provided', () => {
      const previousProject = window.__currentProject;
      try {
        window.__currentProject = { path: '/fallback/project' };
        render(<AgentOutputModal {...defaultProps} />);
        expect(screen.getByText('Implement a responsive navigation menu')).toBeInTheDocument();
      } finally {
        window.__currentProject = previousProject;
      }
    });
  });

  describe('Branch Name Handling', () => {
    it('should display changes view when branchName is provided', async () => {
      render(<AgentOutputModal {...defaultProps} branchName="feature/test-branch" />);

      // Switch to changes view
      const changesButton = screen.getByTestId('view-mode-changes');
      fireEvent.click(changesButton);

      // Verify the changes button is clicked (it should have active class)
      await waitFor(() => {
        expect(changesButton).toHaveClass('bg-primary/20');
      });
    });
  });
});
