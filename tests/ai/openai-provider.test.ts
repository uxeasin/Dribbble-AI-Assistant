import { describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from '../../src/ai/openai-provider';
import type { DesignAnalysis, GenerationOptions } from '../../src/types';
import { AppError } from '../../src/utils/errors';

const CONFIG = { apiKey: 'sk-test', model: 'test-model', baseUrl: 'https://api.example.test/v1' };
const OPTIONS: GenerationOptions = { tone: 'professional', tagCount: 8, defaultTags: [] };
const ANALYSIS: DesignAnalysis = {
  designType: 'web dashboard',
  subject: 'Analytics for a SaaS product',
  visualStyle: 'minimal',
  colors: ['#ffffff', '#4f46e5'],
  keywords: ['analytics', 'charts'],
};

function reply(content: string | null, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  return fetchMock;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('OpenAIProvider', () => {
  it('sends the image and parses a valid analysis', async () => {
    const fetchMock = mockFetch(reply(JSON.stringify(ANALYSIS)));
    const provider = new OpenAIProvider(CONFIG, fetchMock);

    const result = await provider.analyzeDesign(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));

    expect(result).toEqual(ANALYSIS);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/v1/chat/completions');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe('test-model');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[1].content[1].image_url.url).toBe('data:image/jpeg;base64,AQID');
  });

  it('generates title, description and tags in order, reporting each', async () => {
    const fetchMock = mockFetch(
      reply('{"title":"Modern SaaS Analytics Dashboard"}'),
      reply('{"description":"A clean analytics dashboard concept."}'),
      reply('{"tags":["dashboard","saas","ui","ux","analytics"]}'),
    );
    const onField = vi.fn();
    const content = await new OpenAIProvider(CONFIG, fetchMock).generateShotContent(ANALYSIS, OPTIONS, { onField });

    expect(content).toEqual({
      title: 'Modern SaaS Analytics Dashboard',
      description: 'A clean analytics dashboard concept.',
      tags: ['dashboard', 'saas', 'ui', 'ux', 'analytics'],
    });
    expect(onField.mock.calls.map(([field]) => field)).toEqual(['title', 'description', 'tags']);
    // Later prompts include earlier fields for consistency.
    expect(JSON.parse(fetchMock.mock.calls[2]![1]!.body as string).messages[1].content).toContain('Modern SaaS Analytics Dashboard');
  });

  it('retries once after malformed JSON', async () => {
    const fetchMock = mockFetch(reply('{"title": oops'), reply('{"title":"Fintech Mobile Banking App"}'));
    const value = await new OpenAIProvider(CONFIG, fetchMock).regenerateField('title', ANALYSIS, { title: 'Old', description: 'd', tags: [] }, OPTIONS);
    expect(value).toBe('Fintech Mobile Banking App');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails gracefully when JSON stays malformed', async () => {
    const fetchMock = mockFetch(reply('nope'), reply('still nope'));
    await expectCode(new OpenAIProvider(CONFIG, fetchMock).analyzeDesign(new Blob(['x'])), 'AI_FAILED');
  });

  it('fails gracefully on an empty response', async () => {
    const fetchMock = mockFetch(reply(''), reply(null));
    await expectCode(new OpenAIProvider(CONFIG, fetchMock).analyzeDesign(new Blob(['x'])), 'AI_FAILED');
  });

  it('fails when required fields are missing', async () => {
    const fetchMock = mockFetch(reply('{"headline":"x"}'), reply('{"headline":"x"}'));
    await expectCode(
      new OpenAIProvider(CONFIG, fetchMock).regenerateField('title', ANALYSIS, { title: 't', description: 'd', tags: [] }, OPTIONS),
      'AI_FAILED',
    );
  });

  it('caps too many tags to the configured count', async () => {
    const tags = Array.from({ length: 25 }, (_, i) => `tag${i}`);
    const fetchMock = mockFetch(reply(JSON.stringify({ tags })));
    const value = await new OpenAIProvider(CONFIG, fetchMock).regenerateField('tags', ANALYSIS, { title: 't', description: 'd', tags: [] }, OPTIONS);
    expect(value).toHaveLength(OPTIONS.tagCount);
  });

  it('maps 401 to an authentication error without retrying', async () => {
    const fetchMock = mockFetch(new Response('unauthorized', { status: 401 }));
    await expectCode(new OpenAIProvider(CONFIG, fetchMock).analyzeDesign(new Blob(['x'])), 'AI_AUTH');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 500 once', async () => {
    const fetchMock = mockFetch(new Response('boom', { status: 500 }), reply(JSON.stringify(ANALYSIS)));
    await expect(new OpenAIProvider(CONFIG, fetchMock).analyzeDesign(new Blob(['x']))).resolves.toEqual(ANALYSIS);
  });

  it('requires an API key', async () => {
    const fetchMock = mockFetch();
    await expectCode(new OpenAIProvider({ ...CONFIG, apiKey: '' }, fetchMock).analyzeDesign(new Blob(['x'])), 'AI_NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports cancellation', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });
    await expectCode(new OpenAIProvider(CONFIG, fetchMock).analyzeDesign(new Blob(['x']), controller.signal), 'CANCELLED');
  });
});
