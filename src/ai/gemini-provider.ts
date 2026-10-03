// Google Gemini provider (Generative Language API, generateContent). The image
// is sent inline, directly from the extension — there is no intermediate server.

import { AppError } from '../utils/errors';
import type { ProviderDescriptor } from './ai-provider';
import { JsonPromptProvider, type PromptRequest } from './json-provider';

interface GenerateContentResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

export interface GeminiModelInfo {
  name: string;
  supportedGenerationMethods?: string[];
}

const BLOCKED_FINISH_REASONS = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII']);
/** Models that can't take an image prompt and answer with text. */
const UNSUITABLE_MODEL = /embedding|aqa|tts|audio|live|image-generation|-image|imagen|veo|robotics|computer-use|learnlm|gemma/i;

/**
 * Picks the best vision-capable text model from the account's model list:
 * the rolling "flash-latest" alias if offered, otherwise the newest stable
 * Flash model, otherwise any newest Gemini model. Google retires model names
 * regularly, so this keeps the extension working without a hard-coded name.
 */
export function pickGeminiModel(models: readonly GeminiModelInfo[]): string | null {
  const candidates = models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((name) => name.startsWith('gemini') && !UNSUITABLE_MODEL.test(name));

  const score = (name: string) => {
    const version = Number(/gemini-(\d+(?:\.\d+)?)/.exec(name)?.[1] ?? 0);
    let s = version * 10;
    if (name === 'gemini-flash-latest') s += 1000;
    if (/flash/.test(name)) s += 100;
    if (/lite/.test(name)) s -= 50;
    if (/preview|exp/.test(name)) s -= 30;
    return s;
  };
  return candidates.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export class GeminiProvider extends JsonPromptProvider {
  readonly id = 'gemini';
  private model = this.config.model.replace(/^models\//, '');
  private modelResolved = false;

  protected async complete(request: PromptRequest, signal?: AbortSignal): Promise<string> {
    try {
      return await this.generate(request, signal);
    } catch (error) {
      // The configured model was retired or isn't enabled for this key: switch
      // to one the key can use, once per provider instance.
      if (!(error instanceof AppError) || error.code !== 'AI_MODEL_UNAVAILABLE' || this.modelResolved) throw error;
      this.modelResolved = true;
      const fallback = await this.findAvailableModel(signal);
      if (!fallback || fallback === this.model) {
        throw new AppError('AI_MODEL_UNAVAILABLE', `Model "${this.model}" not found and no alternative is available. ${error.detail ?? ''}`);
      }
      console.info(`[Dribbble AI Assistant] Gemini model "${this.model}" unavailable; using "${fallback}".`);
      this.model = fallback;
      return this.generate(request, signal);
    }
  }

  private async findAvailableModel(signal?: AbortSignal): Promise<string | null> {
    const models: GeminiModelInfo[] = [];
    let pageToken = '';
    // A couple of pages is plenty; the list is ~50 models per page.
    for (let page = 0; page < 3; page++) {
      const query = `pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const data = await this.getJson<{ models?: GeminiModelInfo[]; nextPageToken?: string }>(
        `${this.config.baseUrl}/models?${query}`,
        { 'x-goog-api-key': this.config.apiKey },
        signal,
      );
      models.push(...(data?.models ?? []));
      if (!data?.nextPageToken) break;
      pageToken = data.nextPageToken;
    }
    return pickGeminiModel(models);
  }

  private async generate({ system, text, image }: PromptRequest, signal?: AbortSignal): Promise<string> {
    const parts: unknown[] = [{ text }];
    if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });

    const data = await this.postJson<GenerateContentResponse>(
      `${this.config.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`,
      // Header rather than ?key= so the key never appears in URLs or logs.
      { 'x-goog-api-key': this.config.apiKey },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json' },
      },
      signal,
    );

    if (data?.promptFeedback?.blockReason) {
      throw new AppError('AI_FAILED', `Gemini blocked the request: ${data.promptFeedback.blockReason}`);
    }
    const candidate = data?.candidates?.[0];
    if (candidate?.finishReason && BLOCKED_FINISH_REASONS.has(candidate.finishReason)) {
      throw new AppError('AI_FAILED', `Gemini stopped: ${candidate.finishReason}`);
    }
    return (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  }

  // Gemini reports an invalid key as 400 INVALID_ARGUMENT with reason API_KEY_INVALID.
  protected override isAuthError(status: number, body: string): boolean {
    return status === 401 || status === 403 || (status === 400 && /API_KEY_INVALID|API key not valid/i.test(body));
  }
}

export const geminiDescriptor: ProviderDescriptor = {
  id: 'gemini',
  label: 'Google Gemini',
  keyUrl: 'https://aistudio.google.com/app/apikey',
  keyPlaceholder: 'AIza…',
  defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  // Rolling alias for the current Flash model; retired names are also
  // recovered from automatically (see pickGeminiModel).
  defaultModel: 'gemini-flash-latest',
  create: (config) => new GeminiProvider(config),
};
