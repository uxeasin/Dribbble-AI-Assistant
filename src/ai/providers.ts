// Registry of available AI providers. To add one, implement AIProvider and
// append its descriptor here — nothing else in the app needs to change.

import type { UserSettings } from '../types';
import { AppError } from '../utils/errors';
import type { AIProvider, ProviderDescriptor } from './ai-provider';
import { geminiDescriptor } from './gemini-provider';
import { openAIDescriptor } from './openai-provider';

export const PROVIDERS: readonly ProviderDescriptor[] = [openAIDescriptor, geminiDescriptor];

export function getProviderDescriptor(id: string): ProviderDescriptor {
  return PROVIDERS.find((p) => p.id === id) ?? openAIDescriptor;
}

export function createProvider(settings: Required<UserSettings>, apiKey: string | undefined): AIProvider {
  if (!apiKey) throw new AppError('AI_NOT_CONFIGURED');
  const descriptor = getProviderDescriptor(settings.aiProvider);
  return descriptor.create({
    apiKey,
    model: settings.model || descriptor.defaultModel,
    baseUrl: settings.baseUrl || descriptor.defaultBaseUrl,
  });
}
