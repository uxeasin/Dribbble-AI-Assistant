// Orchestrates shot generation and applies the user's preferences (default
// tags, tag count) on top of the provider output.

import type { DesignAnalysis, GenerationOptions, ShotContent, ShotField } from '../types';
import { DRIBBBLE_MAX_TAGS, normalizeTags } from '../utils/tags';
import type { AIProvider, GeneratedShot } from './ai-provider';
import { prepareImageForAI } from './image-analyzer';

/** "prepare" is local (resize/encode); "generate" is the single AI request. */
export type GenerationStep = 'prepare' | 'generate';

export interface GenerateCallbacks {
  signal?: AbortSignal;
  onStepStart?: (step: GenerationStep) => void;
  onStepDone?: (step: GenerationStep) => void;
}

export type { GeneratedShot };

/** Designer's always-on tags come first; AI tags fill the rest up to Dribbble's limit. */
export function mergeDefaultTags(aiTags: readonly string[], defaultTags: readonly string[]): string[] {
  return normalizeTags([...defaultTags, ...aiTags], DRIBBBLE_MAX_TAGS);
}

export async function generateShot(
  provider: AIProvider,
  image: Blob,
  options: GenerationOptions,
  { signal, onStepStart, onStepDone }: GenerateCallbacks = {},
): Promise<GeneratedShot> {
  onStepStart?.('prepare');
  const aiImage = await prepareImageForAI(image);
  onStepDone?.('prepare');

  onStepStart?.('generate');
  const { analysis, content } = await provider.prepareShot(aiImage, options, signal);
  onStepDone?.('generate');

  return { analysis, content: { ...content, tags: mergeDefaultTags(content.tags, options.defaultTags) } };
}

export async function regenerateField<F extends ShotField>(
  provider: AIProvider,
  field: F,
  analysis: DesignAnalysis,
  current: ShotContent,
  options: GenerationOptions,
  signal?: AbortSignal,
): Promise<ShotContent[F]> {
  const value = await provider.regenerateField(field, analysis, current, options, signal);
  if (field === 'tags') return mergeDefaultTags(value as string[], options.defaultTags) as ShotContent[F];
  return value;
}
