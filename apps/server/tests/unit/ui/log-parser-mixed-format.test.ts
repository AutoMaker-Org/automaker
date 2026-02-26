import { describe, expect, it } from 'vitest';
import {
  parseAllPhaseSummaries,
  parsePhaseSummaries,
  extractPhaseSummary,
  extractImplementationSummary,
  isAccumulatedSummary,
} from '../../../../ui/src/lib/log-parser.ts';

describe('log-parser mixed summary format compatibility', () => {
  const mixedSummary = [
    'Implemented core auth flow and API wiring.',
    '',
    '---',
    '',
    '### Code Review',
    '',
    'Addressed lint warnings and improved error handling.',
    '',
    '---',
    '',
    '### Testing',
    '',
    'All tests passing.',
  ].join('\n');

  it('treats leading headerless section as Implementation phase', () => {
    const phases = parsePhaseSummaries(mixedSummary);

    expect(phases.get('implementation')).toBe('Implemented core auth flow and API wiring.');
    expect(phases.get('code review')).toBe('Addressed lint warnings and improved error handling.');
    expect(phases.get('testing')).toBe('All tests passing.');
  });

  it('returns implementation summary from mixed format', () => {
    expect(extractImplementationSummary(mixedSummary)).toBe(
      'Implemented core auth flow and API wiring.'
    );
  });

  it('includes Implementation as the first parsed phase entry', () => {
    const entries = parseAllPhaseSummaries(mixedSummary);

    expect(entries[0]).toMatchObject({
      phaseName: 'Implementation',
      content: 'Implemented core auth flow and API wiring.',
    });
    expect(entries.map((entry) => entry.phaseName)).toEqual([
      'Implementation',
      'Code Review',
      'Testing',
    ]);
  });

  it('extracts specific phase summaries from mixed format', () => {
    expect(extractPhaseSummary(mixedSummary, 'Implementation')).toBe(
      'Implemented core auth flow and API wiring.'
    );
    expect(extractPhaseSummary(mixedSummary, 'Code Review')).toBe(
      'Addressed lint warnings and improved error handling.'
    );
    expect(extractPhaseSummary(mixedSummary, 'Testing')).toBe('All tests passing.');
  });

  it('treats mixed format as accumulated summary', () => {
    expect(isAccumulatedSummary(mixedSummary)).toBe(true);
  });
});
