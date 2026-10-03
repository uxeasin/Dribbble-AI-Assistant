// Places the designer's image into Dribbble's own upload control, exactly as
// if they had chosen it in the file picker. Dribbble then uploads it through
// its normal flow using the designer's existing session.

import { AppError } from '../utils/errors';
import { dropFiles, findFirst, setInputFiles, waitFor } from './dom-utils';
import { DROP_ZONE, FILE_INPUT, TITLE_FIELD, UPLOADED_MEDIA, UPLOAD_ERROR } from './selectors';

export interface UploadOptions {
  root?: Document;
  /** How long Dribbble may take to confirm the upload. */
  timeoutMs?: number;
  /** How long to wait for the uploader to render. */
  appearTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface UploadOutcome {
  method: 'file-input' | 'drop';
  warnings: string[];
}

const anyMatch = (root: Document, locators: Parameters<typeof findFirst>[0]) => findFirst(locators, root, () => true);

export async function uploadImage(
  file: File,
  { root = document, timeoutMs = 45_000, appearTimeoutMs = 15_000, signal }: UploadOptions = {},
): Promise<UploadOutcome> {
  const warnings: string[] = [];
  // Dribbble renders the uploader client-side, so it may appear after the page's load event.
  await waitFor(() => anyMatch(root, FILE_INPUT) ?? findFirst(DROP_ZONE, root), {
    timeoutMs: appearTimeoutMs,
    signal,
    root,
  });

  const editorAlreadyVisible = findFirst(TITLE_FIELD, root) !== null;
  const mediaBefore = new Set(UPLOADED_MEDIA.flatMap((l) => l.find(root)));

  // File inputs are usually visually hidden, so visibility is not required here.
  const input = anyMatch(root, FILE_INPUT)?.element as HTMLInputElement | undefined;
  let method: UploadOutcome['method'];
  if (input) {
    const accept = input.accept.toLowerCase();
    if (accept && !accept.includes('image') && !accept.includes(file.type) && !accept.includes('*')) {
      warnings.push(`Dribbble's file input does not list ${file.type} as accepted.`);
    }
    setInputFiles(input, [file]);
    method = 'file-input';
  } else {
    const zone = findFirst(DROP_ZONE, root);
    if (!zone) throw new AppError('DOM_CHANGED', 'No file input or drop zone found on the upload page');
    dropFiles(zone.element, [file]);
    method = 'drop';
  }

  // Success = Dribbble moved on to the editor, or a new preview of the image appeared.
  const outcome = await waitFor<'done' | 'error'>(
    () => {
      if (anyMatch(root, UPLOAD_ERROR)) return 'error';
      const newMedia = UPLOADED_MEDIA.some((l) => l.find(root).some((el) => !mediaBefore.has(el)));
      if (newMedia) return 'done';
      if (!editorAlreadyVisible && findFirst(TITLE_FIELD, root)) return 'done';
      return null;
    },
    { timeoutMs, signal, root },
  );

  if (outcome === 'error') {
    const message = anyMatch(root, UPLOAD_ERROR)?.element.textContent?.trim();
    throw new AppError('UPLOAD_FAILED', message || 'Dribbble reported an upload error');
  }
  if (outcome === null) {
    throw new AppError(
      'UPLOAD_FAILED',
      editorAlreadyVisible ? 'No image preview appeared after upload' : 'The shot editor did not appear after upload',
    );
  }
  return { method, warnings };
}
