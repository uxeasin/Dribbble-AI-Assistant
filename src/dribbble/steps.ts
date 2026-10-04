// Advancing Dribbble's upload flow to the step where tags are entered.
//
// NEVER implement automated publishing.
//
// The editor's "Continue" button only opens the "Final touches" dialog (tags,
// visibility, schedule). That dialog's "Publish now" / "Save as draft" buttons
// are never touched. This file is the single place where the extension
// activates a Dribbble control, and it refuses anything that looks like a
// publish or submit control.

import { AppError } from '../utils/errors';
import { findFirst, isUsable, waitFor, type Match } from './dom-utils';
import { CONTINUE_BUTTON, NAMED_PUBLISH_CONTROLS, TAGS_FIELD } from './selectors';

/**
 * True for controls named like publish/submit. A plain type="submit" button
 * labelled "Continue" is not one: Dribbble may implement Continue that way.
 */
export function isPublishControl(el: Element, root: ParentNode = document): boolean {
  return NAMED_PUBLISH_CONTROLS.some((locator) => locator.find(root).some((control) => control === el || control.contains(el)));
}

export function findContinueButton(root: Document = document): HTMLElement | null {
  const match = findFirst(CONTINUE_BUTTON, root, (el) => isUsable(el) && !isPublishControl(el, root));
  return (match?.element as HTMLElement | undefined) ?? null;
}

export interface OpenTagStepOptions {
  /** How long to wait for Dribbble to enable Continue (it stays disabled while the image processes). */
  enableTimeoutMs?: number;
  /** How long to wait for the tag field after clicking. */
  dialogTimeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Waits until "Continue" is clickable, clicks it, and waits for the tag field.
 * Returns null (and clicks nothing) if no unambiguous Continue button appears.
 */
export async function openTagStep(
  root: Document = document,
  { enableTimeoutMs = 60_000, dialogTimeoutMs = 10_000, signal }: OpenTagStepOptions = {},
): Promise<Match | null> {
  // isUsable() rejects disabled / aria-disabled buttons, so this waits for Dribbble to enable it.
  const button = await waitFor(() => findContinueButton(root), { timeoutMs: enableTimeoutMs, signal, root });
  if (!button) return null;
  if (isPublishControl(button, root)) throw new AppError('DOM_CHANGED', 'Continue button looks like a publish control');

  button.click();
  return waitFor(() => findFirst(TAGS_FIELD, root), { timeoutMs: dialogTimeoutMs, signal, root });
}
