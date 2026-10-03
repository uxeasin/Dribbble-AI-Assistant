// Holds the one image the designer explicitly selected. Kept in memory and,
// when it fits, in chrome.storage.session (memory-backed, never written to disk,
// not readable by content scripts) so a service-worker restart doesn't lose it.
// It is cleared as soon as the workflow is reset.

import type { ImagePayload } from '../types';

const IMAGE_KEY = 'selectedImage';

let current: ImagePayload | null = null;

export async function putImage(image: ImagePayload): Promise<void> {
  current = image;
  try {
    await chrome.storage.session.set({ [IMAGE_KEY]: image });
  } catch {
    // Over the session-storage quota: keep it in memory only.
    await chrome.storage.session.remove(IMAGE_KEY);
  }
}

export async function getImage(): Promise<ImagePayload | null> {
  if (current) return current;
  const stored = await chrome.storage.session.get(IMAGE_KEY);
  current = (stored[IMAGE_KEY] as ImagePayload | undefined) ?? null;
  return current;
}

export async function clearImage(): Promise<void> {
  current = null;
  await chrome.storage.session.remove(IMAGE_KEY);
}
