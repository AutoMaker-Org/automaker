import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardBadges } from '../../../src/components/views/board-view/components/kanban-card/card-badges';

describe('CardBadges', () => {
  it('renders merge conflict warning badge when status is merge_conflict', () => {
    const feature = {
      id: 'feature-1',
      status: 'merge_conflict',
      error: undefined,
    } as any;

    render(<CardBadges feature={feature} />);

    expect(screen.getByTestId('merge-conflict-badge-feature-1')).toBeInTheDocument();
  });

  it('does not render badges when there is no error and no merge conflict', () => {
    const feature = {
      id: 'feature-2',
      status: 'backlog',
      error: undefined,
    } as any;

    const { container } = render(<CardBadges feature={feature} />);

    expect(container).toBeEmptyDOMElement();
  });
});
