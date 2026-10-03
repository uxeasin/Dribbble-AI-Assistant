import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fillDescription, fillShotDetails, fillTags, fillTitle, locateShotFields } from '../../src/dribbble/form';
import { uploadImage } from '../../src/dribbble/upload';
import { installFileApiPolyfills, installUploadPage, type MockDribbble } from '../fixtures/dribbble-dom';

const CONTENT = {
  title: 'Modern SaaS Analytics Dashboard',
  description: 'A clean analytics dashboard concept.\n\nThe layout prioritises key metrics.',
  tags: ['dashboard', 'saas', 'ui'],
};

const image = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'shot.png', { type: 'image/png' });

beforeAll(installFileApiPolyfills);

describe('uploadImage', () => {
  let page: MockDribbble;
  beforeEach(() => {
    page = installUploadPage();
  });

  it('puts the file in Dribbble’s file input and waits for the editor', async () => {
    const input = document.getElementById('file-upload') as HTMLInputElement;
    const outcome = await uploadImage(image(), { timeoutMs: 1000 });
    expect(outcome.method).toBe('file-input');
    expect((input.files as unknown as File[])[0]?.name).toBe('shot.png');
    expect(document.getElementById('editor')!.hidden).toBe(false);
    expect(page.publishClicks).toBe(0);
  });

  it('fails with UPLOAD_FAILED if Dribbble never shows the editor', async () => {
    document.getElementById('file-upload')!.replaceWith(Object.assign(document.createElement('input'), { type: 'file' }));
    await expect(uploadImage(image(), { timeoutMs: 200 })).rejects.toMatchObject({ code: 'UPLOAD_FAILED' });
  });

  it('surfaces Dribbble’s own upload errors', async () => {
    // A fresh input without the fixture's success behaviour, which reports an error instead.
    const input = document.getElementById('file-upload')!.cloneNode() as HTMLInputElement;
    document.getElementById('file-upload')!.replaceWith(input);
    input.addEventListener('change', () =>
      document.body.insertAdjacentHTML('beforeend', '<div role="alert">File is too large</div>'),
    );
    await expect(uploadImage(image(), { timeoutMs: 1000 })).rejects.toMatchObject({ code: 'UPLOAD_FAILED', detail: 'File is too large' });
  });

  it('reports DOM_CHANGED when there is no upload control', async () => {
    document.body.innerHTML = '<main><h1>Something new</h1></main>';
    await expect(uploadImage(image(), { timeoutMs: 100, appearTimeoutMs: 50 })).rejects.toMatchObject({ code: 'DOM_CHANGED' });
  });
});

describe('form filling', () => {
  let page: MockDribbble;
  beforeEach(async () => {
    page = installUploadPage();
    await uploadImage(image(), { timeoutMs: 1000 });
  });

  it('fills a framework-controlled title', () => {
    const { title } = locateShotFields();
    let observed = '';
    title.element.addEventListener('input', (e) => (observed = (e.target as HTMLTextAreaElement).value));
    fillTitle(title.element, CONTENT.title);
    expect((title.element as HTMLTextAreaElement).value).toBe(CONTENT.title);
    expect(observed).toBe(CONTENT.title);
  });

  it('fills the rich-text description through a paste, keeping paragraphs', () => {
    const { description } = locateShotFields();
    expect(fillDescription(description.element, CONTENT.description)).toBeNull();
    expect(description.element.querySelectorAll('p')).toHaveLength(2);
    expect(description.element.textContent).toContain('key metrics');
  });

  it('enters tags one by one into a tokenising input', async () => {
    page.openFinalTouches();
    const tagsInput = document.getElementById('tags-input')!;
    const result = await fillTags(tagsInput, CONTENT.tags);
    expect(result).toEqual({ filled: 3, warnings: [] });
    expect(page.tags()).toEqual(CONTENT.tags);
  });

  it('falls back to comma-separated text for plain inputs', async () => {
    document.body.insertAdjacentHTML('beforeend', '<input id="plain" aria-label="Tags" />');
    const plain = document.getElementById('plain') as HTMLInputElement;
    const result = await fillTags(plain, CONTENT.tags);
    expect(plain.value).toBe('dashboard, saas, ui');
    expect(result.filled).toBe(3);
    expect(result.warnings).toHaveLength(1);
  });

  it('fills everything visible and leaves tags pending when the tag step is not open', async () => {
    const result = await fillShotDetails(CONTENT);
    expect(result.title && result.description).toBe(true);
    expect(result.tags).toBeNull();
  });

  it('fills tags in the same pass when Dribbble shows them inline', async () => {
    page.openFinalTouches();
    const result = await fillShotDetails(CONTENT);
    expect(result.tags?.filled).toBe(3);
  });
});
