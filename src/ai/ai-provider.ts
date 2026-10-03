// Provider-agnostic AI contract. The rest of the extension only talks to this
// interface; adding a provider means implementing it and registering a factory.

import type { DesignAnalysis, GenerationOptions, ShotContent, ShotField } from '../types';

export interface GenerationHooks {
  signal?: AbortSignal;
  /** Called as soon as each field is ready, so the UI can show real progress. */
  onField?: <F extends ShotField>(field: F, value: ShotContent[F]) => void;
}

export interface AIProvider {
  readonly id: string;

  /**
   * Analyses the image and writes title, description and tags in a single
   * request — the default path, since it costs one API call per shot.
   * `image` should already be downscaled for the provider.
   */
  prepareShot(image: Blob, options: GenerationOptions, signal?: AbortSignal): Promise<GeneratedShot>;

  /** Describes the design. `image` should already be downscaled for the provider. */
  analyzeDesign(image: Blob, signal?: AbortSignal): Promise<DesignAnalysis>;

  generateShotContent(
    analysis: DesignAnalysis,
    options: GenerationOptions,
    hooks?: GenerationHooks,
  ): Promise<ShotContent>;

  /** Produces a fresh alternative for one field, keeping the others as context. */
  regenerateField<F extends ShotField>(
    field: F,
    analysis: DesignAnalysis,
    current: ShotContent,
    options: GenerationOptions,
    signal?: AbortSignal,
  ): Promise<ShotContent[F]>;
}

export interface GeneratedShot {
  analysis: DesignAnalysis;
  content: ShotContent;
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface ProviderDescriptor {
  id: string;
  label: string;
  /** Where users obtain an API key; shown in Settings. */
  keyUrl: string;
  /** Hint for the API key field, e.g. "sk-…". */
  keyPlaceholder: string;
  defaultBaseUrl: string;
  /** Vision-capable model used when the provider is selected. */
  defaultModel: string;
  create(config: ProviderConfig): AIProvider;
}
