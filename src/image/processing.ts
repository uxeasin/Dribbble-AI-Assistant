// Local image processing (decode, measure, downscale). Uses createImageBitmap
// and OffscreenCanvas, available in both the popup and the service worker.
// Nothing here sends data anywhere.

export interface Dimensions {
  width: number;
  height: number;
}

export async function readDimensions(blob: Blob): Promise<Dimensions> {
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export interface ResizeOptions {
  maxEdge: number;
  type: 'image/jpeg' | 'image/webp' | 'image/png';
  quality?: number;
}

/**
 * Returns a downscaled re-encoding of the image, or the original blob when it
 * is already small enough and in the requested format (avoids a needless copy).
 */
export async function resizeImage(blob: Blob, { maxEdge, type, quality = 0.85 }: ResizeOptions): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && blob.type === type) return blob;

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    if (type === 'image/jpeg') {
      // JPEG has no alpha; flatten transparent designs onto white instead of black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type, quality });
  } finally {
    bitmap.close();
  }
}

/** Long edge sent to the AI provider. Vision models gain little beyond this, and it keeps requests small. */
export const AI_IMAGE_MAX_EDGE = 1536;
export const THUMBNAIL_MAX_EDGE = 480;

export function prepareForAI(blob: Blob): Promise<Blob> {
  return resizeImage(blob, { maxEdge: AI_IMAGE_MAX_EDGE, type: 'image/jpeg', quality: 0.85 });
}

export function createThumbnail(blob: Blob): Promise<Blob> {
  return resizeImage(blob, { maxEdge: THUMBNAIL_MAX_EDGE, type: 'image/webp', quality: 0.8 });
}
