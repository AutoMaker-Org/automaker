/**
 * Tests for default fields applied to features created by parseAndCreateFeatures
 *
 * Verifies that auto-created features include planningMode: 'skip',
 * requirePlanApproval: false, and dependencies: [].
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// Use vi.hoisted to create mock functions that can be referenced in vi.mock factories
const { mockMkdir, mockAtomicWriteJson, mockExtractJsonWithArray, mockCreateNotification } =
  vi.hoisted(() => ({
    mockMkdir: vi.fn().mockResolvedValue(undefined),
    mockAtomicWriteJson: vi.fn().mockResolvedValue(undefined),
    mockExtractJsonWithArray: vi.fn(),
    mockCreateNotification: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('@/lib/secure-fs.js', () => ({
  mkdir: mockMkdir,
}));

vi.mock('@automaker/utils', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  atomicWriteJson: mockAtomicWriteJson,
  DEFAULT_BACKUP_COUNT: 3,
}));

vi.mock('@automaker/platform', () => ({
  getFeaturesDir: vi.fn((projectPath: string) => path.join(projectPath, '.automaker', 'features')),
}));

vi.mock('@/lib/json-extractor.js', () => ({
  extractJsonWithArray: mockExtractJsonWithArray,
}));

vi.mock('@/services/notification-service.js', () => ({
  getNotificationService: vi.fn(() => ({
    createNotification: mockCreateNotification,
  })),
}));

// Import after mocks are set up
import { parseAndCreateFeatures } from '../../../../src/routes/app-spec/parse-and-create-features.js';

describe('parseAndCreateFeatures - default fields', () => {
  const mockEvents = {
    emit: vi.fn(),
  } as any;

  const projectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set planningMode to "skip" on created features', async () => {
    mockExtractJsonWithArray.mockReturnValue({
      features: [
        {
          id: 'feature-1',
          title: 'Test Feature',
          description: 'A test feature',
          priority: 1,
          complexity: 'simple',
        },
      ],
    });

    await parseAndCreateFeatures(projectPath, 'content', mockEvents);

    expect(mockAtomicWriteJson).toHaveBeenCalledTimes(1);
    const writtenData = mockAtomicWriteJson.mock.calls[0][1];
    expect(writtenData.planningMode).toBe('skip');
  });

  it('should set requirePlanApproval to false on created features', async () => {
    mockExtractJsonWithArray.mockReturnValue({
      features: [
        {
          id: 'feature-1',
          title: 'Test Feature',
          description: 'A test feature',
        },
      ],
    });

    await parseAndCreateFeatures(projectPath, 'content', mockEvents);

    const writtenData = mockAtomicWriteJson.mock.calls[0][1];
    expect(writtenData.requirePlanApproval).toBe(false);
  });

  it('should set dependencies to empty array when not provided', async () => {
    mockExtractJsonWithArray.mockReturnValue({
      features: [
        {
          id: 'feature-1',
          title: 'Test Feature',
          description: 'A test feature',
        },
      ],
    });

    await parseAndCreateFeatures(projectPath, 'content', mockEvents);

    const writtenData = mockAtomicWriteJson.mock.calls[0][1];
    expect(writtenData.dependencies).toEqual([]);
  });

  it('should preserve dependencies when provided by the parser', async () => {
    mockExtractJsonWithArray.mockReturnValue({
      features: [
        {
          id: 'feature-1',
          title: 'Test Feature',
          description: 'A test feature',
          dependencies: ['feature-0'],
        },
      ],
    });

    await parseAndCreateFeatures(projectPath, 'content', mockEvents);

    const writtenData = mockAtomicWriteJson.mock.calls[0][1];
    expect(writtenData.dependencies).toEqual(['feature-0']);
  });

  it('should apply all default fields consistently across multiple features', async () => {
    mockExtractJsonWithArray.mockReturnValue({
      features: [
        {
          id: 'feature-1',
          title: 'Feature 1',
          description: 'First feature',
        },
        {
          id: 'feature-2',
          title: 'Feature 2',
          description: 'Second feature',
          dependencies: ['feature-1'],
        },
        {
          id: 'feature-3',
          title: 'Feature 3',
          description: 'Third feature',
        },
      ],
    });

    await parseAndCreateFeatures(projectPath, 'content', mockEvents);

    expect(mockAtomicWriteJson).toHaveBeenCalledTimes(3);

    for (let i = 0; i < 3; i++) {
      const writtenData = mockAtomicWriteJson.mock.calls[i][1];
      expect(writtenData.planningMode, `feature ${i + 1} planningMode`).toBe('skip');
      expect(writtenData.requirePlanApproval, `feature ${i + 1} requirePlanApproval`).toBe(false);
      expect(Array.isArray(writtenData.dependencies), `feature ${i + 1} dependencies`).toBe(true);
    }

    // Feature 2 should have its explicit dependency preserved
    expect(mockAtomicWriteJson.mock.calls[1][1].dependencies).toEqual(['feature-1']);
    // Features 1 and 3 should have empty arrays
    expect(mockAtomicWriteJson.mock.calls[0][1].dependencies).toEqual([]);
    expect(mockAtomicWriteJson.mock.calls[2][1].dependencies).toEqual([]);
  });

  it('should set status to "backlog" on all created features', async () => {
    mockExtractJsonWithArray.mockReturnValue({
      features: [
        {
          id: 'feature-1',
          title: 'Test Feature',
          description: 'A test feature',
        },
      ],
    });

    await parseAndCreateFeatures(projectPath, 'content', mockEvents);

    const writtenData = mockAtomicWriteJson.mock.calls[0][1];
    expect(writtenData.status).toBe('backlog');
  });

  it('should include createdAt and updatedAt timestamps', async () => {
    mockExtractJsonWithArray.mockReturnValue({
      features: [
        {
          id: 'feature-1',
          title: 'Test Feature',
          description: 'A test feature',
        },
      ],
    });

    await parseAndCreateFeatures(projectPath, 'content', mockEvents);

    const writtenData = mockAtomicWriteJson.mock.calls[0][1];
    expect(writtenData.createdAt).toBeDefined();
    expect(writtenData.updatedAt).toBeDefined();
    // Should be valid ISO date strings
    expect(new Date(writtenData.createdAt).toISOString()).toBe(writtenData.createdAt);
    expect(new Date(writtenData.updatedAt).toISOString()).toBe(writtenData.updatedAt);
  });

  it('should use default values for optional fields not provided', async () => {
    mockExtractJsonWithArray.mockReturnValue({
      features: [
        {
          id: 'feature-minimal',
          title: 'Minimal Feature',
          description: 'Only required fields',
        },
      ],
    });

    await parseAndCreateFeatures(projectPath, 'content', mockEvents);

    const writtenData = mockAtomicWriteJson.mock.calls[0][1];
    expect(writtenData.category).toBe('Uncategorized');
    expect(writtenData.priority).toBe(2);
    expect(writtenData.complexity).toBe('moderate');
    expect(writtenData.dependencies).toEqual([]);
    expect(writtenData.planningMode).toBe('skip');
    expect(writtenData.requirePlanApproval).toBe(false);
  });

  it('should emit success event after creating features', async () => {
    mockExtractJsonWithArray.mockReturnValue({
      features: [
        {
          id: 'feature-1',
          title: 'Feature 1',
          description: 'First',
        },
      ],
    });

    await parseAndCreateFeatures(projectPath, 'content', mockEvents);

    expect(mockEvents.emit).toHaveBeenCalledWith(
      'spec-regeneration:event',
      expect.objectContaining({
        type: 'spec_regeneration_complete',
        projectPath,
      })
    );
  });

  it('should emit error event when no valid JSON is found', async () => {
    mockExtractJsonWithArray.mockReturnValue(null);

    await parseAndCreateFeatures(projectPath, 'invalid content', mockEvents);

    expect(mockEvents.emit).toHaveBeenCalledWith(
      'spec-regeneration:event',
      expect.objectContaining({
        type: 'spec_regeneration_error',
        projectPath,
      })
    );
  });
});
