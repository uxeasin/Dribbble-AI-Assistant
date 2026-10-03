// Injected on demand (chrome.scripting) into the Dribbble upload tab only, after
// the designer clicks "Upload to Dribbble". It is not registered on any page
// statically, so the extension never observes browsing.

import type { ContentEvent, ContentRequest } from '../messaging/messages';
import { createContentController } from './controller';

declare global {
  interface Window {
    __dribbbleAIAssistantLoaded?: boolean;
  }
}

const KNOWN_REQUESTS: ReadonlySet<string> = new Set(['PING', 'PROBE_PAGE', 'UPLOAD_IMAGE', 'FILL_SHOT_DETAILS']);

function isContentRequest(message: unknown): message is ContentRequest {
  return typeof message === 'object' && message !== null && KNOWN_REQUESTS.has((message as { type?: unknown }).type as string);
}

// Re-injection into the same document must not register duplicate listeners.
if (!window.__dribbbleAIAssistantLoaded) {
  window.__dribbbleAIAssistantLoaded = true;

  const controller = createContentController({
    version: chrome.runtime.getManifest().version,
    emit: (event: ContentEvent) => {
      chrome.runtime.sendMessage(event).catch(() => {
        // The service worker may be restarting; events are best-effort status updates.
      });
    },
  });

  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !isContentRequest(message)) return false;
    controller.handle(message).then(sendResponse);
    return true; // keep the channel open for the async response
  });

  window.addEventListener('pagehide', () => controller.dispose());
}
