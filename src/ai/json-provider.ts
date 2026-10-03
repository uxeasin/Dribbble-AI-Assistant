// Shared behaviour for providers that answer a prompt (optionally with one
// image) with a JSON object: field-by-field generation, output validation,
// retries and HTTP error mapping. Concrete providers only implement the
// transport in `complete()`.

import type { DesignAnalysis, GenerationOptions, ShotContent, ShotField } from '../types';
import { blobToDataUrl } from '../image/encoding';
import { AppError } from '../utils/errors';
import type { AIProvider, GenerationHooks, ProviderConfig } from './ai-provider';
import { ANALYSIS_PROMPT, SYSTEM_PROMPT, buildFieldPrompt } from './prompt-builder';
import { parseJsonObject, validateDescription, validateDesignAnalysis, validateTags, validateTitle } from './schema';

export interface PromptImage {
  mimeType: string;
  base64: string;
}

export interface PromptRequest {
  system: string;
  text: string;
  image?: PromptImage;
}

const REQUEST_TIMEOUT_MS = 60_000;
/** One retry covers transient 429/5xx responses and the occasional malformed JSON. */
const MAX_ATTEMPTS = 2;
const FIELD_ORDER: readonly ShotField[] = ['title', 'description', 'tags'];

export abstract class JsonPromptProvider implements AIProvider {
  abstract readonly id: string;

  constructor(
    protected readonly config: ProviderConfig,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  /** Sends one request and returns the model's raw text output. */
  protected abstract complete(request: PromptRequest, signal?: AbortSignal): Promise<string>;

  async analyzeDesign(image: Blob, signal?: AbortSignal): Promise<DesignAnalysis> {
    const dataUrl = await blobToDataUrl(image);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return this.requestValidated(
      { system: SYSTEM_PROMPT, text: ANALYSIS_PROMPT, image: { mimeType: image.type || 'image/jpeg', base64 } },
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
    const validators: { [K in ShotField]: (obj: Record<string, unknown>) => ShotContent[K] } = {
      title: (obj) => validateTitle(obj.title),
      description: (obj) => validateDescription(obj.description),
      tags: (obj) => validateTags(obj.tags, options.tagCount),
    };
    return this.requestValidated(
      { system: SYSTEM_PROMPT, text: buildFieldPrompt({ field, analysis, options, current, previous }) },
      (text) => validators[field](parseJsonObject(text)),
      signal,
    );
  }

  private async requestValidated<T>(request: PromptRequest, validate: (text: string) => T, signal?: AbortSignal): Promise<T> {
    if (!this.config.apiKey) throw new AppError('AI_NOT_CONFIGURED');
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return validate(await this.complete(request, signal));
      } catch (error) {
        lastError = error;
        if (!(error instanceof AppError) || !error.retryable || attempt === MAX_ATTEMPTS) throw error;
        await delay(800 * attempt, signal);
      }
    }
    throw lastError;
  }

  protected postJson<T>(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<T | null> {
    return this.requestJson<T>('POST', url, headers, body, signal);
  }

  protected getJson<T>(url: string, headers: Record<string, string>, signal?: AbortSignal): Promise<T | null> {
    return this.requestJson<T>('GET', url, headers, undefined, signal);
  }

  /** Sends a JSON request with a timeout, mapping network failures and HTTP errors to AppErrors. */
  private async requestJson<T>(
    method: 'GET' | 'POST',
    url: string,
    headers: Record<string, string>,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<T | null> {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: combined,
      });
    } catch (error) {
      if (signal?.aborted) throw new AppError('CANCELLED');
      if (timeout.aborted) throw new AppError('AI_FAILED', 'Request timed out', { retryable: true });
      throw new AppError('AI_FAILED', `Network error: ${(error as Error).message}`, { retryable: true });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const detail = `HTTP ${response.status}: ${extractErrorMessage(text)}`;
      if (this.isAuthError(response.status, text)) throw new AppError('AI_AUTH', detail);
      if (response.status === 404) throw new AppError('AI_MODEL_UNAVAILABLE', detail);
      if (response.status === 429) throw new AppError('AI_RATE_LIMITED', detail, { retryable: true });
      throw new AppError('AI_FAILED', detail, { retryable: response.status >= 500 });
    }
    return (await response.json().catch(() => null)) as T | null;
  }

  protected isAuthError(status: number, _body: string): boolean {
    return status === 401 || status === 403;
  }
}

/** Pulls the human-readable message out of an API error body (OpenAI and Google formats). */
function extractErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } } | { error?: { message?: string } }[];
    const error = Array.isArray(parsed) ? parsed[0]?.error : parsed.error;
    if (error?.message) return error.message.slice(0, 300);
  } catch {
    // not JSON
  }
  return body.slice(0, 300) || 'no details';
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
