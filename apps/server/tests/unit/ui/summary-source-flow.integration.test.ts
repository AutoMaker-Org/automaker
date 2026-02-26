import { describe, it, expect } from 'vitest';
import { parseAllPhaseSummaries, isAccumulatedSummary } from '../../../../ui/src/lib/log-parser.ts';
import { getFirstNonEmptySummary } from '../../../../ui/src/lib/summary-selection.ts';

/**
 * Mirrors summary source priority in agent-info-panel.tsx:
 * freshFeature.summary > feature.summary > summaryProp > agentInfo.summary
 */
function getCardEffectiveSummary(params: {
  freshFeatureSummary?: string | null;
  featureSummary?: string | null;
  summaryProp?: string | null;
  agentInfoSummary?: string | null;
}): string | undefined | null {
  return getFirstNonEmptySummary(
    params.freshFeatureSummary,
    params.featureSummary,
    params.summaryProp,
    params.agentInfoSummary
  );
}

/**
 * Mirrors SummaryDialog raw summary selection in summary-dialog.tsx:
 * summaryProp > feature.summary > agentInfo.summary
 */
function getDialogRawSummary(params: {
  summaryProp?: string | null;
  featureSummary?: string | null;
  agentInfoSummary?: string | null;
}): string | undefined | null {
  return getFirstNonEmptySummary(
    params.summaryProp,
    params.featureSummary,
    params.agentInfoSummary
  );
}

describe('Summary Source Flow Integration', () => {
  it('uses fresh per-feature summary in card and preserves it through summary dialog', () => {
    const staleListSummary = '## Old summary from stale list cache';
    const freshAccumulatedSummary = `### Implementation

Implemented auth + profile flow.

---

### Testing

- Unit tests: 18 passed
- Integration tests: 6 passed`;
    const parsedAgentInfoSummary = 'Fallback summary from parsed agent output';

    const cardEffectiveSummary = getCardEffectiveSummary({
      freshFeatureSummary: freshAccumulatedSummary,
      featureSummary: staleListSummary,
      summaryProp: undefined,
      agentInfoSummary: parsedAgentInfoSummary,
    });

    expect(cardEffectiveSummary).toBe(freshAccumulatedSummary);

    const dialogRawSummary = getDialogRawSummary({
      summaryProp: cardEffectiveSummary,
      featureSummary: staleListSummary,
      agentInfoSummary: parsedAgentInfoSummary,
    });

    expect(dialogRawSummary).toBe(freshAccumulatedSummary);
    expect(isAccumulatedSummary(dialogRawSummary ?? undefined)).toBe(true);

    const phases = parseAllPhaseSummaries(dialogRawSummary ?? undefined);
    expect(phases).toHaveLength(2);
    expect(phases[0]?.phaseName).toBe('Implementation');
    expect(phases[1]?.phaseName).toBe('Testing');
  });

  it('falls back in order when fresher sources are absent', () => {
    const cardEffectiveSummary = getCardEffectiveSummary({
      freshFeatureSummary: undefined,
      featureSummary: '',
      summaryProp: undefined,
      agentInfoSummary: 'Agent parsed fallback',
    });

    expect(cardEffectiveSummary).toBe('Agent parsed fallback');

    const dialogRawSummary = getDialogRawSummary({
      summaryProp: undefined,
      featureSummary: undefined,
      agentInfoSummary: cardEffectiveSummary,
    });

    expect(dialogRawSummary).toBe('Agent parsed fallback');
    expect(isAccumulatedSummary(dialogRawSummary ?? undefined)).toBe(false);
  });

  it('treats whitespace-only summaries as empty during fallback selection', () => {
    const cardEffectiveSummary = getCardEffectiveSummary({
      freshFeatureSummary: '   \n',
      featureSummary: '\t',
      summaryProp: '   ',
      agentInfoSummary: 'Agent parsed fallback',
    });

    expect(cardEffectiveSummary).toBe('Agent parsed fallback');
  });
});
