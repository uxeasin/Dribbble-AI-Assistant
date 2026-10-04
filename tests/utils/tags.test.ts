import { describe, expect, it } from 'vitest';
import { normalizeTag, normalizeTags, parseTagInput } from '../../src/utils/tags';

describe('tags', () => {
  it('normalises to Dribbble style, with spaces instead of hyphens', () => {
    expect(normalizeTag('#Web Design')).toBe('web design');
    expect(normalizeTag('web-design')).toBe('web design');
    expect(normalizeTag('landing_page')).toBe('landing page');
    expect(normalizeTag('e-commerce')).toBe('e-commerce');
    expect(normalizeTag('  UI/UX ')).toBe('ui/ux');
    expect(normalizeTag('---')).toBe('');
  });

  it('dedupes and limits', () => {
    expect(normalizeTags(['ui', 'UI', 'ux', 'web'], 2)).toEqual(['ui', 'ux']);
  });

  it('parses comma and hashtag input', () => {
    expect(normalizeTags(parseTagInput('ui, ux\n#saas #fintech'))).toEqual(['ui', 'ux', 'saas', 'fintech']);
  });
});
