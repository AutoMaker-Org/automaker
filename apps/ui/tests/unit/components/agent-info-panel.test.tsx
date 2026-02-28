/**
 * Unit tests for AgentInfoPanel component
 * Tests provider-aware model name display functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentInfoPanel } from '../../../src/components/views/board-view/components/kanban-card/agent-info-panel';
import { useAppStore } from '@automaker/ui/store/app-store';
import { useFeature, useAgentOutput } from '@automaker/ui/hooks/queries';
import { getElectronAPI } from '@automaker/ui/lib/electron';
import type { ClaudeCompatibleProvider } from '@automaker/types';
import type { ReactNode } from 'react';

// Mock dependencies
vi.mock('@automaker/ui/store/app-store');
vi.mock('@automaker/ui/hooks/queries');
vi.mock('@automaker/ui/lib/electron');

const mockUseAppStore = useAppStore as ReturnType<typeof vi.fn>;
const mockUseFeature = useFeature as ReturnType<typeof vi.fn>;
const mockUseAgentOutput = useAgentOutput as ReturnType<typeof vi.fn>;
const mockGetElectronAPI = getElectronAPI as ReturnType<typeof vi.fn>;

// Helper to create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('AgentInfoPanel', () => {
  const mockProviders: ClaudeCompatibleProvider[] = [
    {
      id: 'moonshot-ai',
      name: 'Moonshot AI',
      models: [
        { id: 'claude-sonnet-4-5', displayName: 'Moonshot v1.8' },
        { id: 'claude-opus-4-6', displayName: 'Moonshot v1.8 Pro' },
      ],
    },
    {
      id: 'zhipu',
      name: 'Zhipu AI',
      models: [{ id: 'claude-sonnet-4-5', displayName: 'GLM 4.7' }],
    },
  ];

  const createMockFeature = (overrides = {}) => ({
    id: 'feature-test-123',
    description: 'Test feature',
    status: 'backlog',
    model: 'claude-sonnet-4-5',
    providerId: undefined,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockUseAppStore.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
      const state = {
        claudeCompatibleProviders: [],
      };
      return selector(state);
    });

    mockUseFeature.mockReturnValue({
      data: null,
      isLoading: false,
    });

    mockUseAgentOutput.mockReturnValue({
      data: null,
      isLoading: false,
    });

    mockGetElectronAPI.mockReturnValue(null);
  });

  describe('Provider-aware model name display', () => {
    it('should display provider displayName when providerId matches Moonshot AI', () => {
      mockUseAppStore.mockImplementation(
        (selector: (state: Record<string, unknown>) => unknown) => {
          const state = {
            claudeCompatibleProviders: mockProviders,
          };
          return selector(state);
        }
      );

      const feature = createMockFeature({
        status: 'backlog',
        model: 'claude-sonnet-4-5',
        providerId: 'moonshot-ai',
      });

      render(<AgentInfoPanel feature={feature} projectPath="/test/project" />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByText('Moonshot v1.8')).toBeInTheDocument();
    });

    it('should display provider displayName when providerId matches Zhipu/GLM', () => {
      mockUseAppStore.mockImplementation(
        (selector: (state: Record<string, unknown>) => unknown) => {
          const state = {
            claudeCompatibleProviders: mockProviders,
          };
          return selector(state);
        }
      );

      const feature = createMockFeature({
        status: 'backlog',
        model: 'claude-sonnet-4-5',
        providerId: 'zhipu',
      });

      render(<AgentInfoPanel feature={feature} projectPath="/test/project" />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByText('GLM 4.7')).toBeInTheDocument();
    });

    it('should fallback to default model name when providerId is not found', () => {
      mockUseAppStore.mockImplementation(
        (selector: (state: Record<string, unknown>) => unknown) => {
          const state = {
            claudeCompatibleProviders: mockProviders,
          };
          return selector(state);
        }
      );

      const feature = createMockFeature({
        status: 'backlog',
        model: 'claude-sonnet-4-5',
        providerId: 'unknown-provider',
      });

      render(<AgentInfoPanel feature={feature} projectPath="/test/project" />, {
        wrapper: createWrapper(),
      });

      // Falls back to default formatting
      expect(screen.getByText('Sonnet 4.5')).toBeInTheDocument();
    });

    it('should fallback to default model name when providers list is empty', () => {
      mockUseAppStore.mockImplementation(
        (selector: (state: Record<string, unknown>) => unknown) => {
          const state = {
            claudeCompatibleProviders: [],
          };
          return selector(state);
        }
      );

      const feature = createMockFeature({
        status: 'backlog',
        model: 'claude-sonnet-4-5',
        providerId: 'moonshot-ai',
      });

      render(<AgentInfoPanel feature={feature} projectPath="/test/project" />, {
        wrapper: createWrapper(),
      });

      // Falls back to default formatting
      expect(screen.getByText('Sonnet 4.5')).toBeInTheDocument();
    });

    it('should use default model name when providerId is undefined', () => {
      mockUseAppStore.mockImplementation(
        (selector: (state: Record<string, unknown>) => unknown) => {
          const state = {
            claudeCompatibleProviders: mockProviders,
          };
          return selector(state);
        }
      );

      const feature = createMockFeature({
        status: 'backlog',
        model: 'claude-sonnet-4-5',
        providerId: undefined,
      });

      render(<AgentInfoPanel feature={feature} projectPath="/test/project" />, {
        wrapper: createWrapper(),
      });

      // Uses default formatting since no providerId
      expect(screen.getByText('Sonnet 4.5')).toBeInTheDocument();
    });

    it('should display correct model name for Opus models with provider', () => {
      mockUseAppStore.mockImplementation(
        (selector: (state: Record<string, unknown>) => unknown) => {
          const state = {
            claudeCompatibleProviders: mockProviders,
          };
          return selector(state);
        }
      );

      const feature = createMockFeature({
        status: 'backlog',
        model: 'claude-opus-4-6',
        providerId: 'moonshot-ai',
      });

      render(<AgentInfoPanel feature={feature} projectPath="/test/project" />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByText('Moonshot v1.8 Pro')).toBeInTheDocument();
    });

    it('should memoize model format options to prevent unnecessary re-renders', () => {
      mockUseAppStore.mockImplementation(
        (selector: (state: Record<string, unknown>) => unknown) => {
          const state = {
            claudeCompatibleProviders: mockProviders,
          };
          return selector(state);
        }
      );

      const feature = createMockFeature({
        status: 'backlog',
        model: 'claude-sonnet-4-5',
        providerId: 'moonshot-ai',
      });

      const { rerender } = render(
        <AgentInfoPanel feature={feature} projectPath="/test/project" />,
        { wrapper: createWrapper() }
      );

      // Rerender with the same feature (simulating parent re-render)
      rerender(<AgentInfoPanel feature={feature} projectPath="/test/project" />);

      // The component should use memoized options and still display correctly
      expect(screen.getByText('Moonshot v1.8')).toBeInTheDocument();
    });
  });

  describe('Model name display for different statuses', () => {
    it('should show model info for backlog features', () => {
      const feature = createMockFeature({
        status: 'backlog',
        model: 'claude-sonnet-4-5',
      });

      render(<AgentInfoPanel feature={feature} projectPath="/test/project" />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByText('Sonnet 4.5')).toBeInTheDocument();
    });

    it('should show model info for in_progress features with agentInfo', () => {
      mockUseAgentOutput.mockReturnValue({
        data: '🔧 Tool: Read\nInput: {"file": "test.ts"}',
        isLoading: false,
      });

      const feature = createMockFeature({
        status: 'in_progress',
        model: 'claude-sonnet-4-5',
      });

      render(
        <AgentInfoPanel feature={feature} projectPath="/test/project" isActivelyRunning={true} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('Sonnet 4.5')).toBeInTheDocument();
    });
  });
});
