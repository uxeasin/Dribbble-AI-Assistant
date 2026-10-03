// Mock Dribbble upload flow, modelled on dribbble.com/uploads/new. Behaviour is
// simulated with small scripts: choosing a file swaps the drop zone for the
// editor, "Continue" opens the final-touches dialog with the tag field, and the
// publish button records whether it was ever activated.

export interface MockDribbble {
  publishClicks: number;
  submits: number;
  tags: () => string[];
  openFinalTouches: () => void;
}

export const UPLOAD_PAGE_URL = 'https://dribbble.com/uploads/new';

export function installUploadPage(doc: Document = document, options: { tagsInline?: boolean } = {}): MockDribbble {
  doc.title = 'Upload your shot | Dribbble';
  doc.body.innerHTML = `
    <main>
      <section data-testid="dropzone" role="region" aria-label="Upload">
        <h1>What have you been working on?</h1>
        <p>Drag and drop an image, or <label for="file-upload">Browse</label></p>
        <input id="file-upload" type="file" accept="image/*,video/mp4" hidden />
      </section>
      <section id="editor" hidden>
        <textarea placeholder="Give me a name" rows="1"></textarea>
        <img id="preview" alt="" />
        <div class="ProseMirror" contenteditable="true" role="textbox" aria-multiline="true">
          <p data-placeholder="Write what went into this shot, or add any other details..."><br /></p>
        </div>
        <footer>
          <button type="button">Cancel</button>
          <button type="button">Save as draft</button>
          <button type="button" id="continue">Continue</button>
        </footer>
      </section>
      <form id="final-touches" role="dialog" aria-label="Final touches" hidden>
        <label for="tags-input">Tags <span>(maximum 20)</span></label>
        <ul id="tag-list"></ul>
        <input id="tags-input" type="text" placeholder="Add tags..." autocomplete="off" />
        <button type="submit" id="publish">Publish now</button>
      </form>
    </main>`;

  const state: MockDribbble = {
    publishClicks: 0,
    submits: 0,
    tags: () => Array.from(doc.querySelectorAll('#tag-list li')).map((li) => li.textContent ?? ''),
    openFinalTouches: () => {
      (doc.getElementById('final-touches') as HTMLElement).hidden = false;
    },
  };

  const fileInput = doc.getElementById('file-upload') as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    if (!fileInput.files?.length) return;
    (doc.querySelector('[data-testid="dropzone"]') as HTMLElement).remove();
    (doc.getElementById('editor') as HTMLElement).hidden = false;
    (doc.getElementById('preview') as HTMLImageElement).src = 'blob:https://dribbble.com/1234';
  });

  // ProseMirror-like paste handling: reads clipboardData and replaces content.
  const editor = doc.querySelector('.ProseMirror') as HTMLElement;
  editor.addEventListener('paste', (event) => {
    const text = (event as ClipboardEvent).clipboardData?.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    editor.innerHTML = text
      .split(/\n{2,}/)
      .map((p) => `<p>${p}</p>`)
      .join('');
  });

  // Tokenising tag input: Enter adds a chip and clears the input.
  const tagsInput = doc.getElementById('tags-input') as HTMLInputElement;
  tagsInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !tagsInput.value.trim()) return;
    event.preventDefault();
    const li = doc.createElement('li');
    li.textContent = tagsInput.value.trim();
    doc.getElementById('tag-list')!.append(li);
    tagsInput.value = '';
  });

  doc.getElementById('continue')!.addEventListener('click', state.openFinalTouches);
  doc.getElementById('publish')!.addEventListener('click', () => state.publishClicks++);
  doc.getElementById('final-touches')!.addEventListener('submit', (event) => {
    event.preventDefault();
    state.submits++;
  });

  if (options.tagsInline) state.openFinalTouches();
  return state;
}

/** jsdom has no DataTransfer and only accepts real FileLists; emulate both. */
export function installFileApiPolyfills(): void {
  if (typeof globalThis.DataTransfer === 'undefined') {
    class FakeDataTransfer {
      private readonly data = new Map<string, string>();
      readonly files: File[] = [];
      readonly items = { add: (file: File) => this.files.push(file) };
      setData(type: string, value: string) {
        this.data.set(type, value);
      }
      getData(type: string) {
        return this.data.get(type) ?? '';
      }
    }
    Object.assign(globalThis, { DataTransfer: FakeDataTransfer });
  }
  // jsdom's ClipboardEvent (if any) ignores the clipboardData init option.
  const honoursClipboardData =
    typeof globalThis.ClipboardEvent === 'function' &&
    new ClipboardEvent('paste', { clipboardData: new DataTransfer() }).clipboardData !== null;
  if (!honoursClipboardData) {
    class FakeClipboardEvent extends Event {
      readonly clipboardData: DataTransfer | null;
      constructor(type: string, init: ClipboardEventInit = {}) {
        super(type, init);
        this.clipboardData = init.clipboardData ?? null;
      }
    }
    Object.assign(globalThis, { ClipboardEvent: FakeClipboardEvent });
  }
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
  if (!descriptor || !('__patched' in (descriptor.get ?? {}))) {
    const store = new WeakMap<HTMLInputElement, unknown>();
    const get = function (this: HTMLInputElement) {
      return store.get(this) ?? null;
    };
    Object.defineProperty(get, '__patched', { value: true });
    Object.defineProperty(HTMLInputElement.prototype, 'files', {
      configurable: true,
      get,
      set(this: HTMLInputElement, value: unknown) {
        store.set(this, value);
      },
    });
  }
}
