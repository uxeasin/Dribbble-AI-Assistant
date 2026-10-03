// Finding/opening the Dribbble upload tab and talking to the content script in it.

import { isDribbbleUrl, isLoginUrl, isUploadUrl, UPLOAD_URL } from '../dribbble/navigation';
import { sendToContent, type ContentRequest, type ContentResponse } from '../messaging/messages';
import { AppError } from '../utils/errors';

const TAB_LOAD_TIMEOUT_MS = 30_000;
const CONTENT_SCRIPT_FILE = 'content.js';

function waitForTabComplete(tabId: number, signal?: AbortSignal): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      signal?.removeEventListener('abort', onAbort);
      clearTimeout(timer);
    };
    const onUpdated = (id: number, info: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      if (id !== tabId || info.status !== 'complete') return;
      cleanup();
      resolve(tab);
    };
    const onRemoved = (id: number) => {
      if (id !== tabId) return;
      cleanup();
      reject(new AppError('DRIBBBLE_UNAVAILABLE', 'The Dribbble tab was closed'));
    };
    const onAbort = () => {
      cleanup();
      reject(new AppError('CANCELLED'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new AppError('DRIBBBLE_UNAVAILABLE', 'Timed out loading Dribbble'));
    }, TAB_LOAD_TIMEOUT_MS);

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    signal?.addEventListener('abort', onAbort, { once: true });

    // The tab may already have finished loading before the listener was attached.
    // Requiring the target URL avoids mistaking the previous page's "complete" for ours.
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete' && (isUploadUrl(tab.url) || isLoginUrl(tab.url))) {
        cleanup();
        resolve(tab);
      }
    }, onRemoved.bind(null, tabId));
  });
}

/**
 * Opens a fresh upload page. Reuses the active tab only if it is already a
 * Dribbble page (so the popup stays open and the designer sees progress);
 * never navigates away from an unrelated site.
 */
export async function openUploadTab(signal?: AbortSignal): Promise<number> {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  let tab: chrome.tabs.Tab | undefined;
  if (active?.id !== undefined && isDribbbleUrl(active.url) && !isUploadUrl(active.url)) {
    tab = await chrome.tabs.update(active.id, { url: UPLOAD_URL });
  } else {
    // An existing upload tab may contain the designer's unsaved work, so it is never reused.
    tab = await chrome.tabs.create({ url: UPLOAD_URL, active: true });
  }
  if (tab?.id === undefined) throw new AppError('DRIBBBLE_UNAVAILABLE', 'Could not open a tab');

  const loaded = await waitForTabComplete(tab.id, signal);
  if (isLoginUrl(loaded.url)) throw new AppError('NOT_LOGGED_IN');
  if (!isDribbbleUrl(loaded.url)) throw new AppError('DRIBBBLE_UNAVAILABLE', `Unexpected URL ${loaded.url ?? ''}`);
  return tab.id;
}

export async function injectContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_FILE] });
  } catch (error) {
    throw new AppError('DRIBBBLE_UNAVAILABLE', `Injection failed: ${(error as Error).message}`);
  }
}

export async function request<T extends ContentRequest['type']>(
  tabId: number,
  message: Extract<ContentRequest, { type: T }>,
): Promise<ContentResponse<T>> {
  try {
    return await sendToContent(tabId, message);
  } catch (error) {
    // Tab closed, navigated away, or content script not present.
    throw new AppError('DRIBBBLE_UNAVAILABLE', (error as Error).message);
  }
}

export async function focusTab(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
    return true;
  } catch {
    return false;
  }
}
