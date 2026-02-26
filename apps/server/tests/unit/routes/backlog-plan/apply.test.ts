import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetAll, mockCreate, mockUpdate, mockDelete, mockClearBacklogPlan } = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockClearBacklogPlan: vi.fn(),
}));

vi.mock('@/services/feature-loader.js', () => ({
  FeatureLoader: class {
    getAll = mockGetAll;
    create = mockCreate;
    update = mockUpdate;
    delete = mockDelete;
  },
}));

vi.mock('@/routes/backlog-plan/common.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  clearBacklogPlan: mockClearBacklogPlan,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  logError: vi.fn(),
}));

import { createApplyHandler } from '@/routes/backlog-plan/routes/apply.js';

function createMockRes() {
  const res: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  } = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe('createApplyHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ id: 'feature-created' });
    mockUpdate.mockResolvedValue({});
    mockDelete.mockResolvedValue(true);
    mockClearBacklogPlan.mockResolvedValue(undefined);
  });

  it('applies default feature model and planning settings when backlog plan additions omit them', async () => {
    const settingsService = {
      getGlobalSettings: vi.fn().mockResolvedValue({
        defaultFeatureModel: { model: 'codex-gpt-5.2-codex', reasoningEffort: 'high' },
        defaultPlanningMode: 'spec',
        defaultRequirePlanApproval: true,
      }),
      getProjectSettings: vi.fn().mockResolvedValue({}),
    } as any;

    const req = {
      body: {
        projectPath: '/tmp/project',
        plan: {
          changes: [
            {
              type: 'add',
              feature: {
                id: 'feature-from-plan',
                title: 'Created from plan',
                description: 'desc',
              },
            },
          ],
        },
      },
    } as any;
    const res = createMockRes();

    await createApplyHandler(settingsService)(req, res as any);

    expect(mockCreate).toHaveBeenCalledWith(
      '/tmp/project',
      expect.objectContaining({
        model: 'codex-gpt-5.2-codex',
        reasoningEffort: 'high',
        planningMode: 'spec',
        requirePlanApproval: true,
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });

  it('uses project default feature model override and enforces no approval for skip mode', async () => {
    const settingsService = {
      getGlobalSettings: vi.fn().mockResolvedValue({
        defaultFeatureModel: { model: 'claude-opus' },
        defaultPlanningMode: 'skip',
        defaultRequirePlanApproval: true,
      }),
      getProjectSettings: vi.fn().mockResolvedValue({
        defaultFeatureModel: {
          model: 'GLM-4.7',
          providerId: 'provider-glm',
          thinkingLevel: 'adaptive',
        },
      }),
    } as any;

    const req = {
      body: {
        projectPath: '/tmp/project',
        plan: {
          changes: [
            {
              type: 'add',
              feature: {
                id: 'feature-from-plan',
                title: 'Created from plan',
              },
            },
          ],
        },
      },
    } as any;
    const res = createMockRes();

    await createApplyHandler(settingsService)(req, res as any);

    expect(mockCreate).toHaveBeenCalledWith(
      '/tmp/project',
      expect.objectContaining({
        model: 'GLM-4.7',
        providerId: 'provider-glm',
        thinkingLevel: 'adaptive',
        planningMode: 'skip',
        requirePlanApproval: false,
      })
    );
  });
});
