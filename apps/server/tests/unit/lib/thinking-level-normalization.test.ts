import { describe, it, expect } from 'vitest';
import { normalizeThinkingLevelForModel } from '@automaker/types';

describe('normalizeThinkingLevelForModel', () => {
  it('preserves explicitly selected none for Opus models', () => {
    expect(normalizeThinkingLevelForModel('claude-opus', 'none')).toBe('none');
  });

  it('falls back to none when Opus receives an unsupported manual thinking level', () => {
    expect(normalizeThinkingLevelForModel('claude-opus', 'medium')).toBe('none');
  });

  it('keeps adaptive for Opus when adaptive is selected', () => {
    expect(normalizeThinkingLevelForModel('claude-opus', 'adaptive')).toBe('adaptive');
  });

  it('preserves supported manual levels for non-Opus models', () => {
    expect(normalizeThinkingLevelForModel('claude-sonnet', 'high')).toBe('high');
  });
});
