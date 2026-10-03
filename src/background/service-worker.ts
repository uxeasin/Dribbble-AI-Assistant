// Background service worker: owns the workflow and brokers messages between
// the popup and the content script.

import { isContentEvent, WORKFLOW_PORT, type BackgroundEvent, type PopupCommand } from '../messaging/messages';
import { isDribbbleUrl } from '../dribbble/navigation';
import { StateStore } from './state-store';
import { Workflow } from './workflow';

const store = new StateStore();
const workflow = new Workflow(store);
// Every listener awaits this so no command runs against unloaded state after a restart.
const ready = workflow.init().catch((error: unknown) => console.error('Workflow init failed', error));

const ports = new Set<chrome.runtime.Port>();

store.subscribe((state) => {
  const event: BackgroundEvent = { type: 'STATE_UPDATED', payload: state };
  for (const port of ports) port.postMessage(event);
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== WORKFLOW_PORT || port.sender?.id !== chrome.runtime.id) return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener((command: PopupCommand) => {
    void ready.then(() => workflow.dispatch(command));
  });
  void ready.then(() => port.postMessage({ type: 'STATE_UPDATED', payload: store.get() } satisfies BackgroundEvent));
});

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  // Only accept status events from our own content script running on Dribbble.
  if (sender.id !== chrome.runtime.id || !sender.tab || !isDribbbleUrl(sender.tab.url)) return false;
  if (sender.tab.id !== store.get().result?.tabId && store.get().stage !== 'uploading') return false;
  if (isContentEvent(message)) void ready.then(() => workflow.handleContentEvent(message));
  return false;
});
