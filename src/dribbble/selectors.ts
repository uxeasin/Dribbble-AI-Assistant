// ─────────────────────────────────────────────────────────────────────────────
// Every Dribbble-specific selector lives in this file.
//
// When Dribbble changes its upload UI, this is normally the only file that
// needs updating (see "Updating selectors" in the README). Locators are tried
// in order: accessible labels → stable attributes/placeholders → semantic
// fallbacks. Generated CSS class names are deliberately never used.
//
// Reference flow (dribbble.com/uploads/new, as of 2025):
//   1. Drop zone "Drag and drop an image, or Browse" backed by <input type=file>.
//   2. Editor: title field ("Give me a name"), rich-text description block.
//   3. "Continue" opens "Final touches": tags input ("Tags (maximum 20)"),
//      then the "Publish now" button — which this extension never touches.
// ─────────────────────────────────────────────────────────────────────────────

import { by, type Locator } from './dom-utils';

const SINGLE_LINE = 'input:not([type]), input[type="text"], textarea, [contenteditable="true"], [contenteditable=""]';
const MULTI_LINE = 'textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]';
const TAG_CONTROL = 'input:not([type]), input[type="text"], input[type="search"], [contenteditable="true"], [role="combobox"]';
/** Any text-like control; used for caption-based lookups where the input itself may be unlabeled. */
const TEXTLIKE_CONTROL =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"]), textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]';

export const FILE_INPUT: readonly Locator[] = [
  by.css('input[type="file"][accept*="image"]'),
  by.css('input[type="file"]'),
];

export const DROP_ZONE: readonly Locator[] = [
  by.css('[data-testid*="drop" i], [data-test*="drop" i]'),
  by.text(/drag (and|&) drop|drop (an|your) image|browse/i, '[role="button"], [role="region"], section, label, div'),
];

export const TITLE_FIELD: readonly Locator[] = [
  by.label(/^\s*(shot\s+)?title\b/i, SINGLE_LINE),
  by.attribute('aria-label', /^\s*(shot\s+)?title\b/i, SINGLE_LINE),
  by.attribute('placeholder', /give (me|it|your shot) a name|^\s*(shot\s+)?title/i, SINGLE_LINE),
  by.editablePlaceholder(/give (me|it|your shot) a name|^\s*(shot\s+)?title/i),
  by.css('input[name="title"], textarea[name="title"], input[name$="[title]"], textarea[name$="[title]"]'),
  by.css('input[id*="title" i], textarea[id*="title" i]'),
];

export const DESCRIPTION_FIELD: readonly Locator[] = [
  by.label(/^\s*(shot\s+)?description\b/i, MULTI_LINE),
  by.attribute('aria-label', /description|what went into this shot/i, MULTI_LINE),
  by.editablePlaceholder(/what went into this shot|description|add (any|some) (other )?details|tell (us|the) story/i),
  by.attribute('placeholder', /what went into this shot|description|add (any|some) (other )?details/i, MULTI_LINE),
  by.css('textarea[name="description"], textarea[name$="[description]"], textarea[id*="description" i]'),
];

export const TAGS_FIELD: readonly Locator[] = [
  by.label(/^\s*tags?\b/i, TAG_CONTROL),
  by.attribute('aria-label', /\btags?\b/i, TAG_CONTROL),
  by.attribute('placeholder', /\btags?\b/i, TAG_CONTROL),
  by.attribute('placeholder', /\btags?\b/i, TEXTLIKE_CONTROL),
  by.css('input[name="tags"], input[name$="[tags]"], input[name*="tag" i], input[id*="tag" i]'),
  // "Tags (maximum 20)" caption above an unlabeled tokenizer input.
  by.near(/^tags?\b/i, TEXTLIKE_CONTROL),
  // Tag pickers (e.g. react-select) draw "Add tags…" as a sibling element, not a placeholder attribute.
  by.near(/^add (a )?tags?\b/i, TEXTLIKE_CONTROL, 3),
];

/**
 * The editor's "Continue" button, which opens the "Final touches" dialog where
 * tags are entered. It does not publish. This is the ONLY control the
 * extension ever activates (see steps.ts); exact-text matching only.
 */
export const CONTINUE_BUTTON: readonly Locator[] = [
  by.text(/^(continue|next)$/i, 'button, [role="button"]'),
];

/**
 * Controls that publish or submit the shot. Used ONLY to recognise and guard
 * them (see publish-guard.ts) and in tests — never to interact with them.
 */
/** The visible "Publish now" button of the final step; its presence means that step is open. */
export const PUBLISH_BUTTON: readonly Locator[] = [
  by.text(/^(publish( now| shot)?|post( shot)?|share shot)$/i, 'button, [role="button"], a, input[type="submit"]'),
];

/** Controls whose name says they publish or submit. */
export const NAMED_PUBLISH_CONTROLS: readonly Locator[] = [
  ...PUBLISH_BUTTON,
  by.text(/^(submit|schedule)$/i, 'button, [role="button"], a, input[type="submit"]'),
  by.attribute('aria-label', /publish|submit/i, 'button, [role="button"], a, input'),
];

/** Every control that could submit something, including unnamed submit buttons. */
export const PUBLISH_CONTROLS: readonly Locator[] = [...NAMED_PUBLISH_CONTROLS, by.css('button[type="submit"], input[type="submit"]')];

export const UPLOAD_ERROR: readonly Locator[] = [
  by.text(/too large|unsupported|upload failed|couldn.?t upload|could not be uploaded|try again/i, '[role="alert"], [aria-live="assertive"], [aria-live="polite"]'),
];

export const UPLOADED_MEDIA: readonly Locator[] = [
  by.css('img[src^="blob:"], img[src^="data:image"], video[src^="blob:"]'),
  by.css('img[src*="/userupload/"], img[src*="cdn.dribbble.com/userupload"]'),
];

export const SECURITY_CHALLENGE: readonly Locator[] = [
  by.css(
    'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"], #challenge-form, #cf-challenge-running, [data-sitekey]',
  ),
];

export const LOGIN_FORM: readonly Locator[] = [
  by.css('form[action*="session"] input[type="password"], form[action*="login"] input[type="password"]'),
  by.css('input[type="password"]'),
];

export const SECURITY_CHALLENGE_TITLE = /just a moment|attention required|verify you are (a )?human|security check/i;
