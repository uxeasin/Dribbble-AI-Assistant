// Local-only image checks. Nothing here touches the network.

import type { SupportedMimeType } from '../types';
import { AppError } from '../utils/errors';

/** Matches Dribbble's own per-image limit. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_MIME_TYPES: readonly SupportedMimeType[] = ['image/png', 'image/jpeg', 'image/webp'];
export const ACCEPT_ATTRIBUTE = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
/** Bytes needed to recognise every supported signature. */
export const SIGNATURE_BYTES = 12;

const EXTENSIONS: Record<SupportedMimeType, readonly string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
};

/** Identifies the real format from the file's magic bytes (extensions and MIME types can lie). */
export function sniffMimeType(bytes: Uint8Array): SupportedMimeType | null {
  const matches = (offset: number, signature: readonly number[]) =>
    signature.every((byte, i) => bytes[offset + i] === byte);

  if (matches(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (matches(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  // RIFF....WEBP
  if (matches(0, [0x52, 0x49, 0x46, 0x46]) && matches(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  return null;
}

export interface FileLike {
  name: string;
  size: number;
  type: string;
}

/** Cheap checks that run before any bytes are read. */
export function validateFileInfo(file: FileLike): void {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const typeOk = ACCEPTED_MIME_TYPES.includes(file.type as SupportedMimeType);
  const extensionOk = Object.values(EXTENSIONS).some((list) => list.includes(extension));
  if (!typeOk && !extensionOk) throw new AppError('INVALID_IMAGE', `Unsupported type "${file.type || extension}"`);
  if (file.size <= 0) throw new AppError('INVALID_IMAGE', 'File is empty');
  if (file.size > MAX_IMAGE_BYTES) throw new AppError('IMAGE_TOO_LARGE', `${file.size} bytes`);
}

/** Full validation: metadata plus content signature. Returns the verified MIME type. */
export function validateImage(file: FileLike, header: Uint8Array): SupportedMimeType {
  validateFileInfo(file);
  const sniffed = sniffMimeType(header);
  if (!sniffed) throw new AppError('INVALID_IMAGE', 'File content is not a PNG, JPEG or WebP image');
  return sniffed;
}

export async function validateImageFile(file: File): Promise<SupportedMimeType> {
  validateFileInfo(file);
  const header = new Uint8Array(await file.slice(0, SIGNATURE_BYTES).arrayBuffer());
  return validateImage(file, header);
}
