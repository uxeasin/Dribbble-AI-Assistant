import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { ClaudeProvider, claudeDescriptor } from '../../src/ai/claude-provider';
import type { DesignAnalysis, GenerationOptions } from '../../src/types';

const CONFIG = { apiKey: 'sk-ant-test', model: 'claude-opus-5-5', baseUrl: claudeDescriptor.defaultBaseUrl };
const OPTIONS: GenerationOptions = { tone: 'professional', tagCount: 8, defaultTags: [] };
const ANALYSIS: DesignAnalysis = { designType: 'mobile app', subject: 'Scooter rental', visualStyle: 'dark', colors: [], keywords: [] };
const CURRENT = { title: 't', description: 'd', tags: [] };

function message(text: string, extra: Partial<Anthropic.Beta.BetaMessage> = {}) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    stop_reason: 'end_turn',
    stop_details: null,
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text, citations: null },
    ],
    usage: { input_tokens: 1, output_tokens: 1 },
    ...extra,
  } as unknown as Anthropic.Beta.BetaMessage;
}

function fakeClient(...results: (Anthropic.Beta.BetaMessage | Error)[]) {
  const create = vi.fn();
  for (const result of results) {
    if (result instanceof Error) create.mockRejectedValueOnce(result);
    else create.mockResolvedValueOnce(result);
  }
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
}

const apiError = (status: number) => Anthropic.APIError.generate(status, { error: { message: `status ${status}` } }, `status ${status}`, new Headers());

describe('ClaudeProvider', () => {
  it('sends the image with the prompt and reads the text block (ignoring thinking)', async () => {
    const shot = {
      analysis: ANALYSIS,
      title: 'Electric Scooter Rental App',
      description: 'This is a mobile app UI design for scooter rental.',
      tags: ['mobile app', 'ui', 'ux', 'transport'],
    };
    const { client, create } = fakeClient(message(JSON.stringify(shot)));
    const result = await new ClaudeProvider(CONFIG, client).prepareShot(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), OPTIONS);

    expect(result.content.title).toBe('Electric Scooter Rental App');
    const [params] = create.mock.calls[0]!;
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.output_config).toEqual({ effort: 'medium' });
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(params.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AQID' } });
    expect(params).not.toHaveProperty('thinking');
  });

  it('reports a refusal instead of parsing empty output', async () => {
    const { client } = fakeClient(message('', { stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: null } } as never));
    await expect(new ClaudeProvider(CONFIG, client).regenerateField('title', ANALYSIS, CURRENT, OPTIONS)).rejects.toMatchObject({
      code: 'AI_FAILED',
      detail: expect.stringContaining('declined'),
    });
  });

  it.each([
    [401, 'AI_AUTH'],
    [403, 'AI_AUTH'],
    [404, 'AI_MODEL_UNAVAILABLE'],
    [429, 'AI_RATE_LIMITED'],
    [400, 'AI_FAILED'],
  ])('maps HTTP %i to %s without retrying', async (status, code) => {
    const { client, create } = fakeClient(apiError(status), message('{"title":"Never Used"}'));
    await expect(new ClaudeProvider(CONFIG, client).regenerateField('title', ANALYSIS, CURRENT, OPTIONS)).rejects.toMatchObject({ code });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('retries a server error once', async () => {
    const { client, create } = fakeClient(apiError(529), message('{"title":"Second Attempt Title"}'));
    await expect(new ClaudeProvider(CONFIG, client).regenerateField('title', ANALYSIS, CURRENT, OPTIONS)).resolves.toBe('Second Attempt Title');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('requires an API key', async () => {
    const { client, create } = fakeClient();
    await expect(new ClaudeProvider({ ...CONFIG, apiKey: '' }, client).analyzeDesign(new Blob(['x']))).rejects.toMatchObject({
      code: 'AI_NOT_CONFIGURED',
    });
    expect(create).not.toHaveBeenCalled();
  });
});
