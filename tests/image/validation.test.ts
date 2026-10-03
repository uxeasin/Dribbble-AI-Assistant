import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, sniffMimeType, validateImage, validateImageFile } from '../../src/image/validation';
import { blobToDataUrl, dataUrlToBytes } from '../../src/image/encoding';
import { AppError } from '../../src/utils/errors';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0];

const file = (bytes: number[], name: string, type: string) => new File([new Uint8Array(bytes)], name, { type });

function expectCode(fn: () => unknown, code: string) {
  expect(fn).toThrow(AppError);
  try {
    fn();
  } catch (error) {
    expect((error as AppError).code).toBe(code);
  }
}

describe('image validation', () => {
  it.each([
    ['PNG', PNG, 'design.png', 'image/png'],
    ['JPG', JPEG, 'design.jpg', 'image/jpeg'],
    ['JPEG', JPEG, 'design.jpeg', 'image/jpeg'],
    ['WebP', WEBP, 'design.webp', 'image/webp'],
  ])('accepts %s', async (_label, bytes, name, type) => {
    await expect(validateImageFile(file(bytes, name, type))).resolves.toBe(type);
  });

  it('trusts file content over a wrong MIME type', async () => {
    await expect(validateImageFile(file(PNG, 'design.png', ''))).resolves.toBe('image/png');
  });

  it('rejects unsupported formats', async () => {
    await expect(validateImageFile(file(GIF, 'anim.gif', 'image/gif'))).rejects.toMatchObject({
      code: 'INVALID_IMAGE',
      message: 'Please select a PNG, JPG or WebP image.',
    });
  });

  it('rejects files whose content is not an image', async () => {
    await expect(validateImageFile(file([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'fake.png', 'image/png'))).rejects.toMatchObject({
      code: 'INVALID_IMAGE',
    });
  });

  it('rejects oversized files before reading them', () => {
    expectCode(() => validateImage({ name: 'big.png', type: 'image/png', size: MAX_IMAGE_BYTES + 1 }, new Uint8Array(PNG)), 'IMAGE_TOO_LARGE');
  });

  it('rejects empty files', () => {
    expectCode(() => validateImage({ name: 'empty.png', type: 'image/png', size: 0 }, new Uint8Array()), 'INVALID_IMAGE');
  });

  it('sniffs signatures', () => {
    expect(sniffMimeType(new Uint8Array(WEBP))).toBe('image/webp');
    expect(sniffMimeType(new Uint8Array(GIF))).toBeNull();
  });
});

describe('encoding', () => {
  it('round-trips bytes through a data URL without fetch', async () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 256);
    const dataUrl = await blobToDataUrl(new Blob([bytes], { type: 'image/png' }));
    const decoded = dataUrlToBytes(dataUrl);
    expect(decoded.mimeType).toBe('image/png');
    expect(decoded.bytes).toEqual(bytes);
  });
});
