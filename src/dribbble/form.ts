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
  countTextBlocks,
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
import { blockToHtml, descriptionToPlainText, parseDescription } from './format';
import { DESCRIPTION_FIELD, TAGS_FIELD, TITLE_FIELD } from './selectors';
import { isPublishControl } from './steps';

export interface ShotFields {
  title: Match;
  description: Match;
  tags: Match | null;
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
  commit(el);
}

/** Leaving a field is when many editors save their content; do it like a user would. */
function commit(el: Element): void {
  (el as HTMLElement).blur();
}

/** Returns a warning when the text landed but its paragraph layout did not. */
export function fillDescription(el: Element, description: string): string | null {
  const plain = descriptionToPlainText(description);
  if (isTextControl(el)) {
    // Plain textarea: keep the structure as text, one block per paragraph.
    setNativeValue(el, plain);
  } else if (isEditable(el)) {
    const blocks = parseDescription(description);
    const method = writeRichText(el, plain, blocks.map(blockToHtml).join(''));
    if (!method) throw new AppError('DOM_CHANGED', "Dribbble's description editor did not accept the text");
    commit(el);
    if (blocks.length > 1 && countTextBlocks(el) < 2) {
      return "Dribbble's editor kept the description text but not its paragraph formatting. Please check the layout before publishing.";
    }
    return null;
  } else {
    throw new AppError('DOM_CHANGED', 'Description field is not editable');
  }
  if (!containsText(el, plain)) throw new AppError('DOM_CHANGED', 'Description did not stick after filling');
  commit(el);
  return null;
}

/**
 * Re-reads the fields after a pause. If Dribbble re-rendered a field from its
 * own state and dropped our text, the text was never really saved, and
 * clicking "Continue" would lose it.
 */
export function detailsStillPresent(content: ShotContent, fields: ShotFields, root: Document = document): boolean {
  const title = fields.title.element.isConnected ? fields.title.element : findFirst(TITLE_FIELD, root)?.element;
  const titleKept = Boolean(title && containsText(title, content.title));
  // The editor's placeholder (used to find it) disappears once it has content,
  // so a re-rendered editor is checked through the page text instead.
  const plain = descriptionToPlainText(content.description);
  const descriptionKept = fields.description.element.isConnected
    ? containsText(fields.description.element, plain)
    : containsText(root.body, plain);
  return titleKept && descriptionKept;
}

export interface TagFillResult {
  filled: number;
  warnings: string[];
}

/** Tag pickers open a suggestion menu after typing; give it time before pressing Enter. */
const TAG_SETTLE_MS = 150;

function setTagInputValue(el: Element, value: string): void {
  if (isTextControl(el)) setNativeValue(el, value);
  else if (isEditable(el)) writeRichText(el, value);
}

/**
 * Enters tags one at a time like a user would (type, then comma, or Enter as a fallback).
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

    // Dribbble's tag field tokenises on a comma; this also avoids Enter
    // accidentally picking a highlighted suggestion instead of the typed tag.
    setTagInputValue(el, `${tag},`);
    pressKey(el, ',');
    await sleep(TAG_SETTLE_MS, signal);
    if (!readValue(el).trim()) {
      filled++;
      continue;
    }

    // Fallback for pickers that only add on Enter.
    setTagInputValue(el, tag);
    await sleep(TAG_SETTLE_MS, signal); // let the picker show its "create tag" option
    pressKey(el, 'Enter');
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
  fields: ShotFields;
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
  return { fields, title: true, description: true, tags, warnings };
}
