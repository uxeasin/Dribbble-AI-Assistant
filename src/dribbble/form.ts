// Fills the shot's title, description and tags, verifying each write.
//
// NEVER implement automated publishing.
//
// This module may:
// - fill fields
// - prepare tags
//
// It must stop before:
// - Publish
// - Submit
// - Confirm publication

import type { ShotContent } from '../types';
import { AppError } from '../utils/errors';
import {
  containsText,
  findFirst,
  isEditable,
  isTextControl,
  pressKey,
  readValue,
  setNativeValue,
  sleep,
  writeRichText,
  type Match,
} from './dom-utils';
import { DESCRIPTION_FIELD, PUBLISH_CONTROLS, TAGS_FIELD, TITLE_FIELD } from './selectors';

export interface ShotFields {
  title: Match;
  description: Match;
  tags: Match | null;
}

function isPublishControl(el: Element, root: ParentNode): boolean {
  return PUBLISH_CONTROLS.some((locator) => locator.find(root).includes(el));
}

/**
 * Locates the editable fields. Throws DOM_CHANGED instead of guessing when the
 * page no longer looks like the expected editor.
 */
export function locateShotFields(root: Document = document): ShotFields {
  const title = findFirst(TITLE_FIELD, root);
  const description = findFirst(DESCRIPTION_FIELD, root);
  if (!title) throw new AppError('DOM_CHANGED', 'Title field not found');
  if (!description) throw new AppError('DOM_CHANGED', 'Description field not found');
  if (title.element === description.element || title.element.contains(description.element) || description.element.contains(title.element)) {
    throw new AppError('DOM_CHANGED', 'Title and description resolved to the same element');
  }
  for (const match of [title, description]) {
    if (isPublishControl(match.element, root)) throw new AppError('DOM_CHANGED', `${match.locator} matched a publish control`);
  }
  return { title, description, tags: locateTagsField(root) };
}

export function locateTagsField(root: Document = document): Match | null {
  const tags = findFirst(TAGS_FIELD, root);
  return tags && !isPublishControl(tags.element, root) ? tags : null;
}

export function fillTitle(el: Element, title: string): void {
  if (isTextControl(el)) setNativeValue(el, title);
  else if (isEditable(el)) writeRichText(el, title);
  else throw new AppError('DOM_CHANGED', 'Title field is not editable');
  if (readValue(el).trim() !== title.trim() && !containsText(el, title)) {
    throw new AppError('DOM_CHANGED', 'Title did not stick after filling');
  }
}

/** Returns a warning when the write could not be verified through the editor's own input pipeline. */
export function fillDescription(el: Element, description: string): string | null {
  if (isTextControl(el)) {
    setNativeValue(el, description);
  } else if (isEditable(el)) {
    const method = writeRichText(el, description);
    if (method === 'dom') {
      return 'The description was written directly into the editor. Please check it is kept when you continue.';
    }
  } else {
    throw new AppError('DOM_CHANGED', 'Description field is not editable');
  }
  if (!containsText(el, description)) throw new AppError('DOM_CHANGED', 'Description did not stick after filling');
  return null;
}

export interface TagFillResult {
  filled: number;
  warnings: string[];
}

const TAG_SETTLE_MS = 60;

function setTagInputValue(el: Element, value: string): void {
  if (isTextControl(el)) setNativeValue(el, value);
  else if (isEditable(el)) writeRichText(el, value);
}

/**
 * Enters tags one at a time like a user would (type, then Enter or comma).
 * A tokenising tag field clears its input once a tag is accepted, which is how
 * acceptance is verified. If the field never tokenises, it is treated as a plain
 * comma-separated text field.
 */
export async function fillTags(el: Element, tags: readonly string[], signal?: AbortSignal): Promise<TagFillResult> {
  const warnings: string[] = [];
  let filled = 0;
  const target = el as HTMLElement;
  target.focus();

  for (const [index, tag] of tags.entries()) {
    signal?.throwIfAborted();
    setTagInputValue(el, tag);
    pressKey(el, 'Enter');
    await sleep(TAG_SETTLE_MS, signal);

    if (!readValue(el).trim()) {
      filled++;
      continue;
    }

    // Some tokenisers only split on a comma.
    setTagInputValue(el, `${tag},`);
    pressKey(el, ',');
    await sleep(TAG_SETTLE_MS, signal);
    if (!readValue(el).trim()) {
      filled++;
      continue;
    }

    if (index === 0 && isTextControl(el)) {
      // Not a tokeniser: fall back to a plain comma-separated value.
      setNativeValue(el, tags.join(', '));
      warnings.push('Tags were entered as a comma-separated list. Please check they look right on Dribbble.');
      return { filled: tags.length, warnings };
    }
    warnings.push(`Tag "${tag}" was not accepted by Dribbble.`);
    setTagInputValue(el, '');
  }

  target.blur();
  return { filled, warnings };
}

export interface DetailsFillResult {
  title: boolean;
  description: boolean;
  tags: TagFillResult | null;
  warnings: string[];
}

/** Fills everything currently on screen. Tags are left for later when Dribbble shows them in a later step. */
export async function fillShotDetails(
  content: ShotContent,
  root: Document = document,
  signal?: AbortSignal,
): Promise<DetailsFillResult> {
  const fields = locateShotFields(root);
  const warnings: string[] = [];

  fillTitle(fields.title.element, content.title);
  const descriptionWarning = fillDescription(fields.description.element, content.description);
  if (descriptionWarning) warnings.push(descriptionWarning);

  let tags: TagFillResult | null = null;
  if (fields.tags && content.tags.length) {
    tags = await fillTags(fields.tags.element, content.tags, signal);
    warnings.push(...tags.warnings);
  }
  return { title: true, description: true, tags, warnings };
}
