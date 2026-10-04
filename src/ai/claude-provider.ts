// Anthropic Claude provider, using the official SDK. Requests go directly from
// the extension to api.anthropic.com with the designer's own key — the same
// trust model as the other providers (the key never leaves this browser).

import Anthropic from '@anthropic-ai/sdk';
import { AppError } from '../utils/errors';
import type { ProviderConfig, ProviderDescriptor } from './ai-provider';
import { JsonPromptProvider, type PromptRequest } from './json-provider';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const IMAGE_TYPES: readonly ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** Thinking is always on for current Claude models, so allow more time than a plain completion. */
const REQUEST_TIMEOUT_MS = 120_000;

export class ClaudeProvider extends JsonPromptProvider {
  readonly id = 'claude';
  private readonly client: Anthropic;

  constructor(config: ProviderConfig, client?: Anthropic) {
    super(config);
    this.client =
      client ??
      new Anthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        // The key is the designer's own, entered in Settings and kept in
        // chrome.storage.local; there is no server to proxy through.
        dangerouslyAllowBrowser: true,
        timeout: REQUEST_TIMEOUT_MS,
        // Retries are decided by JsonPromptProvider (e.g. never on 429, to save quota).
        maxRetries: 0,
      });
  }

  protected async complete({ system, text, image }: PromptRequest, signal?: AbortSignal): Promise<string> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (image) {
      const mediaType = IMAGE_TYPES.includes(image.mimeType as ImageMediaType) ? (image.mimeType as ImageMediaType) : 'image/jpeg';
      content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: image.base64 } });
    }
    content.push({ type: 'text', text });

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create(
        {
          model: this.config.model,
          max_tokens: 16000,
          system,
          messages: [{ role: 'user', content }],
          // Short, well-specified writing task: medium effort is plenty.
          output_config: { effort: 'medium' },
          // If a safety classifier declines, retry on a fallback model in the same call.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { signal },
      );
    } catch (error) {
      throw toAppError(error, signal);
    }

    if (response.stop_reason === 'refusal') {
      const category = response.stop_details?.category ?? 'unspecified';
      throw new AppError('AI_FAILED', `Claude declined the request (${category})`);
    }
    if (response.stop_reason === 'max_tokens') {
      throw new AppError('AI_FAILED', 'Claude ran out of output tokens', { retryable: true });
    }
    return response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  }
}

function toAppError(error: unknown, signal?: AbortSignal): AppError {
  if (signal?.aborted || error instanceof Anthropic.APIUserAbortError) return new AppError('CANCELLED');
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AppError('AI_AUTH', error.message);
  }
  if (error instanceof Anthropic.NotFoundError) return new AppError('AI_MODEL_UNAVAILABLE', error.message);
  if (error instanceof Anthropic.RateLimitError) return new AppError('AI_RATE_LIMITED', error.message);
  if (error instanceof Anthropic.InternalServerError) return new AppError('AI_FAILED', error.message, { retryable: true });
  if (error instanceof Anthropic.APIConnectionError) {
    return new AppError('AI_FAILED', `Network error: ${error.message}`, { retryable: true });
  }
  if (error instanceof Anthropic.APIError) return new AppError('AI_FAILED', `HTTP ${error.status}: ${error.message}`);
  return new AppError('AI_FAILED', (error as Error).message);
}

export const claudeDescriptor: ProviderDescriptor = {
  id: 'claude',
  label: 'Anthropic Claude',
  keyUrl: 'https://console.anthropic.com/settings/keys',
  keyPlaceholder: 'sk-ant-…',
  defaultBaseUrl: 'https://api.anthropic.com',
  defaultModel: 'claude-opus-5-5',
  create: (config) => new ClaudeProvider(config),
};
