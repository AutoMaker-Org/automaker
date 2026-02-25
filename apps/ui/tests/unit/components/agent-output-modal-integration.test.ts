/**
 * Integration tests for AgentOutputModal component
 * These tests verify the actual functionality and user interactions of the modal
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AgentOutputModal } from '../../../src/components/views/board-view/dialogs/agent-output-modal';
import { useAppStore } from '@automaker/ui/store/app-store';
import { useAgentOutput } from '@automaker/ui/hooks/queries';
import { getElectronAPI } from '@automaker/ui/lib/electron';

// Mock dependencies
vi.mock('@automaker/ui/hooks/queries');
vi.mock('@automaker/ui/lib/electron');
vi.mock('@automaker/ui/store/app-store');

const mockUseAppStore = useAppStore as any;
const mockUseAgentOutput = useAgentOutput as any;
const mockGetElectronAPI = getElectronAPI as any;

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
    mockUseAppStore.mockImplementation((selector: any) => {
      if (selector === 'state') {
        return { useWorktrees: false };
      }
      return selector({ useWorktrees: false });
    });

    // Mock useAgentOutput with real output
    mockUseAgentOutput.mockReturnValue({
      data: mockOutput,
      isLoading: false,
    });

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

    it('should call onClose when clicking outside', async () => {
      render(<AgentOutputModal {...defaultProps} />);

      const overlay = screen.getByRole('dialog').parentElement;
      fireEvent.click(overlay);

      await waitFor(() => {
        expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('View Mode Switching', () => {
    beforeEach(() => {
      // Clean up any existing content
      document.body.innerHTML = '';
    });

    it('should default to parsed view when no summary is available', () => {
      // Mock empty summary
      vi.spyOn(require('@automaker/ui/lib/log-parser'), 'extractSummary').mockReturnValue('');

      render(<AgentOutputModal {...defaultProps} />);

      // LogViewer should be displayed when no summary
      expect(screen.getByTestId('view-mode-parsed')).toBeInTheDocument();
      expect(screen.getByText('LOGS')).toBeInTheDocument();
    });

    it('should default to summary view when summary is available', () => {
      // Mock summary
      vi.spyOn(require('@automaker/ui/lib/log-parser'), 'extractSummary').mockReturnValue('Test summary content');

      render(<AgentOutputModal {...defaultProps} />);

      // Summary button should be active when summary exists
      const summaryButton = screen.getByTestId('view-mode-summary');
      expect(summaryButton).toBeInTheDocument();
      expect(summaryButton).toHaveClass('bg-primary/20');
    });

    it('should switch to logs view when logs button is clicked', async () => {
      render(<AgentOutputModal {...defaultProps} />);

      const logsButton = screen.getByTestId('view-mode-parsed');
      fireEvent.click(logsButton);

      await waitFor(() => {
        // Find LogViewer component by its role or test id
        const logViewer = screen.getByRole('log');
        expect(logViewer).toBeInTheDocument();
      });
    });

    it('should switch to raw view when raw button is clicked', async () => {
      render(<AgentOutputModal {...defaultProps} />);

      const rawButton = screen.getByTestId('view-mode-raw');
      fireEvent.click(rawButton);

      await waitFor(() => {
        const contentArea = screen.getByRole('log');
        expect(contentArea).toHaveTextContent(mockOutput);
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
      });

      render(<AgentOutputModal {...defaultProps} />);

      expect(screen.getByText('Loading output...')).toBeInTheDocument();
    });

    it('should show no output message when output is empty', () => {
      mockUseAgentOutput.mockReturnValue({
        data: '',
        isLoading: false,
      });

      render(<AgentOutputModal {...defaultProps} />);

      expect(screen.getByText('No output yet. The agent will stream output here as it works.')).toBeInTheDocument();
    });

    it('should display parsed output in LogViewer', () => {
      render(<AgentOutputModal {...defaultProps} />);

      expect(screen.getByText('LOGS')).toBeInTheDocument();
    });
  });

  describe('Spinner Display', () => {
    it('should not show spinner when status is verified', () => {
      render(<AgentOutputModal {...defaultProps} featureStatus="verified" />);

      const spinner = screen.queryByRole('status');
      expect(spinner).not.toBeInTheDocument();
    });

    it('should not show spinner when status is waiting_approval', () => {
      render(<AgentOutputModal {...defaultProps} featureStatus="waiting_approval" />);

      const spinner = screen.queryByRole('status');
      expect(spinner).not.toBeInTheDocument();
    });

    it('should show spinner when status is running', () => {
      render(<AgentOutputModal {...defaultProps} featureStatus="running" />);

      expect(screen.getByRole('status')).toBeInTheDocument();
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
      render(<AgentOutputModal {...defaultProps} open={false} onNumberKeyPress={mockOnNumberKeyPress} />);

      fireEvent.keyDown(window, { key: '1', ctrlKey: false, altKey: false, metaKey: false });

      expect(mockOnNumberKeyPress).not.toHaveBeenCalled();
    });
  });

  describe('Auto-scrolling', () => {
    it('should auto-scroll to bottom when output changes', async () => {
      render(<AgentOutputModal {...defaultProps} />);

      const scrollContainer = screen.getByRole('log');

      // Mock scrollHeight and clientHeight
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 500, configurable: true });
      Object.defineProperty(scrollContainer, 'scrollTop', {
        value: 0,
        writable: true,
        configurable: true,
      });

      // Get the first render result
      const { rerender } = render(<AgentOutputModal {...defaultProps} />);

      // Simulate output update
      mockUseAgentOutput.mockReturnValue({
        data: mockOutput + '\nNew content',
        isLoading: false,
      });

      // Re-render the component with the same props to trigger update
      await act(async () => {
        rerender(<AgentOutputModal {...defaultProps} />);
      });

      expect(scrollContainer.scrollTop).toBe(500); // Should be at bottom
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
      (window as any).__currentProject = { path: '/fallback/project' };

      render(<AgentOutputModal {...defaultProps} />);

      expect(screen.getByText('Implement a responsive navigation menu')).toBeInTheDocument();
    });
  });

  describe('Branch Name Handling', () => {
    it('should display changes view when branchName is provided', async () => {
      render(<AgentOutputModal {...defaultProps} branchName="feature/test-branch" />);

      // Switch to changes view
      const changesButton = screen.getByTestId('view-mode-changes');
      fireEvent.click(changesButton);

      await waitFor(() => {
        expect(screen.getByText('CHANGES')).toBeInTheDocument();
      });
    });
  });
});