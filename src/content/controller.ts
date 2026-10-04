// Content-script logic, independent of the chrome.* wiring so it can be tested
// against a mocked Dribbble DOM.
//
// NEVER implement automated publishing. The handled requests below are the
// complete surface of the content script: there is deliberately no
// publish/submit command, and nothing here clicks a button.

import { detailsStillPresent, fillShotDetails, fillTags, locateTagsField } from '../dribbble/form';
import { openTagStep } from '../dribbble/steps';
import { findFirst, sleep, waitFor } from '../dribbble/dom-utils';
import { PUBLISH_BUTTON } from '../dribbble/selectors';
import { detectPageStatus } from '../dribbble/navigation';
import { uploadImage } from '../dribbble/upload';
import { dataUrlToBytes } from '../image/encoding';
import type { ContentEvent, ContentRequest, ContentResponse, FillReport } from '../messaging/messages';
import type { ImagePayload, ShotContent } from '../types';
import { AppError, serializeError } from '../utils/errors';
import { withPublishGuard } from './publish-guard';
import { StatusBanner } from './status-banner';

/** How long to keep watching for Dribbble's tag field after details are filled. */
const TAG_WAIT_MS = 20 * 60 * 1000;
/** Lets the "Final touches" dialog finish animating before typing into it. */
const DIALOG_SETTLE_MS = 300;
/** Pause after filling before checking that Dribbble kept the text. */
const SAVE_SETTLE_MS = 800;
/** How long the final step may be open without a recognisable tag field before giving up. */
const MISSING_TAG_FIELD_MS = 3000;

export interface ControllerDeps {
  doc?: Document;
  getUrl?: () => string;
  emit: (event: ContentEvent) => void;
  version: string;
  banner?: Pick<StatusBanner, 'show' | 'hide'>;
  /** How long to wait for Dribbble to enable "Continue" before leaving it to the designer. */
  continueTimeoutMs?: number;
}

export function createContentController({
  doc = document,
  getUrl = () => location.href,
  emit,
  version,
  banner = new StatusBanner(doc),
  continueTimeoutMs = 60_000,
}: ControllerDeps) {
  let busy = false;
  let tagWatch: AbortController | null = null;

  function stopTagWatch(): void {
    tagWatch?.abort();
    tagWatch = null;
  }

  function assertPageReady(): void {
    const status = detectPageStatus(doc, getUrl());
    if (status.kind === 'security-challenge') throw new AppError('SECURITY_CHALLENGE');
    if (status.kind === 'not-logged-in') throw new AppError('NOT_LOGGED_IN');
    if (status.kind === 'not-upload-page') throw new AppError('DRIBBBLE_UNAVAILABLE', `Unexpected page: ${status.url}`);
  }

  async function exclusive<T>(task: () => Promise<T>): Promise<T> {
    if (busy) throw new AppError('UPLOAD_FAILED', 'Another operation is already running on this page');
    busy = true;
    try {
      return await withPublishGuard(task, doc);
    } finally {
      busy = false;
    }
  }

  async function handleUpload(payload: ImagePayload) {
    stopTagWatch();
    return exclusive(async () => {
      assertPageReady();
      banner.show({ tone: 'working', title: 'Uploading your image…', body: 'Adding your design to the shot editor.' });
      emit({ type: 'UPLOAD_PROGRESS', payload: { progress: 0.3, stage: 'uploading-image' } });
      const { bytes } = dataUrlToBytes(payload.dataUrl);
      const file = new File([bytes], payload.fileName, { type: payload.mimeType });
      const outcome = await uploadImage(file, { root: doc });
      return { warnings: outcome.warnings };
    });
  }

  async function handleFill(content: ShotContent): Promise<FillReport> {
    stopTagWatch();
    return exclusive(async () => {
      assertPageReady();
      banner.show({ tone: 'working', title: 'Filling shot details…', body: 'Adding your title, description and tags.' });
      emit({ type: 'UPLOAD_PROGRESS', payload: { progress: 0.7, stage: 'filling-details' } });

      const result = await fillShotDetails(content, doc);
      let tagsFilled = result.tags?.filled ?? 0;
      let tagsPending = result.tags === null && content.tags.length > 0;

      // Give Dribbble's editor time to save, then make sure the text is still
      // there. If it was dropped, clicking Continue would lose it, so stop and
      // leave Continue to the designer.
      await sleep(SAVE_SETTLE_MS);
      const kept = detailsStillPresent(content, result.fields, doc);
      if (!kept) {
        result.warnings.push(
          "Dribbble didn't keep the title or description automatically. Copy them from the assistant panel, paste them into Dribbble, then click Continue.",
        );
      }

      if (tagsPending && kept) {
        // Dribbble asks for tags in its "Final touches" dialog. "Continue" only
        // opens that dialog; its Publish button is never touched.
        banner.show({
          tone: 'working',
          title: 'Adding tags…',
          body: 'Waiting for Dribbble to finish processing, then clicking "Continue" to add your tags.',
        });
        const field = await openTagStep(doc, { enableTimeoutMs: continueTimeoutMs });
        if (field) {
          await sleep(DIALOG_SETTLE_MS);
          const tags = await fillTags(field.element, content.tags);
          tagsFilled = tags.filled;
          result.warnings.push(...tags.warnings);
          tagsPending = false;
        }
      }

      if (tagsPending) {
        watchForTags(content.tags);
        banner.show({
          tone: 'waiting',
          title: 'Title and description added',
          body: 'Click "Continue" on Dribbble when you\'re ready — your tags will be added in the next step.',
        });
        emit({ type: 'UPLOAD_PROGRESS', payload: { progress: 0.9, stage: 'waiting-for-tags' } });
      } else {
        showReady();
        emit({ type: 'UPLOAD_PROGRESS', payload: { progress: 1, stage: 'ready' } });
      }
      return {
        title: result.title,
        description: result.description,
        tagsFilled,
        tagsPending,
        warnings: result.warnings,
      };
    });
  }

  function showReady(): void {
    banner.show({
      tone: 'success',
      title: 'Your shot is ready for review',
      body: 'Check everything, then publish it yourself when you\'re happy.',
    });
  }

  /** Waits for the designer to open Dribbble's tag step, then fills the tags. */
  function watchForTags(tags: readonly string[]): void {
    const controller = new AbortController();
    tagWatch = controller;
    const { signal } = controller;

    void (async () => {
      try {
        // Resolves with the tag field, or 'missing' if Dribbble's final step
        // (its Publish button) is showing but no tag field can be recognised.
        let finalStepSeenAt = 0;
        const found = await waitFor<ReturnType<typeof locateTagsField> | 'missing'>(
          () => {
            const tagField = locateTagsField(doc);
            if (tagField) return tagField;
            if (!findFirst(PUBLISH_BUTTON, doc)) return (finalStepSeenAt = 0), null;
            finalStepSeenAt ||= Date.now();
            return Date.now() - finalStepSeenAt > MISSING_TAG_FIELD_MS ? 'missing' : null;
          },
          { timeoutMs: TAG_WAIT_MS, signal, root: doc },
        );
        if (!found) {
          banner.hide();
          return;
        }
        if (found === 'missing') throw new AppError('DOM_CHANGED', "Dribbble's final step is open but its tag field wasn't recognised");
        const field = found;
        await sleep(DIALOG_SETTLE_MS, signal);
        const result = await exclusive(() => fillTags(field.element, tags, signal));
        emit({ type: 'TAGS_FILLED', payload: { count: result.filled } });
        showReady();
      } catch (error) {
        if (signal.aborted) return;
        const serialized = serializeError(error, 'DOM_CHANGED');
        emit({ type: 'TAGS_FAILED', payload: { error: serialized } });
        banner.show({ tone: 'error', title: 'Tags need a manual touch', body: 'Please add your tags on Dribbble before publishing.' });
      } finally {
        if (tagWatch === controller) tagWatch = null;
      }
    })();
  }

  async function handle(request: ContentRequest): Promise<ContentResponse<ContentRequest['type']>> {
    switch (request.type) {
      case 'PING':
        return { ok: true, version };
      case 'PROBE_PAGE':
        return detectPageStatus(doc, getUrl());
      case 'UPLOAD_IMAGE':
        try {
          return { ok: true, ...(await handleUpload(request.payload)) };
        } catch (error) {
          return fail(error, 'UPLOAD_FAILED');
        }
      case 'FILL_SHOT_DETAILS':
        try {
          return { ok: true, ...(await handleFill(request.payload)) };
        } catch (error) {
          return fail(error, 'DOM_CHANGED');
        }
    }
  }

  function fail(error: unknown, fallback: Parameters<typeof serializeError>[1]) {
    const serialized = serializeError(error, fallback);
    banner.show({ tone: 'error', title: 'Automation stopped', body: serialized.message });
    return { ok: false as const, error: serialized };
  }

  return { handle, dispose: stopTagWatch };
}

export type ContentController = ReturnType<typeof createContentController>;
