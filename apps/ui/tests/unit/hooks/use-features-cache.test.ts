import { describe, expect, it } from 'vitest';
import { sanitizePersistedFeatures } from '../../../src/hooks/queries/use-features';

describe('sanitizePersistedFeatures', () => {
  it('returns empty array for non-array values', () => {
    expect(sanitizePersistedFeatures(null)).toEqual([]);
    expect(sanitizePersistedFeatures({})).toEqual([]);
    expect(sanitizePersistedFeatures('bad')).toEqual([]);
  });

  it('drops entries without a valid id', () => {
    const sanitized = sanitizePersistedFeatures([
      null,
      {},
      { id: '' },
      { id: '   ' },
      { id: 'feature-a', description: 'valid', category: '' },
    ]);

    expect(sanitized).toHaveLength(1);
    expect(sanitized[0].id).toBe('feature-a');
  });

  it('normalizes malformed fields to safe defaults', () => {
    const sanitized = sanitizePersistedFeatures([
      {
        id: 'feature-1',
        description: 123,
        category: null,
        status: 'not-a-real-status',
        steps: ['first', 2, 'third'],
      },
    ]);

    expect(sanitized).toEqual([
      {
        id: 'feature-1',
        description: '',
        category: '',
        status: 'backlog',
        steps: ['first', 'third'],
        title: undefined,
        titleGenerating: undefined,
        branchName: undefined,
      },
    ]);
  });

  it('keeps valid static and pipeline statuses', () => {
    const sanitized = sanitizePersistedFeatures([
      { id: 'feature-static', description: '', category: '', status: 'in_progress' },
      { id: 'feature-pipeline', description: '', category: '', status: 'pipeline_tests' },
    ]);

    expect(sanitized[0].status).toBe('in_progress');
    expect(sanitized[1].status).toBe('pipeline_tests');
  });
});
