// The most important guarantee of this extension: it never publishes a shot.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContentController } from '../../src/content/controller';
import { installPublishGuard } from '../../src/content/publish-guard';
import { blobToDataUrl } from '../../src/image/encoding';
import type { ContentEvent } from '../../src/messaging/messages';
import { installFileApiPolyfills, installUploadPage, UPLOAD_PAGE_URL, type MockDribbble } from '../fixtures/dribbble-dom';

const CONTENT = {
  title: 'Modern SaaS Analytics Dashboard',
  description: 'A clean analytics dashboard concept designed for modern SaaS products.',
  tags: ['dashboard', 'saas', 'ui', 'ux', 'web-design', 'analytics', 'product-design'],
};

async function imagePayload() {
  const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' });
  return { dataUrl: await blobToDataUrl(png), fileName: 'dashboard.png', mimeType: 'image/png' as const };
}

beforeAll(installFileApiPolyfills);

describe('publishing is never automated', () => {
  let page: MockDribbble;
  let events: ContentEvent[];
  let spies: ReturnType<typeof vi.spyOn>[];

  beforeEach(() => {
    page = installUploadPage();
    events = [];
    spies = [
      vi.spyOn(HTMLElement.prototype, 'click'),
      vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined),
      vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => undefined),
    ];
  });

  afterEach(() => vi.restoreAllMocks());

  function controller() {
    return createContentController({
      version: 'test',
      getUrl: () => UPLOAD_PAGE_URL,
      emit: (event) => events.push(event),
      banner: { show: () => undefined, hide: () => undefined },
    });
  }

  it('runs the full flow — upload, title, description, tags — without any publish or submit action', async () => {
    const content = controller();

    const uploaded = await content.handle({ type: 'UPLOAD_IMAGE', payload: await imagePayload() });
    expect(uploaded).toMatchObject({ ok: true });

    const filled = await content.handle({ type: 'FILL_SHOT_DETAILS', payload: CONTENT });
    expect(filled).toMatchObject({ ok: true, title: true, description: true, tagsPending: true });

    // The designer clicks "Continue" themselves; tags are then filled automatically.
    page.openFinalTouches();
    await vi.waitFor(() => expect(events.some((e) => e.type === 'TAGS_FILLED')).toBe(true), { timeout: 3000 });

    expect(page.tags()).toEqual(CONTENT.tags);
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe(CONTENT.title);
    expect(document.querySelector('.ProseMirror')!.textContent).toContain('modern SaaS products');

    // Nothing was published, submitted or clicked.
    expect(page.publishClicks).toBe(0);
    expect(page.submits).toBe(0);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    content.dispose();
  });

  it('fills inline tags in one pass, still without publishing', async () => {
    page.openFinalTouches();
    const content = controller();
    await content.handle({ type: 'UPLOAD_IMAGE', payload: await imagePayload() });
    const filled = await content.handle({ type: 'FILL_SHOT_DETAILS', payload: CONTENT });

    expect(filled).toMatchObject({ ok: true, tagsPending: false, tagsFilled: CONTENT.tags.length });
    expect(page.publishClicks).toBe(0);
    expect(page.submits).toBe(0);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('blocks a page script that tries to submit in response to simulated key presses', async () => {
    page.openFinalTouches();
    const tagsInput = document.getElementById('tags-input')!;
    // A hostile/odd page: pressing Enter in the tag field publishes the shot.
    tagsInput.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Enter') {
        document.getElementById('publish')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        document.getElementById('final-touches')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    });

    const content = controller();
    await content.handle({ type: 'UPLOAD_IMAGE', payload: await imagePayload() });
    await content.handle({ type: 'FILL_SHOT_DETAILS', payload: CONTENT });

    expect(page.publishClicks).toBe(0);
    expect(page.submits).toBe(0);
  });

  it('does not interfere with the designer’s own clicks outside automation', () => {
    page.openFinalTouches();
    const guard = installPublishGuard();
    guard.release();
    document.getElementById('publish')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(page.publishClicks).toBe(1);
  });

  it('rejects unknown commands such as a publish request', async () => {
    const content = controller();
    const response = await content.handle({ type: 'PUBLISH_SHOT' } as never);
    expect(response).toBeUndefined();
    expect(page.publishClicks).toBe(0);
  });

  it('exposes no publish API on the content controller', () => {
    const api = controller();
    expect(Object.keys(api).sort()).toEqual(['dispose', 'handle']);
  });
});

describe('source code safety boundary', () => {
  const root = join(import.meta.dirname, '../../src');
  // Everything that runs against or talks to Dribbble.
  const guarded = ['content', 'dribbble', 'background', 'messaging'];
  const files = guarded.flatMap((dir) => walk(join(root, dir)));

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
    });
  }

  it('scans the integration code', () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it.each([
    ['.click()', /\.click\s*\(/],
    ['requestSubmit()', /requestSubmit\s*\(/],
    ['form.submit()', /\.submit\s*\(/],
    // Detection helpers such as isPublishControl/onSubmit are fine; actions such as publishShot() are not.
    ['a publish/submit function', /\b(function|const|let)\s+(publish|submit|confirm)\w*\s*[=(]/i],
    ['a publish/submit method', /^\s*(async\s+)?(publish|submit|confirm)\w*\s*\(/im],
    ['a publish/submit message type', /type:\s*['"]\w*(PUBLISH|SUBMIT)\w*['"]/],
  ])('never contains %s', (_label, pattern) => {
    const offenders = files.filter((file) => pattern.test(stripComments(readFileSync(file, 'utf8')))).map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
});

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
