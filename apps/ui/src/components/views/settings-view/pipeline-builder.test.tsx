import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PipelineBuilder } from '../pipeline-builder';
import { DEFAULT_PIPELINE_CONFIG } from '@automaker/types';

describe('PipelineBuilder', () => {
  const mockOnSave = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders pipeline builder with existing steps', () => {
    render(
      <PipelineBuilder config={DEFAULT_PIPELINE_CONFIG} onSave={mockOnSave} onClose={mockOnClose} />
    );

    expect(screen.getByText('Visual Pipeline Builder')).toBeInTheDocument();
    expect(screen.getByText('Pipeline Flow')).toBeInTheDocument();
    expect(screen.getByText('Add Step')).toBeInTheDocument();
  });

  it('adds a new step when clicking step buttons', async () => {
    render(
      <PipelineBuilder config={DEFAULT_PIPELINE_CONFIG} onSave={mockOnSave} onClose={mockOnClose} />
    );

    const reviewButton = screen.getByText('Review');
    fireEvent.click(reviewButton);

    await waitFor(() => {
      expect(screen.getByText('New review step')).toBeInTheDocument();
    });
  });

  it('enables drag and drop functionality', () => {
    render(
      <PipelineBuilder
        config={{
          ...DEFAULT_PIPELINE_CONFIG,
          steps: [
            {
              id: 'step-1',
              type: 'review',
              name: 'Review Step',
              model: 'opus',
              required: true,
              autoTrigger: true,
              config: {},
            },
            {
              id: 'step-2',
              type: 'security',
              name: 'Security Step',
              model: 'opus',
              required: true,
              autoTrigger: true,
              config: {},
            },
          ],
        }}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const steps = screen.getAllByRole('generic')[1]; // Get the first step container
    expect(steps).toHaveAttribute('draggable');
  });

  it('saves pipeline configuration', async () => {
    render(
      <PipelineBuilder config={DEFAULT_PIPELINE_CONFIG} onSave={mockOnSave} onClose={mockOnClose} />
    );

    const saveButton = screen.getByText('Save Pipeline');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(DEFAULT_PIPELINE_CONFIG);
    });
  });

  it('closes without saving when clicking cancel', async () => {
    render(
      <PipelineBuilder config={DEFAULT_PIPELINE_CONFIG} onSave={mockOnSave} onClose={mockOnClose} />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });

  it('displays pipeline statistics', () => {
    const configWithSteps = {
      ...DEFAULT_PIPELINE_CONFIG,
      steps: [
        {
          id: 'step-1',
          type: 'review',
          name: 'Review Step',
          model: 'opus',
          required: true,
          autoTrigger: true,
          config: {},
        },
        {
          id: 'step-2',
          type: 'security',
          name: 'Security Step',
          model: 'opus',
          required: false,
          autoTrigger: false,
          config: {},
        },
      ],
    };

    render(<PipelineBuilder config={configWithSteps} onSave={mockOnSave} onClose={mockOnClose} />);

    expect(screen.getByText('2')).toBeInTheDocument(); // Total Steps
    expect(screen.getByText('1')).toBeInTheDocument(); // Required
    expect(screen.getByText('1')).toBeInTheDocument(); // Auto Trigger
  });
});
