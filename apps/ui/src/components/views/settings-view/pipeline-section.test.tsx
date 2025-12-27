import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PipelineSection } from '../pipeline-section';
import { DEFAULT_PIPELINE_CONFIG } from '@automaker/types';

describe('PipelineSection', () => {
  const mockOnPipelineChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders pipeline settings', () => {
    render(
      <PipelineSection
        pipelineConfig={DEFAULT_PIPELINE_CONFIG}
        onPipelineChange={mockOnPipelineChange}
      />
    );

    expect(screen.getByText('Pipeline Configuration')).toBeInTheDocument();
    expect(screen.getByText('Enable automated pipeline')).toBeInTheDocument();
  });

  it('toggles pipeline enabled state', async () => {
    const user = userEvent.setup();
    render(
      <PipelineSection
        pipelineConfig={DEFAULT_PIPELINE_CONFIG}
        onPipelineChange={mockOnPipelineChange}
      />
    );

    const toggle = screen.getByRole('switch');
    await user.click(toggle);

    expect(mockOnPipelineChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('exports pipeline configuration', async () => {
    // Mock URL.createObjectURL and download
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:url');
    global.URL.createObjectURL = mockCreateObjectURL;

    // Mock createElement and click
    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };
    const mockCreateElement = vi.fn().mockReturnValue(mockAnchor);
    global.document.createElement = mockCreateElement;

    render(
      <PipelineSection
        pipelineConfig={DEFAULT_PIPELINE_CONFIG}
        onPipelineChange={mockOnPipelineChange}
      />
    );

    const exportButton = screen.getByText('Export');
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockAnchor.click).toHaveBeenCalled();
    });
  });

  it('imports pipeline configuration', async () => {
    const fileContent = JSON.stringify({
      version: '1.0',
      enabled: true,
      steps: [
        {
          id: 'imported-step',
          type: 'review',
          name: 'Imported Step',
          model: 'opus',
          required: true,
          autoTrigger: true,
          config: {},
        },
      ],
    });

    const file = new File([fileContent], 'pipeline.json', { type: 'application/json' });

    render(
      <PipelineSection
        pipelineConfig={DEFAULT_PIPELINE_CONFIG}
        onPipelineChange={mockOnPipelineChange}
      />
    );

    const importInput = screen.getByLabelText('Import pipeline configuration');
    fireEvent.change(importInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockOnPipelineChange).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({
              id: 'imported-step',
              name: 'Imported Step',
            }),
          ]),
        })
      );
    });
  });

  it('validates pipeline configuration', async () => {
    const invalidConfig = {
      ...DEFAULT_PIPELINE_CONFIG,
      enabled: true,
      steps: [], // No steps but enabled
    };

    render(
      <PipelineSection pipelineConfig={invalidConfig} onPipelineChange={mockOnPipelineChange} />
    );

    // Validation error should be displayed
    await waitFor(() => {
      expect(screen.getByText(/Pipeline is enabled but has no steps/)).toBeInTheDocument();
    });
  });

  it('adds a new step', async () => {
    const user = userEvent.setup();
    render(
      <PipelineSection
        pipelineConfig={DEFAULT_PIPELINE_CONFIG}
        onPipelineChange={mockOnPipelineChange}
      />
    );

    const addButton = screen.getByText('Add Step');
    await user.click(addButton);

    expect(mockOnPipelineChange).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: expect.arrayContaining([
          expect.objectContaining({
            id: expect.stringMatching(/^step-\d+$/),
            name: 'New Step',
          }),
        ]),
      })
    );
  });

  it('deletes a step', async () => {
    const user = userEvent.setup();
    const configWithStep = {
      ...DEFAULT_PIPELINE_CONFIG,
      steps: [
        {
          id: 'step-to-delete',
          type: 'review',
          name: 'Step to Delete',
          model: 'opus',
          required: true,
          autoTrigger: true,
          config: {},
        },
      ],
    };

    render(
      <PipelineSection pipelineConfig={configWithStep} onPipelineChange={mockOnPipelineChange} />
    );

    const deleteButton = screen.getByLabelText('Delete step');
    await user.click(deleteButton);

    expect(mockOnPipelineChange).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [],
      })
    );
  });

  it('resets to default configuration', async () => {
    const user = userEvent.setup();
    const customConfig = {
      ...DEFAULT_PIPELINE_CONFIG,
      steps: [
        {
          id: 'custom-step',
          type: 'review',
          name: 'Custom Step',
          model: 'opus',
          required: true,
          autoTrigger: true,
          config: {},
        },
      ],
    };

    render(
      <PipelineSection pipelineConfig={customConfig} onPipelineChange={mockOnPipelineChange} />
    );

    const resetButton = screen.getByText('Reset');
    await user.click(resetButton);

    expect(mockOnPipelineChange).toHaveBeenCalledWith(DEFAULT_PIPELINE_CONFIG);
  });
});
