import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardActions } from '../../../src/components/views/board-view/components/kanban-card/card-actions';
import type { Feature } from '@automaker/types';

describe('CardActions', () => {
  it('renders backlog logs button when context exists', () => {
    const feature = {
      id: 'feature-logs',
      status: 'backlog',
      error: undefined,
    } as unknown as Feature;

    render(
      <CardActions
        feature={feature}
        isCurrentAutoTask={false}
        isRunningTask={false}
        hasContext
        onEdit={vi.fn()}
        onViewOutput={vi.fn()}
        onImplement={vi.fn()}
      />
    );

    expect(screen.getByTestId('view-output-backlog-feature-logs')).toBeInTheDocument();
  });

  it('does not render backlog logs button without context', () => {
    const feature = {
      id: 'feature-no-logs',
      status: 'backlog',
      error: undefined,
    } as unknown as Feature;

    render(
      <CardActions
        feature={feature}
        isCurrentAutoTask={false}
        isRunningTask={false}
        onEdit={vi.fn()}
        onViewOutput={vi.fn()}
        onImplement={vi.fn()}
      />
    );

    expect(screen.queryByTestId('view-output-backlog-feature-no-logs')).not.toBeInTheDocument();
  });
});
