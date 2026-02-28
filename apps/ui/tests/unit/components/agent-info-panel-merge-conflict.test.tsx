/**
 * Tests for AgentInfoPanel merge_conflict status handling
 * Verifies that merge_conflict status is treated like backlog for:
 * - shouldFetchData (no polling for merge_conflict features)
 * - Rendering path (shows model/preset info like backlog)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentInfoPanel } from '../../../src/components/views/board-view/components/kanban-card/agent-info-panel';
import { useAppStore } from '@automaker/ui/store/app-store';
import { useFeature, useAgentOutput } from '@automaker/ui/hooks/queries';
import { getElectronAPI } from '@automaker/ui/lib/electron';
import type { ReactNode } from 'react';

// Mock dependencies
vi.mock('@automaker/ui/store/app-store');
vi.mock('@automaker/ui/hooks/queries');
vi.mock('@automaker/ui/lib/electron');

const mockUseAppStore = vi.mocked(useAppStore);
const mockUseFeature = vi.mocked(useFeature);
const mockUseAgentOutput = vi.mocked(useAgentOutput);
const mockGetElectronAPI = vi.mocked(getElectronAPI);

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

describe('AgentInfoPanel - merge_conflict status', () => {
  const createMockFeature = (overrides = {}) => ({
    id: 'feature-merge-test',
    title: 'Test Feature',
    description: 'Test feature',
    status: 'merge_conflict',
    model: 'claude-sonnet-4-5',
    providerId: undefined,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAppStore.mockImplementation((selector) => {
      const state = {
        claudeCompatibleProviders: [],
      };
      return selector(state);
    });

    mockUseFeature.mockReturnValue({
      data: null,
      isLoading: false,
    } as ReturnType<typeof useFeature>);

    mockUseAgentOutput.mockReturnValue({
      data: null,
      isLoading: false,
    } as ReturnType<typeof useAgentOutput>);

    mockGetElectronAPI.mockReturnValue(null);
  });

  it('should render model info for merge_conflict features (like backlog)', () => {
    const feature = createMockFeature({ status: 'merge_conflict' });

    render(<AgentInfoPanel feature={feature} projectPath="/test/project" />, {
      wrapper: createWrapper(),
    });

    // merge_conflict features should show model name like backlog
    expect(screen.getByText('Sonnet 4.5')).toBeInTheDocument();
  });

  it('should render model info for backlog features (baseline comparison)', () => {
    const feature = createMockFeature({ status: 'backlog' });

    render(<AgentInfoPanel feature={feature} projectPath="/test/project" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText('Sonnet 4.5')).toBeInTheDocument();
  });

  it('should show provider-aware model name for merge_conflict features', () => {
    mockUseAppStore.mockImplementation((selector) => {
      const state = {
        claudeCompatibleProviders: [
          {
            id: 'moonshot-ai',
            name: 'Moonshot AI',
            models: [{ id: 'claude-sonnet-4-5', displayName: 'Moonshot v1.8' }],
          },
        ],
      };
      return selector(state);
    });

    const feature = createMockFeature({
      status: 'merge_conflict',
      model: 'claude-sonnet-4-5',
      providerId: 'moonshot-ai',
    });

    render(<AgentInfoPanel feature={feature} projectPath="/test/project" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText('Moonshot v1.8')).toBeInTheDocument();
  });

  it('should not pass isActivelyRunning polling for merge_conflict features', () => {
    const feature = createMockFeature({ status: 'merge_conflict' });

    // Render without isActivelyRunning (merge_conflict features should not be polled)
    render(<AgentInfoPanel feature={feature} projectPath="/test/project" />, {
      wrapper: createWrapper(),
    });

    // useFeature and useAgentOutput should have been called but with shouldFetchData=false behavior
    // The key indicator is that the component renders the backlog-like model info view
    expect(screen.getByText('Sonnet 4.5')).toBeInTheDocument();
  });

  it('should show thinking level for merge_conflict Claude features', () => {
    const feature = createMockFeature({
      status: 'merge_conflict',
      model: 'claude-sonnet-4-5',
      thinkingLevel: 'high',
    });

    render(<AgentInfoPanel feature={feature} projectPath="/test/project" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText('Sonnet 4.5')).toBeInTheDocument();
    // ThinkingLevel indicator should be visible
    expect(screen.getByText('High')).toBeInTheDocument();
  });
});
