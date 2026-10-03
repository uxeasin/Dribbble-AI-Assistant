// Strongly typed message contracts between extension contexts.
//
//   Popup ──(Port "workflow")──▶ Background service worker ──(tabs.sendMessage)──▶ Content script
//     ▲                                │      ▲                                        │
//     └──────── STATE_UPDATED ─────────┘      └──────── UPLOAD_PROGRESS / TAGS_FILLED ─┘
//
// NEVER add a message that publishes, submits or confirms a shot. The content
// script surface below intentionally has no such command.

import type {
  ImagePayload,
  SerializedError,
  ShotContent,
  ShotField,
  WorkflowState,
} from '../types';

export const WORKFLOW_PORT = 'workflow';

// ── Popup → Background ──────────────────────────────────────────────────────

export type PopupCommand =
  | { type: 'SELECT_IMAGE'; payload: ImagePayload }
  | { type: 'CLEAR_IMAGE' }
  | { type: 'PREPARE_SHOT' }
  | { type: 'UPDATE_CONTENT'; payload: ShotContent }
  | { type: 'REGENERATE'; payload: { field: ShotField; current: ShotContent } }
  | { type: 'START_UPLOAD'; payload: ShotContent }
  | { type: 'OPEN_DRIBBBLE' }
  | { type: 'BACK_TO_REVIEW' }
  | { type: 'DISMISS_ERROR' }
  | { type: 'CANCEL' }
  | { type: 'RESET' };

// ── Background → Popup ──────────────────────────────────────────────────────

export type BackgroundEvent = { type: 'STATE_UPDATED'; payload: WorkflowState };

// ── Background → Content script (request/response) ─────────────────────────

export type PageStatus =
  | { kind: 'ready' }
  | { kind: 'not-logged-in' }
  | { kind: 'security-challenge' }
  | { kind: 'not-upload-page'; url: string };

export interface FillReport {
  title: boolean;
  description: boolean;
  /** Number of tags confirmed in the tag field (0 if pending). */
  tagsFilled: number;
  tagsPending: boolean;
  warnings: string[];
}

export interface ContentRequestMap {
  PING: { request: { type: 'PING' }; response: { ok: true; version: string } };
  PROBE_PAGE: { request: { type: 'PROBE_PAGE' }; response: PageStatus };
  UPLOAD_IMAGE: {
    request: { type: 'UPLOAD_IMAGE'; payload: ImagePayload };
    response: ContentResult<{ warnings: string[] }>;
  };
  FILL_SHOT_DETAILS: {
    request: { type: 'FILL_SHOT_DETAILS'; payload: ShotContent };
    response: ContentResult<FillReport>;
  };
}

export type ContentRequest = ContentRequestMap[keyof ContentRequestMap]['request'];
export type ContentResponse<T extends ContentRequest['type']> = ContentRequestMap[T]['response'];

export type ContentResult<T> = ({ ok: true } & T) | { ok: false; error: SerializedError };

// ── Content script → Background (fire-and-forget) ───────────────────────────

export type ContentEvent =
  | { type: 'UPLOAD_PROGRESS'; payload: { progress: number; stage: UploadStage } }
  | { type: 'TAGS_FILLED'; payload: { count: number } }
  | { type: 'TAGS_FAILED'; payload: { error: SerializedError } };

export type UploadStage = 'uploading-image' | 'filling-details' | 'waiting-for-tags' | 'ready';

const CONTENT_EVENT_TYPES: ReadonlySet<string> = new Set(['UPLOAD_PROGRESS', 'TAGS_FILLED', 'TAGS_FAILED']);

export function isContentEvent(message: unknown): message is ContentEvent {
  return (
    typeof message === 'object' &&
    message !== null &&
    CONTENT_EVENT_TYPES.has((message as { type?: unknown }).type as string)
  );
}

/** Typed wrapper around chrome.tabs.sendMessage for content-script requests. */
export function sendToContent<T extends ContentRequest['type']>(
  tabId: number,
  request: Extract<ContentRequest, { type: T }>,
): Promise<ContentResponse<T>> {
  return chrome.tabs.sendMessage(tabId, request) as Promise<ContentResponse<T>>;
}
