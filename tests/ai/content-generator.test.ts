import { describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../../src/ai/ai-provider';
import { generateShot, mergeDefaultTags, regenerateField } from '../../src/ai/content-generator';
import type { DesignAnalysis, ShotContent } from '../../src/types';

vi.mock('../../src/image/processing', () => ({ prepareForAI: async (blob: Blob) => blob }));

const ANALYSIS: DesignAnalysis = { designType: 'app', subject: 'Banking', visualStyle: 'flat', colors: [], keywords: [] };
const CONTENT: ShotContent = { title: 'Banking App', description: 'A banking app.', tags: ['ui', 'fintech', 'mobile-design'] };

function fakeProvider(): AIProvider {
  return {
    id: 'fake',
    analyzeDesign: vi.fn(async () => ANALYSIS),
    generateShotContent: vi.fn(async (_analysis, _options, hooks) => {
      hooks?.onField?.('title', CONTENT.title);
      hooks?.onField?.('description', CONTENT.description);
      hooks?.onField?.('tags', CONTENT.tags);
      return CONTENT;
    }),
    regenerateField: vi.fn(async () => ['ux', 'ui']) as AIProvider['regenerateField'],
  };
}

describe('generateShot', () => {
  it('reports steps in pipeline order and merges default tags first', async () => {
    const events: string[] = [];
    const result = await generateShot(
      fakeProvider(),
      new Blob(['x']),
      { tone: 'minimal', tagCount: 5, defaultTags: ['studio-x'] },
      {
        onStepStart: (s) => events.push(`start:${s}`),
        onStepDone: (s) => events.push(`done:${s}`),
      },
    );
    expect(events).toEqual([
      'start:analysis',
      'done:analysis',
      'start:title',
      'done:title',
      'start:description',
      'done:description',
      'start:tags',
      'done:tags',
    ]);
    expect(result.content.tags).toEqual(['studio-x', 'ui', 'fintech', 'mobile-design']);
  });

  it('applies default tags when regenerating tags', async () => {
    const tags = await regenerateField(fakeProvider(), 'tags', ANALYSIS, CONTENT, { tone: 'creative', tagCount: 5, defaultTags: ['ui', 'mine'] });
    expect(tags).toEqual(['ui', 'mine', 'ux']);
  });
});

describe('mergeDefaultTags', () => {
  it('never exceeds Dribbble’s 20-tag limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`);
    expect(mergeDefaultTags(many, ['a'])).toHaveLength(20);
  });
});
