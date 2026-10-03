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

const BLOCKED_FINISH_REASONS = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII']);

export class GeminiProvider extends JsonPromptProvider {
  readonly id = 'gemini';

  protected async complete({ system, text, image }: PromptRequest, signal?: AbortSignal): Promise<string> {
    const parts: unknown[] = [{ text }];
    if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });

    const model = this.config.model.replace(/^models\//, '');
    const data = await this.postJson<GenerateContentResponse>(
      `${this.config.baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
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
  defaultModel: 'gemini-2.5-flash',
  create: (config) => new GeminiProvider(config),
};
