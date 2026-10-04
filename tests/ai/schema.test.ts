import { describe, expect, it } from 'vitest';
import {
  parseJsonObject,
  TITLE_MAX_LENGTH,
  validateDesignAnalysis,
  validateGeneratedShot,
  validateShotContent,
  validateTags,
  validateTitle,
} from '../../src/ai/schema';
import { AppError } from '../../src/utils/errors';

const VALID = {
  title: 'Modern Finance Dashboard',
  description: 'A clean finance dashboard concept focused on clarity.',
  tags: ['dashboard', 'fintech', 'ui', 'ux', 'web design', 'product design'],
};

function expectAiFailure(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('AI_FAILED');
    expect((error as AppError).message).toBe("Couldn't generate content. Please try again.");
    return;
  }
  throw new Error('Expected an AI_FAILED error');
}

describe('parseJsonObject', () => {
  it('parses valid JSON', () => {
    expect(parseJsonObject(JSON.stringify(VALID))).toEqual(VALID);
  });

  it('extracts JSON from code fences and surrounding prose', () => {
    expect(parseJsonObject('```json\n{"title":"A"}\n```')).toEqual({ title: 'A' });
    expect(parseJsonObject('Sure! Here it is: {"title":"A"} Hope that helps.')).toEqual({ title: 'A' });
  });

  it('rejects invalid JSON', () => {
    expectAiFailure(() => parseJsonObject('{"title": "A", tags: [}'));
    expectAiFailure(() => parseJsonObject('not json at all'));
  });

  it('unwraps a one-element array around the object (Gemini JSON mode)', () => {
    expect(parseJsonObject('[{"title":"A"}]')).toEqual({ title: 'A' });
  });

  it('rejects other arrays and primitives', () => {
    expectAiFailure(() => parseJsonObject('["a"]'));
    expectAiFailure(() => parseJsonObject('[{"a":1},{"b":2}]'));
    expectAiFailure(() => parseJsonObject('42'));
  });

  it('rejects empty responses', () => {
    expectAiFailure(() => parseJsonObject(''));
    expectAiFailure(() => parseJsonObject('   '));
    expectAiFailure(() => parseJsonObject(null));
  });
});

describe('validateShotContent', () => {
  it('accepts valid content', () => {
    expect(validateShotContent(VALID, 12)).toEqual(VALID);
    expect(validateShotContent(JSON.stringify(VALID), 12)).toEqual(VALID);
  });

  it.each(['title', 'description', 'tags'] as const)('rejects a missing %s', (field) => {
    const { [field]: _omitted, ...rest } = VALID;
    expectAiFailure(() => validateShotContent(rest, 12));
  });

  it('rejects empty strings', () => {
    expectAiFailure(() => validateShotContent({ ...VALID, title: '  ' }, 12));
    expectAiFailure(() => validateShotContent({ ...VALID, description: '' }, 12));
  });

  it('caps too many tags at the requested count', () => {
    const tags = Array.from({ length: 30 }, (_, i) => `tag-${i}`);
    const result = validateShotContent({ ...VALID, tags }, 8);
    expect(result.tags).toHaveLength(8);
    expect(result.tags[0]).toBe('tag-0');
  });

  it('normalises, de-duplicates and filters tags', () => {
    const result = validateShotContent({ ...VALID, tags: ['#UI', 'ui', 'Web Design', 'web_design', 42, '', 'SaaS'] }, 12);
    expect(result.tags).toEqual(['ui', 'web design', 'saas']);
  });

  it('accepts comma-separated tag strings', () => {
    expect(validateTags('ui, ux, dashboard', 12)).toEqual(['ui', 'ux', 'dashboard']);
  });

  it('rejects too few usable tags', () => {
    expectAiFailure(() => validateShotContent({ ...VALID, tags: ['ui'] }, 12));
    expectAiFailure(() => validateShotContent({ ...VALID, tags: [] }, 12));
  });
});

describe('validateTitle', () => {
  it('strips quotes and trailing punctuation', () => {
    expect(validateTitle('"Modern SaaS Analytics Dashboard."')).toBe('Modern SaaS Analytics Dashboard');
  });

  it('truncates overly long titles at a word boundary', () => {
    const title = validateTitle('Word '.repeat(40));
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
    expect(title.endsWith(' ')).toBe(false);
  });
});

describe('validateDesignAnalysis', () => {
  it('fills defaults for optional fields', () => {
    expect(validateDesignAnalysis({ designType: 'dashboard', subject: 'Analytics for SaaS' })).toEqual({
      designType: 'dashboard',
      subject: 'Analytics for SaaS',
      visualStyle: 'unspecified',
      colors: [],
      keywords: [],
    });
    expect(validateDesignAnalysis({ keywords: ['fitness', 'mobile app'] })).toMatchObject({
      designType: 'UI design',
      subject: 'fitness, mobile app',
    });
    expectAiFailure(() => validateDesignAnalysis({ colors: ['#fff'] }));
  });
});

describe('validateGeneratedShot', () => {
  it('validates the single-request answer', () => {
    const shot = validateGeneratedShot({ analysis: { designType: 'dashboard', subject: 'Analytics' }, ...VALID }, 12);
    expect(shot.content).toEqual(VALID);
    expect(shot.analysis.designType).toBe('dashboard');
  });

  it('derives an analysis from the content when it is missing', () => {
    const shot = validateGeneratedShot(VALID, 12);
    expect(shot.analysis.subject).toBe(VALID.title);
    expect(shot.analysis.keywords).toEqual(VALID.tags);
  });

  it('still requires the content fields', () => {
    expectAiFailure(() => validateGeneratedShot({ analysis: { designType: 'x', subject: 'y' } }, 12));
  });
});
