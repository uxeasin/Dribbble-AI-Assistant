// OpenAI (and OpenAI-compatible) Chat Completions provider. The image is sent
// directly from the extension to the configured API — there is no intermediate server.

import type { DesignAnalysis, GenerationOptions, ShotContent, ShotField } from '../types';
import { blobToDataUrl } from '../image/encoding';
import { AppError } from '../utils/errors';
import type { AIProvider, GenerationHooks, ProviderConfig, ProviderDescriptor } from './ai-provider';
import { ANALYSIS_PROMPT, SYSTEM_PROMPT, buildFieldPrompt } from './prompt-builder';
import { parseJsonObject, validateDescription, validateDesignAnalysis, validateTags, validateTitle } from './schema';

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'high' } };

interface ChatMessage {
  role: 'system' | 'user';
  content: string | ContentPart[];
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
}

const REQUEST_TIMEOUT_MS = 60_000;
/** One retry covers transient 429/5xx responses and the occasional malformed JSON. */
const MAX_ATTEMPTS = 2;
const FIELD_ORDER: readonly ShotField[] = ['title', 'description', 'tags'];

export class OpenAIProvider implements AIProvider {
  readonly id = 'openai';

  constructor(
    private readonly config: ProviderConfig,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async analyzeDesign(image: Blob, signal?: AbortSignal): Promise<DesignAnalysis> {
    const imageUrl = await blobToDataUrl(image);
    return this.requestValidated(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: ANALYSIS_PROMPT },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          ],
        },
      ],
      validateDesignAnalysis,
      signal,
    );
  }

  async generateShotContent(
    analysis: DesignAnalysis,
    options: GenerationOptions,
    hooks: GenerationHooks = {},
  ): Promise<ShotContent> {
    // Fields are generated in order, each seeing the previous ones, so the
    // description matches the title and tags match both.
    const content: Partial<ShotContent> = {};
    for (const field of FIELD_ORDER) {
      const value = await this.generateField(field, analysis, content, options, undefined, hooks.signal);
      Object.assign(content, { [field]: value });
      hooks.onField?.(field, value);
    }
    return content as ShotContent;
  }

  regenerateField<F extends ShotField>(
    field: F,
    analysis: DesignAnalysis,
    current: ShotContent,
    options: GenerationOptions,
    signal?: AbortSignal,
  ): Promise<ShotContent[F]> {
    return this.generateField(field, analysis, current, options, current[field], signal);
  }

  private generateField<F extends ShotField>(
    field: F,
    analysis: DesignAnalysis,
    current: Partial<ShotContent>,
    options: GenerationOptions,
    previous: ShotContent[F] | undefined,
    signal?: AbortSignal,
  ): Promise<ShotContent[F]> {
    const prompt = buildFieldPrompt({ field, analysis, options, current, previous });
    const validators: { [K in ShotField]: (obj: Record<string, unknown>) => ShotContent[K] } = {
      title: (obj) => validateTitle(obj.title),
      description: (obj) => validateDescription(obj.description),
      tags: (obj) => validateTags(obj.tags, options.tagCount),
    };
    return this.requestValidated(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      (text) => validators[field](parseJsonObject(text)),
      signal,
    );
  }

  private async requestValidated<T>(
    messages: ChatMessage[],
    validate: (text: string) => T,
    signal?: AbortSignal,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return validate(await this.complete(messages, signal));
      } catch (error) {
        lastError = error;
        if (!(error instanceof AppError) || !error.retryable || attempt === MAX_ATTEMPTS) throw error;
        await delay(800 * attempt, signal);
      }
    }
    throw lastError;
  }

  private async complete(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    if (!this.config.apiKey) throw new AppError('AI_NOT_CONFIGURED');

    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          response_format: { type: 'json_object' },
        }),
        signal: combined,
      });
    } catch (error) {
      if (signal?.aborted) throw new AppError('CANCELLED');
      if (timeout.aborted) throw new AppError('AI_FAILED', 'Request timed out', { retryable: true });
      throw new AppError('AI_FAILED', `Network error: ${(error as Error).message}`, { retryable: true });
    }

    if (response.status === 401 || response.status === 403) throw new AppError('AI_AUTH', `HTTP ${response.status}`);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const retryable = response.status === 429 || response.status >= 500;
      throw new AppError('AI_FAILED', `HTTP ${response.status}: ${body.slice(0, 300)}`, { retryable });
    }

    const data = (await response.json().catch(() => null)) as ChatCompletionResponse | null;
    const message = data?.choices?.[0]?.message;
    if (message?.refusal) throw new AppError('AI_FAILED', `Model refused: ${message.refusal}`);
    return message?.content ?? '';
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new AppError('CANCELLED'));
      },
      { once: true },
    );
  });
}

export const openAIDescriptor: ProviderDescriptor = {
  id: 'openai',
  label: 'OpenAI',
  keyUrl: 'https://platform.openai.com/api-keys',
  defaultBaseUrl: 'https://api.openai.com/v1',
  create: (config) => new OpenAIProvider(config),
};
