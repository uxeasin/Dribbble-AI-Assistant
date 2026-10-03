// Hard safety boundary.
//
// NEVER implement automated publishing.
//
// The extension may:
// - upload image
// - fill fields
// - prepare tags
//
// The extension must stop before:
// - Publish
// - Submit
// - Confirm publication
//
// The content script exposes no publish method. As defence in depth, while
// automation runs this guard cancels any form submission and any scripted
// (untrusted) click on a publish/submit control — e.g. if Dribbble's own key
// handlers reacted to a simulated Enter press by submitting. The one exception
// is a submission made by the editor's "Continue" button, which only opens
// the tag dialog. The guard is only active during automation, so the
// designer's own clicks are never affected.

import { CONTINUE_BUTTON, PUBLISH_CONTROLS } from '../dribbble/selectors';
import { isPublishControl as isNamedPublishControl } from '../dribbble/steps';

export interface GuardHandle {
  readonly blocked: number;
  release(): void;
}

function isPublishControl(target: EventTarget | null, doc: Document): boolean {
  if (!(target instanceof Element)) return false;
  const controls = PUBLISH_CONTROLS.flatMap((locator) => locator.find(doc));
  return controls.some((control) => control === target || control.contains(target));
}

export function installPublishGuard(doc: Document = document): GuardHandle {
  let blocked = 0;

  const block = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    blocked++;
    console.warn('[Dribbble AI Assistant] Blocked an automatic publish/submit attempt.');
  };
  const onSubmit = (event: Event) => {
    const source = (event as SubmitEvent).submitter ?? null;
    const isContinue =
      source !== null && CONTINUE_BUTTON.some((locator) => locator.find(doc).includes(source)) && !isNamedPublishControl(source, doc);
    if (!isContinue) block(event);
  };
  const onClick = (event: MouseEvent) => {
    if (!event.isTrusted && isPublishControl(event.target, doc)) block(event);
  };

  doc.addEventListener('submit', onSubmit, true);
  doc.addEventListener('click', onClick, true);

  return {
    get blocked() {
      return blocked;
    },
    release() {
      doc.removeEventListener('submit', onSubmit, true);
      doc.removeEventListener('click', onClick, true);
    },
  };
}

export async function withPublishGuard<T>(task: () => Promise<T>, doc: Document = document): Promise<T> {
  const guard = installPublishGuard(doc);
  try {
    return await task();
  } finally {
    guard.release();
  }
}
