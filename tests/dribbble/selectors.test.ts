import { beforeEach, describe, expect, it } from 'vitest';
import { findFirst } from '../../src/dribbble/dom-utils';
import { locateShotFields, locateTagsField } from '../../src/dribbble/form';
import { detectPageStatus, isLoginUrl, isUploadUrl } from '../../src/dribbble/navigation';
import { DESCRIPTION_FIELD, FILE_INPUT, TAGS_FIELD, TITLE_FIELD } from '../../src/dribbble/selectors';
import { installUploadPage, UPLOAD_PAGE_URL } from '../fixtures/dribbble-dom';

function showEditor() {
  document.querySelector('[data-testid="dropzone"]')?.remove();
  (document.getElementById('editor') as HTMLElement).hidden = false;
}

describe('Dribbble selectors', () => {
  beforeEach(() => installUploadPage());

  it('finds the file input even though it is visually hidden', () => {
    expect(findFirst(FILE_INPUT, document, () => true)?.element.id).toBe('file-upload');
  });

  it('finds the title field by placeholder', () => {
    showEditor();
    const match = findFirst(TITLE_FIELD);
    expect(match?.element.tagName).toBe('TEXTAREA');
    expect(match?.element.getAttribute('placeholder')).toBe('Give me a name');
  });

  it('finds the rich-text description editor by its inner placeholder', () => {
    showEditor();
    const match = findFirst(DESCRIPTION_FIELD);
    expect(match?.element.classList.contains('ProseMirror')).toBe(true);
  });

  it('finds the tag input by its label once visible', () => {
    showEditor();
    expect(findFirst(TAGS_FIELD)).toBeNull(); // dialog still hidden
    (document.getElementById('final-touches') as HTMLElement).hidden = false;
    expect(findFirst(TAGS_FIELD)?.element.id).toBe('tags-input');
    expect(findFirst(TAGS_FIELD)?.locator).toMatch(/label/);
  });

  it('prefers accessible labels over placeholders', () => {
    document.body.innerHTML = `
      <label for="a">Title</label><input id="a" />
      <input id="b" placeholder="Title" />`;
    expect(findFirst(TITLE_FIELD)?.element.id).toBe('a');
  });

  it('supports aria-label and name-based fallbacks', () => {
    document.body.innerHTML = `
      <input aria-label="Shot title" id="t" />
      <textarea name="description" id="d"></textarea>
      <input name="tags" id="g" />`;
    const fields = locateShotFields();
    expect(fields.title.element.id).toBe('t');
    expect(fields.description.element.id).toBe('d');
    expect(fields.tags?.element.id).toBe('g');
  });

  it('reports DOM_CHANGED when the title is missing', () => {
    document.body.innerHTML = '<div contenteditable="true"><p data-placeholder="Write what went into this shot"></p></div>';
    expect(() => locateShotFields()).toThrow(expect.objectContaining({ code: 'DOM_CHANGED' }));
  });

  it('reports DOM_CHANGED when the description is missing', () => {
    document.body.innerHTML = '<input placeholder="Give me a name" />';
    expect(() => locateShotFields()).toThrow(expect.objectContaining({ code: 'DOM_CHANGED' }));
  });

  it('refuses to treat one element as both title and description', () => {
    document.body.innerHTML = '<div contenteditable="true" aria-label="Title and description"></div>';
    document.body.firstElementChild!.setAttribute('aria-label', 'Title');
    document.body.innerHTML += '<div contenteditable="true" aria-label="Description"><p></p></div>';
    expect(() => locateShotFields()).not.toThrow();
  });

  it('never returns a tag field that also looks like a publish control', () => {
    document.body.innerHTML = '<input type="text" aria-label="Publish tags" name="tags" />';
    expect(locateTagsField()).toBeNull();
    document.body.innerHTML = '<input type="text" aria-label="Tags" name="tags" />';
    expect(locateTagsField()).not.toBeNull();
  });
});

describe('page status', () => {
  it('recognises upload and login URLs', () => {
    expect(isUploadUrl(UPLOAD_PAGE_URL)).toBe(true);
    expect(isUploadUrl('https://dribbble.com/shots/new')).toBe(true);
    expect(isUploadUrl('https://evil.example/uploads/new')).toBe(false);
    expect(isLoginUrl('https://dribbble.com/session/new')).toBe(true);
  });

  it('detects a ready upload page', () => {
    installUploadPage();
    expect(detectPageStatus(document, UPLOAD_PAGE_URL)).toEqual({ kind: 'ready' });
  });

  it('detects the login page', () => {
    document.body.innerHTML = '<form action="/session"><input type="password" /></form>';
    expect(detectPageStatus(document, 'https://dribbble.com/session/new')).toEqual({ kind: 'not-logged-in' });
  });

  it('detects security challenges', () => {
    document.body.innerHTML = '<iframe src="https://challenges.cloudflare.com/turnstile"></iframe>';
    expect(detectPageStatus(document, UPLOAD_PAGE_URL)).toEqual({ kind: 'security-challenge' });
    document.body.innerHTML = '';
    document.title = 'Just a moment...';
    expect(detectPageStatus(document, UPLOAD_PAGE_URL)).toEqual({ kind: 'security-challenge' });
  });
});
