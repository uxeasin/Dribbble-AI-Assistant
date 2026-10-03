// Bridges local image processing and AI processing: the original image is
// downscaled locally first, and only that reduced copy is sent to the provider.

import type { DesignAnalysis } from '../types';
import { prepareForAI } from '../image/processing';
import { AppError } from '../utils/errors';
import type { AIProvider } from './ai-provider';

export async function analyzeImage(
  provider: AIProvider,
  original: Blob,
  signal?: AbortSignal,
  prepare: (blob: Blob) => Promise<Blob> = prepareForAI,
): Promise<DesignAnalysis> {
  let aiImage: Blob;
  try {
    aiImage = await prepare(original);
  } catch (error) {
    throw new AppError('INVALID_IMAGE', `Could not decode image: ${(error as Error).message}`);
  }
  return provider.analyzeDesign(aiImage, signal);
}
