// OpenAI (and OpenAI-compatible) Chat Completions provider. The image is sent
// directly from the extension to the configured API — there is no intermediate server.

import { AppError } from '../utils/errors';
import type { ProviderDescriptor } from './ai-provider';
import { JsonPromptProvider, type PromptRequest } from './json-provider';

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
}

export class OpenAIProvider extends JsonPromptProvider {
  readonly id = 'openai';

  protected async complete({ system, text, image }: PromptRequest, signal?: AbortSignal): Promise<string> {
    const userContent = image
      ? [
          { type: 'text', text },
          { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}`, detail: 'high' } },
        ]
      : text;

    const data = await this.postJson<ChatCompletionResponse>(
      `${this.config.baseUrl}/chat/completions`,
      { Authorization: `Bearer ${this.config.apiKey}` },
      {
        model: this.config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
      },
      signal,
    );

    const message = data?.choices?.[0]?.message;
    if (message?.refusal) throw new AppError('AI_FAILED', `Model refused: ${message.refusal}`);
    return message?.content ?? '';
  }
}

export const openAIDescriptor: ProviderDescriptor = {
  id: 'openai',
  label: 'OpenAI',
  keyUrl: 'https://platform.openai.com/api-keys',
  keyPlaceholder: 'sk-…',
  defaultBaseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4o-mini',
  create: (config) => new OpenAIProvider(config),
};
