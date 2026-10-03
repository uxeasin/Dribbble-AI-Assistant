import { describe, expect, it } from 'vitest';
import { normalizeTag, normalizeTags, parseTagInput } from '../../src/utils/tags';

describe('tags', () => {
  it('normalises to Dribbble style', () => {
    expect(normalizeTag('#Web Design')).toBe('web-design');
    expect(normalizeTag('  UI/UX ')).toBe('uiux');
    expect(normalizeTag('---')).toBe('');
  });

  it('dedupes and limits', () => {
    expect(normalizeTags(['ui', 'UI', 'ux', 'web'], 2)).toEqual(['ui', 'ux']);
  });

  it('parses comma and hashtag input', () => {
    expect(normalizeTags(parseTagInput('ui, ux\n#saas #fintech'))).toEqual(['ui', 'ux', 'saas', 'fintech']);
  });
});
