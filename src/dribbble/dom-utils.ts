// Generic DOM helpers for driving a third-party page the way a user would.
// Nothing in this file clicks buttons or submits forms.

/** A named strategy for locating an element, ordered from most to least reliable. */
export interface Locator {
  description: string;
  find(root: ParentNode): Element[];
}

export type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const TEXT_CONTROL = 'input:not([type]), input[type="text"], input[type="search"], textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]';

function textOf(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export const by = {
  css(selector: string, description = `css ${selector}`): Locator {
    return { description, find: (root) => Array.from(root.querySelectorAll(selector)) };
  },

  /** <label>Title</label> → its associated control (for=, nesting, or aria-labelledby). */
  label(pattern: RegExp, controlSelector: string = TEXT_CONTROL): Locator {
    return {
      description: `label ${pattern}`,
      find(root) {
        const results: Element[] = [];
        const doc = (root as Node).ownerDocument ?? (root as Document);
        for (const label of Array.from(root.querySelectorAll('label'))) {
          if (!pattern.test(textOf(label))) continue;
          const target = label.htmlFor ? doc.getElementById(label.htmlFor) : label.querySelector(controlSelector);
          if (target?.matches(controlSelector)) results.push(target);
        }
        for (const control of Array.from(root.querySelectorAll(`[aria-labelledby]`))) {
          if (!control.matches(controlSelector)) continue;
          const ids = (control.getAttribute('aria-labelledby') ?? '').split(/\s+/);
          const text = ids.map((id) => doc.getElementById(id)?.textContent ?? '').join(' ');
          if (pattern.test(text.trim())) results.push(control);
        }
        return results;
      },
    };
  },

  attribute(attribute: string, pattern: RegExp, controlSelector: string = TEXT_CONTROL): Locator {
    return {
      description: `[${attribute}] ${pattern}`,
      find: (root) =>
        Array.from(root.querySelectorAll(`[${attribute}]`)).filter(
          (el) => el.matches(controlSelector) && pattern.test(el.getAttribute(attribute) ?? ''),
        ),
    };
  },

  /**
   * Rich-text editors (ProseMirror, Tiptap, Lexical…) often render their
   * placeholder on an inner node; resolve it to the editable root.
   */
  editablePlaceholder(pattern: RegExp): Locator {
    return {
      description: `editable placeholder ${pattern}`,
      find(root) {
        const results = new Set<Element>();
        for (const el of Array.from(root.querySelectorAll('[data-placeholder], [aria-placeholder], [placeholder]'))) {
          const text =
            el.getAttribute('data-placeholder') ?? el.getAttribute('aria-placeholder') ?? el.getAttribute('placeholder');
          if (!text || !pattern.test(text)) continue;
          const editable = el.closest('[contenteditable="true"], [contenteditable=""]');
          if (editable) results.add(editable);
        }
        return Array.from(results);
      },
    };
  },

  /**
   * A short caption (heading, label, span…) such as "Tags (maximum 20)" →
   * the nearest matching control in the same section. Handles fields whose
   * visible label is not a real <label> element.
   */
  near(pattern: RegExp, controlSelector: string, maxDepth = 4): Locator {
    return {
      description: `near caption ${pattern}`,
      find(root) {
        const results = new Set<Element>();
        const captions = Array.from(root.querySelectorAll('label, legend, h1, h2, h3, h4, h5, h6, p, span, div, strong, b')).filter(
          (el) => {
            const text = textOf(el);
            return text.length > 0 && text.length <= 40 && pattern.test(text);
          },
        );
        for (const caption of captions) {
          let scope: Element | null = caption.parentElement;
          for (let depth = 0; scope && depth < maxDepth; depth++, scope = scope.parentElement) {
            const control = Array.from(scope.querySelectorAll(controlSelector)).find((el) => !caption.contains(el));
            if (control) {
              results.add(control);
              break;
            }
          }
        }
        return Array.from(results);
      },
    };
  },

  text(pattern: RegExp, selector: string): Locator {
    return {
      description: `text ${pattern} in ${selector}`,
      find: (root) => Array.from(root.querySelectorAll(selector)).filter((el) => pattern.test(textOf(el))),
    };
  },
};

/** Visible, enabled and not intentionally hidden from users. */
export function isUsable(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  if ((el as HTMLInputElement).disabled || el.getAttribute('aria-disabled') === 'true') return false;
  if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
  if ((el as HTMLInputElement).readOnly) return false;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  }
  return true;
}

export interface Match<T extends Element = Element> {
  element: T;
  locator: string;
}

/** Tries each locator in order and returns the first element that passes `filter`. */
export function findFirst(
  locators: readonly Locator[],
  root: ParentNode = document,
  filter: (el: Element) => boolean = isUsable,
): Match | null {
  for (const locator of locators) {
    const element = locator.find(root).find(filter);
    if (element) return { element, locator: locator.description };
  }
  return null;
}

export function findAllUnique(locators: readonly Locator[], root: ParentNode = document): Element[] {
  const found = new Set<Element>();
  for (const locator of locators) for (const el of locator.find(root)) found.add(el);
  return Array.from(found);
}

export function isEditable(el: Element): el is HTMLElement {
  return el instanceof HTMLElement && (el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '');
}

export function isTextControl(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

/**
 * Sets a value so that framework-controlled inputs (React, Vue…) notice it.
 * Frameworks wrap the element's own `value` setter, so the prototype setter is used.
 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function readValue(el: Element): string {
  if (isTextControl(el)) return el.value;
  return (el as HTMLElement).innerText ?? el.textContent ?? '';
}

/** Dispatches a keyboard sequence. Synthetic key events never trigger browser default actions such as form submission. */
export function pressKey(el: Element, key: 'Enter' | ',' | 'Tab'): void {
  const codes = { Enter: ['Enter', 13], ',': ['Comma', 188], Tab: ['Tab', 9] } as const;
  const [code, keyCode] = codes[key];
  const init: KeyboardEventInit & { keyCode: number; which: number } = {
    key,
    code,
    keyCode,
    which: keyCode,
    bubbles: true,
    cancelable: true,
    composed: true,
  };
  el.dispatchEvent(new KeyboardEvent('keydown', init));
  el.dispatchEvent(new KeyboardEvent('keypress', init));
  el.dispatchEvent(new KeyboardEvent('keyup', init));
}

function selectContents(el: HTMLElement): void {
  const selection = el.ownerDocument.getSelection();
  if (!selection) return;
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Whitespace is ignored entirely: editors render paragraph breaks differently from the source text. */
function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

export function containsText(el: Element, expected: string): boolean {
  const actual = normalizeForCompare(readValue(el));
  const probe = normalizeForCompare(expected).slice(0, 40);
  return probe.length > 0 && actual.includes(probe);
}

export interface RichTextBlock {
  /** Inner HTML of one paragraph, e.g. "<strong>Key Screens</strong>". */
  html: string;
  text: string;
}

export type RichTextMethod = 'paste' | 'blocks' | 'insertText' | 'dom';

export interface RichTextResult {
  method: RichTextMethod;
  /** False when the text landed but its paragraph structure did not. */
  structured: boolean;
}

/** Number of non-empty leaf blocks (paragraphs, list items, headings) in an editor. */
export function countTextBlocks(el: Element): number {
  const blocks = Array.from(el.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, div')).filter(
    (b) => (b.textContent ?? '').trim() && !b.querySelector('p, li, h1, h2, h3, h4, h5, h6, div'),
  );
  return blocks.length || ((el.textContent ?? '').trim() ? 1 : 0);
}

function execCommand(el: HTMLElement, command: string, value?: string): boolean {
  const doc = el.ownerDocument as Document & { execCommand?: Document['execCommand'] };
  try {
    return typeof doc.execCommand === 'function' && doc.execCommand(command, false, value);
  } catch {
    return false;
  }
}

/**
 * Replaces the contents of a rich-text editor, keeping paragraph structure.
 * Strategies, in order:
 * 1. a synthetic paste with HTML (editors read event.clipboardData, which keeps their state in sync),
 * 2. block by block: insert each paragraph, then press Enter to start the next one,
 * 3. execCommand('insertText') with the plain text,
 * 4. direct DOM write + input event (last resort; reported so it can be verified).
 */
export function writeRichText(el: HTMLElement, text: string, blocks?: readonly RichTextBlock[]): RichTextResult {
  const parts = blocks?.length ? blocks : [{ html: escapeHtml(text), text }];
  const html = parts.map((b) => `<p>${b.html}</p>`).join('');
  const wanted = Math.min(parts.length, 2);
  const isStructured = () => countTextBlocks(el) >= wanted;
  el.focus();
  selectContents(el);

  let flatPaste = false;
  if (typeof ClipboardEvent === 'function' && typeof DataTransfer === 'function') {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    data.setData('text/html', html);
    const paste = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    el.dispatchEvent(paste);
    if (paste.defaultPrevented && containsText(el, text)) {
      if (isStructured()) return { method: 'paste', structured: true };
      flatPaste = true;
    }
  }

  if (parts.length > 1 && writeBlocks(el, parts) && containsText(el, text) && isStructured()) {
    return { method: 'blocks', structured: true };
  }

  if (flatPaste) {
    // Re-paste so the editor isn't left with a half-written block attempt.
    selectContents(el);
    const data = new DataTransfer();
    data.setData('text/plain', text);
    data.setData('text/html', html);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    if (containsText(el, text)) return { method: 'paste', structured: isStructured() };
  }

  selectContents(el);
  if (execCommand(el, 'insertText', text) && containsText(el, text)) {
    return { method: 'insertText', structured: isStructured() };
  }

  el.innerHTML = html;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }));
  return { method: 'dom', structured: isStructured() };
}

/** Types paragraphs one at a time, pressing Enter between them like a user would. */
function writeBlocks(el: HTMLElement, blocks: readonly RichTextBlock[]): boolean {
  selectContents(el);
  if (!execCommand(el, 'delete') && (el.textContent ?? '').trim()) return false;
  for (const [index, block] of blocks.entries()) {
    if (index > 0) {
      const before = countTextBlocks(el);
      pressKey(el, 'Enter');
      if (countTextBlocks(el) <= before && !execCommand(el, 'insertParagraph')) return false;
    }
    const inserted = block.html.includes('<') ? execCommand(el, 'insertHTML', block.html) : execCommand(el, 'insertText', block.text);
    if (!inserted) return false;
  }
  return true;
}

export function setInputFiles(input: HTMLInputElement, files: File[]): void {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function dropFiles(target: Element, files: File[]): void {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  for (const type of ['dragenter', 'dragover', 'drop'] as const) {
    target.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export interface WaitOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  root?: Node;
  /** Polling complements MutationObserver for state changes that don't mutate the DOM. */
  pollMs?: number;
}

/** Resolves with the first truthy result of `check`, re-evaluated on DOM mutations; null on timeout. */
export function waitFor<T>(check: () => T | null | undefined | false, options: WaitOptions): Promise<T | null> {
  const { timeoutMs, signal, root = document, pollMs = 250 } = options;
  return new Promise((resolve, reject) => {
    const initial = check();
    if (initial) return resolve(initial);

    let settled = false;
    const finish = (value: T | null, error?: unknown) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearInterval(poll);
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (error !== undefined) reject(error);
      else resolve(value);
    };
    const evaluate = () => {
      try {
        const value = check();
        if (value) finish(value);
      } catch (error) {
        finish(null, error);
      }
    };
    const onAbort = () => finish(null, signal?.reason ?? new DOMException('Aborted', 'AbortError'));

    const observer = new MutationObserver(evaluate);
    observer.observe(root, { childList: true, subtree: true, attributes: true });
    const poll = setInterval(evaluate, pollMs);
    const timer = setTimeout(() => finish(null), timeoutMs);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
}
