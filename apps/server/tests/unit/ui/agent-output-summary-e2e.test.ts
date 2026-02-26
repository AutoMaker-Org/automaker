/**
 * End-to-end integration tests for agent output summary display flow.
 *
 * These tests validate the complete flow from:
 * 1. Server-side summary accumulation (FeatureStateManager.saveFeatureSummary)
 * 2. Event emission with accumulated summary (auto_mode_summary event)
 * 3. UI-side summary retrieval (feature.summary via API)
 * 4. UI-side summary parsing and display (parsePhaseSummaries, extractSummary)
 *
 * The tests simulate what happens when:
 * - A feature goes through multiple pipeline steps
 * - Each step produces a summary
 * - The server accumulates all summaries
 * - The UI displays the accumulated summary
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { FeatureStateManager } from '@/services/feature-state-manager.js';
import type { Feature } from '@automaker/types';
import type { EventEmitter } from '@/lib/events.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import { atomicWriteJson, readJsonWithRecovery } from '@automaker/utils';
import { getFeatureDir } from '@automaker/platform';
import { pipelineService } from '@/services/pipeline-service.js';

// Mock dependencies
vi.mock('@/lib/secure-fs.js', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
}));

vi.mock('@automaker/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@automaker/utils')>();
  return {
    ...actual,
    atomicWriteJson: vi.fn(),
    readJsonWithRecovery: vi.fn(),
    logRecoveryWarning: vi.fn(),
  };
});

vi.mock('@automaker/platform', () => ({
  getFeatureDir: vi.fn(),
  getFeaturesDir: vi.fn(),
}));

vi.mock('@/services/notification-service.js', () => ({
  getNotificationService: vi.fn(() => ({
    createNotification: vi.fn(),
  })),
}));

vi.mock('@/services/pipeline-service.js', () => ({
  pipelineService: {
    getStepIdFromStatus: vi.fn((status: string) => {
      if (status.startsWith('pipeline_')) return status.replace('pipeline_', '');
      return null;
    }),
    getStep: vi.fn(),
  },
}));

// ============================================================================
// UI-side parsing functions (mirrored from apps/ui/src/lib/log-parser.ts)
// ============================================================================

function parsePhaseSummaries(summary: string | undefined): Map<string, string> {
  const phaseSummaries = new Map<string, string>();
  if (!summary || !summary.trim()) return phaseSummaries;

  const sections = summary.split(/\n\n---\n\n/);
  for (const section of sections) {
    const headerMatch = section.match(/^###\s+(.+?)(?:\n|$)/);
    if (headerMatch) {
      const phaseName = headerMatch[1].trim().toLowerCase();
      const content = section.substring(headerMatch[0].length).trim();
      phaseSummaries.set(phaseName, content);
    }
  }
  return phaseSummaries;
}

function extractSummary(rawOutput: string): string | null {
  if (!rawOutput || !rawOutput.trim()) return null;

  const regexesToTry: Array<{
    regex: RegExp;
    processor: (m: RegExpMatchArray) => string;
  }> = [
    { regex: /<summary>([\s\S]*?)<\/summary>/gi, processor: (m) => m[1] },
    { regex: /^##\s+Summary[^\n]*\n([\s\S]*?)(?=\n##\s+[^#]|\n🔧|$)/gm, processor: (m) => m[1] },
  ];

  for (const { regex, processor } of regexesToTry) {
    const matches = [...rawOutput.matchAll(regex)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      return processor(lastMatch).trim();
    }
  }
  return null;
}

function isAccumulatedSummary(summary: string | undefined): boolean {
  if (!summary || !summary.trim()) return false;
  return summary.includes('\n\n---\n\n') && (summary.match(/###\s+.+/g)?.length ?? 0) > 0;
}

/**
 * Returns the first summary candidate that contains non-whitespace content.
 * Mirrors getFirstNonEmptySummary from apps/ui/src/lib/summary-selection.ts
 */
function getFirstNonEmptySummary(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return null;
}

// ============================================================================
// Unit tests for helper functions
// ============================================================================

describe('getFirstNonEmptySummary', () => {
  it('should return the first non-empty string', () => {
    expect(getFirstNonEmptySummary(null, undefined, 'first', 'second')).toBe('first');
  });

  it('should skip null and undefined candidates', () => {
    expect(getFirstNonEmptySummary(null, undefined, 'valid')).toBe('valid');
  });

  it('should skip whitespace-only strings', () => {
    expect(getFirstNonEmptySummary('   ', '\n\t', 'actual content')).toBe('actual content');
  });

  it('should return null when all candidates are empty', () => {
    expect(getFirstNonEmptySummary(null, undefined, '', '   ')).toBeNull();
  });

  it('should return null when no candidates provided', () => {
    expect(getFirstNonEmptySummary()).toBeNull();
  });

  it('should handle empty string as invalid', () => {
    expect(getFirstNonEmptySummary('', 'valid')).toBe('valid');
  });

  it('should prefer first valid candidate', () => {
    expect(getFirstNonEmptySummary('first', 'second', 'third')).toBe('first');
  });

  it('should handle strings with only spaces as invalid', () => {
    expect(getFirstNonEmptySummary('     ', '   \n  ', 'valid')).toBe('valid');
  });

  it('should accept strings with content surrounded by whitespace', () => {
    expect(getFirstNonEmptySummary('  content with spaces  ')).toBe('  content with spaces  ');
  });
});

describe('Agent Output Summary E2E Flow', () => {
  let manager: FeatureStateManager;
  let mockEvents: EventEmitter;

  const baseFeature: Feature = {
    id: 'e2e-feature-1',
    name: 'E2E Feature',
    title: 'E2E Feature Title',
    description: 'A feature going through complete pipeline',
    status: 'pipeline_implementation',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockEvents = {
      emit: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    };

    const mockFeatureLoader = {
      syncFeatureToAppSpec: vi.fn(),
    } as unknown as FeatureLoader;

    manager = new FeatureStateManager(mockEvents, mockFeatureLoader);

    (getFeatureDir as Mock).mockReturnValue('/project/.automaker/features/e2e-feature-1');
  });

  describe('complete pipeline flow: server accumulation → UI display', () => {
    it('should maintain complete summary across all pipeline steps', async () => {
      // ===== STEP 1: Implementation =====
      (pipelineService.getStep as Mock).mockResolvedValue({
        name: 'Implementation',
        id: 'implementation',
      });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_implementation', summary: undefined },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary(
        '/project',
        'e2e-feature-1',
        '## Changes\n- Created auth module\n- Added user service'
      );

      const step1Feature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      const step1Summary = step1Feature.summary;

      // Verify server-side accumulation format
      expect(step1Summary).toBe(
        '### Implementation\n\n## Changes\n- Created auth module\n- Added user service'
      );

      // Verify UI can parse this summary
      const phases1 = parsePhaseSummaries(step1Summary);
      expect(phases1.size).toBe(1);
      expect(phases1.get('implementation')).toContain('Created auth module');

      // ===== STEP 2: Code Review =====
      vi.clearAllMocks();
      (getFeatureDir as Mock).mockReturnValue('/project/.automaker/features/e2e-feature-1');
      (pipelineService.getStep as Mock).mockResolvedValue({
        name: 'Code Review',
        id: 'code_review',
      });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_code_review', summary: step1Summary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary(
        '/project',
        'e2e-feature-1',
        '## Review Results\n- Approved with minor suggestions'
      );

      const step2Feature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      const step2Summary = step2Feature.summary;

      // Verify accumulation now has both steps
      expect(step2Summary).toContain('### Implementation');
      expect(step2Summary).toContain('Created auth module');
      expect(step2Summary).toContain('### Code Review');
      expect(step2Summary).toContain('Approved with minor suggestions');
      expect(step2Summary).toContain('\n\n---\n\n'); // Separator

      // Verify UI can parse accumulated summary
      expect(isAccumulatedSummary(step2Summary)).toBe(true);
      const phases2 = parsePhaseSummaries(step2Summary);
      expect(phases2.size).toBe(2);
      expect(phases2.get('implementation')).toContain('Created auth module');
      expect(phases2.get('code review')).toContain('Approved with minor suggestions');

      // ===== STEP 3: Testing =====
      vi.clearAllMocks();
      (getFeatureDir as Mock).mockReturnValue('/project/.automaker/features/e2e-feature-1');
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'testing' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_testing', summary: step2Summary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary(
        '/project',
        'e2e-feature-1',
        '## Test Results\n- 42 tests pass\n- 98% coverage'
      );

      const finalFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      const finalSummary = finalFeature.summary;

      // Verify final accumulation has all three steps
      expect(finalSummary).toContain('### Implementation');
      expect(finalSummary).toContain('Created auth module');
      expect(finalSummary).toContain('### Code Review');
      expect(finalSummary).toContain('Approved with minor suggestions');
      expect(finalSummary).toContain('### Testing');
      expect(finalSummary).toContain('42 tests pass');

      // Verify UI-side parsing of complete pipeline
      expect(isAccumulatedSummary(finalSummary)).toBe(true);
      const finalPhases = parsePhaseSummaries(finalSummary);
      expect(finalPhases.size).toBe(3);

      // Verify chronological order (implementation before testing)
      const summaryLines = finalSummary!.split('\n');
      const implIndex = summaryLines.findIndex((l) => l.includes('### Implementation'));
      const reviewIndex = summaryLines.findIndex((l) => l.includes('### Code Review'));
      const testIndex = summaryLines.findIndex((l) => l.includes('### Testing'));
      expect(implIndex).toBeLessThan(reviewIndex);
      expect(reviewIndex).toBeLessThan(testIndex);
    });

    it('should emit events with accumulated summaries for real-time UI updates', async () => {
      // Step 1
      (pipelineService.getStep as Mock).mockResolvedValue({
        name: 'Implementation',
        id: 'implementation',
      });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_implementation', summary: undefined },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'e2e-feature-1', 'Step 1 output');

      // Verify event emission
      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_summary',
        featureId: 'e2e-feature-1',
        projectPath: '/project',
        summary: '### Implementation\n\nStep 1 output',
      });

      // Step 2
      vi.clearAllMocks();
      (getFeatureDir as Mock).mockReturnValue('/project/.automaker/features/e2e-feature-1');
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'testing' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: {
          ...baseFeature,
          status: 'pipeline_testing',
          summary: '### Implementation\n\nStep 1 output',
        },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'e2e-feature-1', 'Step 2 output');

      // Event should contain FULL accumulated summary
      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_summary',
        featureId: 'e2e-feature-1',
        projectPath: '/project',
        summary: '### Implementation\n\nStep 1 output\n\n---\n\n### Testing\n\nStep 2 output',
      });
    });
  });

  describe('UI display logic: feature.summary vs extractSummary()', () => {
    it('should prefer feature.summary (server-accumulated) over extractSummary() (last only)', () => {
      // Simulate what the server has accumulated
      const featureSummary = [
        '### Implementation',
        '',
        '## Changes',
        '- Created feature',
        '',
        '---',
        '',
        '### Testing',
        '',
        '## Results',
        '- All tests pass',
      ].join('\n');

      // Simulate raw agent output (only contains last summary)
      const rawOutput = `
Working on tests...

<summary>
## Results
- All tests pass
</summary>
`;

      // UI logic: getFirstNonEmptySummary(feature?.summary, extractSummary(output))
      const displaySummary = getFirstNonEmptySummary(featureSummary, extractSummary(rawOutput));

      // Should use server-accumulated summary
      expect(displaySummary).toBe(featureSummary);
      expect(displaySummary).toContain('### Implementation');
      expect(displaySummary).toContain('### Testing');

      // If server summary was missing, only last summary would be shown
      const fallbackSummary = extractSummary(rawOutput);
      expect(fallbackSummary).not.toContain('Implementation');
      expect(fallbackSummary).toContain('All tests pass');
    });

    it('should handle legacy features without server accumulation', () => {
      // Legacy features have no feature.summary
      const featureSummary = undefined;

      // Raw output contains the summary
      const rawOutput = `
<summary>
## Implementation Complete
- Created the feature
- All tests pass
</summary>
`;

      // UI logic: getFirstNonEmptySummary(feature?.summary, extractSummary(output))
      const displaySummary = getFirstNonEmptySummary(featureSummary, extractSummary(rawOutput));

      // Should fall back to client-side extraction
      expect(displaySummary).toContain('Implementation Complete');
      expect(displaySummary).toContain('All tests pass');
    });
  });

  describe('error recovery and edge cases', () => {
    it('should gracefully handle pipeline interruption', async () => {
      // Step 1 completes
      (pipelineService.getStep as Mock).mockResolvedValue({
        name: 'Implementation',
        id: 'implementation',
      });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_implementation', summary: undefined },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'e2e-feature-1', 'Implementation done');

      const step1Summary = ((atomicWriteJson as Mock).mock.calls[0][1] as Feature).summary;

      // Pipeline gets interrupted (status changes but summary is preserved)
      // When user views the feature later, the summary should still be available
      expect(step1Summary).toBe('### Implementation\n\nImplementation done');

      // UI can still parse the partial pipeline
      const phases = parsePhaseSummaries(step1Summary);
      expect(phases.size).toBe(1);
      expect(phases.get('implementation')).toBe('Implementation done');
    });

    it('should handle very large accumulated summaries', async () => {
      // Generate large content for each step
      const generateLargeContent = (stepNum: number) => {
        const lines = [`## Step ${stepNum} Changes`];
        for (let i = 0; i < 100; i++) {
          lines.push(
            `- Change ${i}: This is a detailed description of the change made during step ${stepNum}`
          );
        }
        return lines.join('\n');
      };

      // Simulate 5 pipeline steps with large content
      let currentSummary: string | undefined = undefined;
      const stepNames = ['Planning', 'Implementation', 'Code Review', 'Testing', 'Refinement'];

      for (let i = 0; i < 5; i++) {
        vi.clearAllMocks();
        (getFeatureDir as Mock).mockReturnValue('/project/.automaker/features/e2e-feature-1');
        (pipelineService.getStep as Mock).mockResolvedValue({
          name: stepNames[i],
          id: stepNames[i].toLowerCase().replace(' ', '_'),
        });
        (readJsonWithRecovery as Mock).mockResolvedValue({
          data: {
            ...baseFeature,
            status: `pipeline_${stepNames[i].toLowerCase().replace(' ', '_')}`,
            summary: currentSummary,
          },
          recovered: false,
          source: 'main',
        });

        await manager.saveFeatureSummary('/project', 'e2e-feature-1', generateLargeContent(i + 1));

        currentSummary = ((atomicWriteJson as Mock).mock.calls[0][1] as Feature).summary;
      }

      // Final summary should be large but still parseable
      expect(currentSummary!.length).toBeGreaterThan(5000);
      expect(isAccumulatedSummary(currentSummary)).toBe(true);

      const phases = parsePhaseSummaries(currentSummary);
      expect(phases.size).toBe(5);

      // Verify all steps are present
      for (const stepName of stepNames) {
        expect(phases.has(stepName.toLowerCase())).toBe(true);
      }
    });
  });

  describe('query invalidation simulation', () => {
    it('should trigger UI refetch on auto_mode_summary event', async () => {
      // This test documents the expected behavior:
      // When saveFeatureSummary is called, it emits auto_mode_summary event
      // The UI's use-query-invalidation.ts invalidates the feature query
      // This causes a refetch of the feature, getting the updated summary

      (pipelineService.getStep as Mock).mockResolvedValue({
        name: 'Implementation',
        id: 'implementation',
      });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_implementation', summary: undefined },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'e2e-feature-1', 'Summary content');

      // Verify event was emitted (triggers React Query invalidation)
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'auto-mode:event',
        expect.objectContaining({
          type: 'auto_mode_summary',
          featureId: 'e2e-feature-1',
          summary: expect.any(String),
        })
      );

      // The UI would then:
      // 1. Receive the event via WebSocket
      // 2. Invalidate the feature query
      // 3. Refetch the feature (GET /api/features/:id)
      // 4. Display the updated feature.summary
    });
  });
});

/**
 * KEY E2E FLOW SUMMARY:
 *
 * 1. PIPELINE EXECUTION:
 *    - Feature starts with status='pipeline_implementation'
 *    - Agent runs and produces summary
 *    - FeatureStateManager.saveFeatureSummary() accumulates with step header
 *    - Status advances to 'pipeline_testing'
 *    - Process repeats for each step
 *
 * 2. SERVER-SIDE ACCUMULATION:
 *    - First step: `### Implementation\n\n<content>`
 *    - Second step: `### Implementation\n\n<content>\n\n---\n\n### Testing\n\n<content>`
 *    - Pattern continues with each step
 *
 * 3. EVENT EMISSION:
 *    - auto_mode_summary event contains FULL accumulated summary
 *    - UI receives event via WebSocket
 *    - React Query invalidates feature query
 *    - Feature is refetched with updated summary
 *
 * 4. UI DISPLAY:
 *    - AgentOutputModal uses: getFirstNonEmptySummary(feature?.summary, extractSummary(output))
 *    - feature.summary is preferred (contains all steps)
 *    - extractSummary() is fallback (last summary only)
 *    - parsePhaseSummaries() can split into individual phases for UI
 *
 * 5. FALLBACK FOR LEGACY:
 *    - Old features may not have feature.summary
 *    - UI falls back to extracting from raw output
 *    - Only last summary is available in this case
 */
