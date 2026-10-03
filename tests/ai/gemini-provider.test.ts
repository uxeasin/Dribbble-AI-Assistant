import { describe, expect, it, vi } from 'vitest';
import { GeminiProvider, geminiDescriptor } from '../../src/ai/gemini-provider';
import { createProvider } from '../../src/ai/providers';
import { DEFAULT_SETTINGS } from '../../src/storage/settings';
import type { DesignAnalysis, GenerationOptions } from '../../src/types';
import { AppError } from '../../src/utils/errors';

const CONFIG = { apiKey: 'AIza-test', model: 'gemini-2.5-flash', baseUrl: geminiDescriptor.defaultBaseUrl };
const OPTIONS: GenerationOptions = { tone: 'professional', tagCount: 8, defaultTags: [] };
const ANALYSIS: DesignAnalysis = {
  designType: 'mobile app',
  subject: 'Personal finance tracker',
  visualStyle: 'minimal',
  colors: ['#0f172a'],
  keywords: ['finance'],
};
const CURRENT = { title: 't', description: 'd', tags: [] };

function reply(text: string, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], ...extra }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  return fetchMock;
}

describe('GeminiProvider', () => {
  it('sends the image inline with the key in a header and parses the analysis', async () => {
    const fetchMock = mockFetch(reply(JSON.stringify(ANALYSIS)));
    const provider = new GeminiProvider(CONFIG, fetchMock);

    await expect(provider.analyzeDesign(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))).resolves.toEqual(ANALYSIS);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(String(url)).not.toContain('AIza');
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test');
    const body = JSON.parse(init!.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.systemInstruction.parts[0].text).toMatch(/Dribbble content assistant/);
    expect(body.contents[0].parts[1]).toEqual({ inline_data: { mime_type: 'image/jpeg', data: 'AQID' } });
  });

  it('generates all fields in order', async () => {
    const fetchMock = mockFetch(
      reply('{"title":"Personal Finance Tracker App"}'),
      reply('{"description":"A calm finance tracking concept."}'),
      reply('{"tags":["fintech","mobile-design","ui","ux"]}'),
    );
    const content = await new GeminiProvider(CONFIG, fetchMock).generateShotContent(ANALYSIS, OPTIONS);
    expect(content).toEqual({
      title: 'Personal Finance Tracker App',
      description: 'A calm finance tracking concept.',
      tags: ['fintech', 'mobile-design', 'ui', 'ux'],
    });
  });

  it('joins multi-part text responses', async () => {
    const response = new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"title":' }, { text: '"Split Title Works"}' }] } }] }));
    const value = await new GeminiProvider(CONFIG, mockFetch(response)).regenerateField('title', ANALYSIS, CURRENT, OPTIONS);
    expect(value).toBe('Split Title Works');
  });

  it('maps an invalid key (HTTP 400 API_KEY_INVALID) to an auth error', async () => {
    const fetchMock = mockFetch(new Response('{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}', { status: 400 }));
    const promise = new GeminiProvider(CONFIG, fetchMock).analyzeDesign(new Blob(['x']));
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({ code: 'AI_AUTH' });
  });

  it('reports blocked prompts and safety stops as AI failures', async () => {
    const blocked = mockFetch(new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })));
    await expect(new GeminiProvider(CONFIG, blocked).analyzeDesign(new Blob(['x']))).rejects.toMatchObject({ code: 'AI_FAILED' });

    const stopped = mockFetch(new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] })));
    await expect(new GeminiProvider(CONFIG, stopped).regenerateField('title', ANALYSIS, CURRENT, OPTIONS)).rejects.toMatchObject({
      code: 'AI_FAILED',
    });
  });

  it('retries once after malformed JSON', async () => {
    const fetchMock = mockFetch(reply('not json'), reply('{"title":"Second Try Title"}'));
    await expect(new GeminiProvider(CONFIG, fetchMock).regenerateField('title', ANALYSIS, CURRENT, OPTIONS)).resolves.toBe('Second Try Title');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('is selectable from settings', () => {
    const provider = createProvider({ ...DEFAULT_SETTINGS, aiProvider: 'gemini', baseUrl: geminiDescriptor.defaultBaseUrl }, 'AIza');
    expect(provider.id).toBe('gemini');
  });
});
