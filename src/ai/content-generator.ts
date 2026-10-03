// Orchestrates analysis → title → description → tags and applies the user's
// preferences (default tags, tag count) on top of the provider output.

import type { DesignAnalysis, GenerationOptions, ShotContent, ShotField } from '../types';
import { DRIBBBLE_MAX_TAGS, normalizeTags } from '../utils/tags';
import type { AIProvider } from './ai-provider';
import { analyzeImage } from './image-analyzer';

export type GenerationStep = 'analysis' | ShotField;

export interface GenerateCallbacks {
  signal?: AbortSignal;
  onStepStart?: (step: GenerationStep) => void;
  onStepDone?: (step: GenerationStep) => void;
}

export interface GeneratedShot {
  analysis: DesignAnalysis;
  content: ShotContent;
}

/** Designer's always-on tags come first; AI tags fill the rest up to Dribbble's limit. */
export function mergeDefaultTags(aiTags: readonly string[], defaultTags: readonly string[]): string[] {
  return normalizeTags([...defaultTags, ...aiTags], DRIBBBLE_MAX_TAGS);
}

const NEXT_STEP: Record<ShotField, ShotField | null> = { title: 'description', description: 'tags', tags: null };

export async function generateShot(
  provider: AIProvider,
  image: Blob,
  options: GenerationOptions,
  { signal, onStepStart, onStepDone }: GenerateCallbacks = {},
): Promise<GeneratedShot> {
  onStepStart?.('analysis');
  const analysis = await analyzeImage(provider, image, signal);
  onStepDone?.('analysis');

  onStepStart?.('title');
  const content = await provider.generateShotContent(analysis, options, {
    signal,
    onField: (field) => {
      onStepDone?.(field);
      const next = NEXT_STEP[field];
      if (next) onStepStart?.(next);
    },
  });

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
