// Conversions between Blob, data URL and bytes. Implemented without fetch()
// so they also work in content scripts, where page CSP may block data: URLs.

export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array<ArrayBuffer>; mimeType: string } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('Malformed data URL');
  const mimeType = match[1] ?? 'application/octet-stream';
  const body = match[3] ?? '';
  if (!match[2]) return { bytes: new TextEncoder().encode(decodeURIComponent(body)), mimeType };

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mimeType };
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const { bytes, mimeType } = dataUrlToBytes(dataUrl);
  return new Blob([bytes], { type: mimeType });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Chunked to avoid call-stack limits with String.fromCharCode on large images.
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
