// Dribbble URLs and page-state detection. Pure functions over URL/Document so
// they can run in the background (URLs only) and the content script (DOM).

import type { PageStatus } from '../messaging/messages';
import { findFirst, type Locator } from './dom-utils';
import { LOGIN_FORM, SECURITY_CHALLENGE, SECURITY_CHALLENGE_TITLE } from './selectors';

export const DRIBBBLE_ORIGIN = 'https://dribbble.com';
export const UPLOAD_URL = `${DRIBBBLE_ORIGIN}/uploads/new`;

const UPLOAD_PATHS = [/^\/uploads\/new\/?$/, /^\/shots\/new\/?$/];
const LOGIN_PATHS = [/^\/session(\/new)?\/?$/, /^\/signup/, /^\/login/];

function parse(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isDribbbleUrl(url: string | undefined): boolean {
  const parsed = parse(url);
  return parsed?.protocol === 'https:' && (parsed.hostname === 'dribbble.com' || parsed.hostname === 'www.dribbble.com');
}

export function isUploadUrl(url: string | undefined): boolean {
  const parsed = parse(url);
  return isDribbbleUrl(url) && UPLOAD_PATHS.some((re) => re.test(parsed!.pathname));
}

export function isLoginUrl(url: string | undefined): boolean {
  const parsed = parse(url);
  return isDribbbleUrl(url) && LOGIN_PATHS.some((re) => re.test(parsed!.pathname));
}

const any = (locators: readonly Locator[], doc: Document) => findFirst(locators, doc, () => true) !== null;

export function hasSecurityChallenge(doc: Document): boolean {
  return SECURITY_CHALLENGE_TITLE.test(doc.title) || any(SECURITY_CHALLENGE, doc);
}

export function detectPageStatus(doc: Document, url: string): PageStatus {
  if (hasSecurityChallenge(doc)) return { kind: 'security-challenge' };
  if (isLoginUrl(url) || (!isUploadUrl(url) && any(LOGIN_FORM, doc))) return { kind: 'not-logged-in' };
  if (!isUploadUrl(url)) return { kind: 'not-upload-page', url };
  return { kind: 'ready' };
}
