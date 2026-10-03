// Bridges local image processing and AI processing: the original image is
// downscaled locally first, and only that reduced copy is sent to the provider.

import { prepareForAI } from '../image/processing';
import { AppError } from '../utils/errors';

export async function prepareImageForAI(original: Blob): Promise<Blob> {
  try {
    return await prepareForAI(original);
  } catch (error) {
    throw new AppError('INVALID_IMAGE', `Could not decode image: ${(error as Error).message}`);
  }
}
