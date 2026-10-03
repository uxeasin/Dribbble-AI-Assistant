// The workflow state machine: idle → selected → preparing → review → uploading → ready.
//
// NEVER implement automated publishing. The workflow ends at "ready": the shot
// is prepared on Dribbble and the designer reviews and publishes it manually.

import { generateShot, regenerateField, type GenerationStep } from '../ai/content-generator';
import { createProvider } from '../ai/providers';
import { blobToDataUrl, dataUrlToBlob } from '../image/encoding';
import { createThumbnail, readDimensions } from '../image/processing';
import { validateImage, SIGNATURE_BYTES } from '../image/validation';
import type { ContentEvent, PopupCommand } from '../messaging/messages';
import { getApiKey, getSettings } from '../storage/settings';
import type { GenerationOptions, ImagePayload, ShotContent } from '../types';
import { AppError, serializeError } from '../utils/errors';
import { normalizeTags } from '../utils/tags';
import { focusTab, injectContentScript, openUploadTab, request } from './dribbble-tab';
import { clearImage, getImage, putImage } from './image-store';
import { INITIAL_STATE, createSteps, failActiveStep, setStep, type StateStore } from './state-store';

// Generation is a single AI request (one call per shot keeps free-tier quotas usable).
const PREPARE_STEPS = createSteps([
  { id: 'prepare', label: 'Optimizing image', doneLabel: 'Image optimized' },
  { id: 'generate', label: 'Analyzing design & writing content', doneLabel: 'Title, description & tags ready' },
]);

const UPLOAD_STEPS = createSteps([
  { id: 'content', label: 'Preparing content', doneLabel: 'Content prepared' },
  { id: 'open', label: 'Opening Dribbble', doneLabel: 'Dribbble opened' },
  { id: 'image', label: 'Uploading image', doneLabel: 'Image uploaded' },
  { id: 'details', label: 'Filling shot details', doneLabel: 'Shot details filled' },
  { id: 'review', label: 'Ready for review', doneLabel: 'Ready for review' },
]);

function sanitizeContent(content: ShotContent): ShotContent {
  return {
    title: content.title.trim(),
    description: content.description.trim(),
    tags: normalizeTags(content.tags),
  };
}

export class Workflow {
  private job: AbortController | null = null;

  constructor(private readonly store: StateStore) {}

  /** Recovers from a service-worker restart that interrupted a running step. */
  async init(): Promise<void> {
    const state = await this.store.load();
    const image = state.image ? await getImage() : null;
    if (state.stage === 'preparing') {
      this.store.update({ stage: image ? 'selected' : 'idle', steps: [], error: serializeError(new AppError('INTERRUPTED')) });
    } else if (state.stage === 'uploading') {
      this.store.update({ stage: 'review', steps: [], error: serializeError(new AppError('INTERRUPTED')) });
    }
    if (state.regenerating) this.store.update({ regenerating: undefined });
  }

  async dispatch(command: PopupCommand): Promise<void> {
    const { stage } = this.store.get();
    switch (command.type) {
      case 'SELECT_IMAGE':
        if (stage === 'preparing' || stage === 'uploading') return;
        return this.run(() => this.selectImage(command.payload));
      case 'CLEAR_IMAGE':
      case 'RESET':
        this.cancelJob();
        await clearImage();
        this.store.set({ ...INITIAL_STATE, contentRevision: this.store.get().contentRevision });
        return;
      case 'PREPARE_SHOT':
        if (stage !== 'selected' && stage !== 'review') return;
        return this.run((signal) => this.prepare(signal));
      case 'UPDATE_CONTENT':
        if (stage === 'review') this.store.update({ content: sanitizeContent(command.payload) });
        return;
      case 'REGENERATE':
        if (stage !== 'review' || this.store.get().regenerating) return;
        return this.run((signal) => this.regenerate(command.payload.field, sanitizeContent(command.payload.current), signal));
      case 'START_UPLOAD':
        if (stage !== 'review' || this.store.get().regenerating) return;
        return this.run((signal) => this.upload(sanitizeContent(command.payload), signal));
      case 'OPEN_DRIBBBLE': {
        const tabId = this.store.get().result?.tabId;
        if (tabId === undefined || !(await focusTab(tabId))) {
          this.store.update({ error: serializeError(new AppError('DRIBBBLE_UNAVAILABLE', 'The Dribbble tab is no longer open')) });
        }
        return;
      }
      case 'BACK_TO_REVIEW':
        if (stage === 'ready') this.store.update({ stage: 'review', steps: [], result: undefined, error: undefined });
        return;
      case 'DISMISS_ERROR':
        this.store.update({ error: undefined });
        return;
      case 'CANCEL':
        this.cancelJob();
        return;
    }
  }

  handleContentEvent(event: ContentEvent): void {
    const state = this.store.get();
    switch (event.type) {
      case 'UPLOAD_PROGRESS': {
        if (state.stage !== 'uploading') return;
        const stepId = { 'uploading-image': 'image', 'filling-details': 'details', 'waiting-for-tags': 'details', ready: 'review' }[
          event.payload.stage
        ];
        this.store.update({ steps: setStep(state.steps, stepId, 'active') });
        return;
      }
      case 'TAGS_FILLED':
        if (state.result) this.store.update({ result: { ...state.result, tagsPending: false } });
        return;
      case 'TAGS_FAILED':
        if (state.result) {
          this.store.update({
            result: {
              ...state.result,
              tagsPending: false,
              warnings: [...state.result.warnings, 'Tags could not be added automatically. Please add them on Dribbble.'],
            },
          });
        }
        return;
    }
  }

  private cancelJob(): void {
    this.job?.abort(new AppError('CANCELLED'));
    this.job = null;
  }

  /** Runs one job at a time and turns any failure into a visible error, never a silent one. */
  private async run(task: (signal: AbortSignal) => Promise<void>): Promise<void> {
    this.cancelJob();
    const job = new AbortController();
    this.job = job;
    this.store.update({ error: undefined });
    try {
      await task(job.signal);
    } catch (error) {
      // A newer command replaced this job; its own state updates take precedence.
      if (this.job !== null && this.job !== job) return;
      this.handleFailure(error);
    } finally {
      if (this.job === job) this.job = null;
    }
  }

  private handleFailure(error: unknown): void {
    const serialized = serializeError(error);
    const { stage, steps, content } = this.store.get();
    if (serialized.code === 'CANCELLED') {
      if (stage === 'preparing') this.store.update({ stage: content ? 'review' : 'selected', steps: [] });
      if (stage === 'uploading') this.store.update({ stage: 'review', steps: [] });
      this.store.update({ regenerating: undefined });
      return;
    }
    this.store.update({ steps: failActiveStep(steps), error: serialized, regenerating: undefined });
    if (stage === 'preparing') this.store.update({ stage: content ? 'review' : 'selected' });
    if (stage === 'uploading') this.store.update({ stage: 'review' });
  }

  private async selectImage(image: ImagePayload): Promise<void> {
    const blob = dataUrlToBlob(image.dataUrl);
    const header = new Uint8Array(await blob.slice(0, SIGNATURE_BYTES).arrayBuffer());
    // Re-validated here: the popup's checks are a convenience, not a trust boundary.
    const mimeType = validateImage({ name: image.fileName, size: blob.size, type: image.mimeType }, header);
    const typedBlob = new Blob([blob], { type: mimeType });

    let dimensions: { width: number; height: number };
    let thumbnail: Blob;
    try {
      dimensions = await readDimensions(typedBlob);
      thumbnail = await createThumbnail(typedBlob);
    } catch (error) {
      throw new AppError('INVALID_IMAGE', `Could not decode image: ${(error as Error).message}`);
    }

    await putImage({ dataUrl: image.dataUrl, fileName: image.fileName, mimeType });
    this.store.set({
      ...INITIAL_STATE,
      contentRevision: this.store.get().contentRevision,
      stage: 'selected',
      image: {
        name: image.fileName,
        mimeType,
        size: blob.size,
        ...dimensions,
        thumbnailDataUrl: await blobToDataUrl(thumbnail),
      },
    });
  }

  private async generationContext(): Promise<{ provider: ReturnType<typeof createProvider>; options: GenerationOptions }> {
    const settings = await getSettings();
    const provider = createProvider(settings, await getApiKey(settings.aiProvider));
    return {
      provider,
      options: { tone: settings.tone, tagCount: settings.tagCount, defaultTags: settings.defaultTags },
    };
  }

  private async requireImage(): Promise<Blob> {
    const image = await getImage();
    if (!image) throw new AppError('IMAGE_MISSING');
    return dataUrlToBlob(image.dataUrl);
  }

  private async prepare(signal: AbortSignal): Promise<void> {
    const image = await this.requireImage();
    const { provider, options } = await this.generationContext();
    this.store.update({ stage: 'preparing', steps: PREPARE_STEPS });

    const mark = (step: GenerationStep, status: 'active' | 'done') =>
      this.store.update((s) => ({ steps: setStep(s.steps, step, status) }));

    const { analysis, content } = await generateShot(provider, image, options, {
      signal,
      onStepStart: (step) => mark(step, 'active'),
      onStepDone: (step) => mark(step, 'done'),
    });
    signal.throwIfAborted();

    this.store.update((s) => ({
      stage: 'review',
      steps: [],
      analysis,
      content,
      contentRevision: s.contentRevision + 1,
    }));
  }

  private async regenerate(field: keyof ShotContent, current: ShotContent, signal: AbortSignal): Promise<void> {
    const { analysis } = this.store.get();
    if (!analysis) throw new AppError('AI_FAILED', 'No analysis available; prepare the shot again');
    const { provider, options } = await this.generationContext();
    this.store.update({ regenerating: field, content: current });

    const value = await regenerateField(provider, field, analysis, current, options, signal);
    signal.throwIfAborted();
    // Merge into the latest content so edits made meanwhile to other fields survive.
    this.store.update((s) => ({
      regenerating: undefined,
      content: { ...(s.content ?? current), [field]: value },
      contentRevision: s.contentRevision + 1,
    }));
  }

  private async upload(content: ShotContent, signal: AbortSignal): Promise<void> {
    if (!content.title || !content.description) throw new AppError('UPLOAD_FAILED', 'Title and description are required');
    const image = await getImage();
    if (!image) throw new AppError('IMAGE_MISSING');

    const step = (id: string, status: 'active' | 'done') => this.store.update((s) => ({ steps: setStep(s.steps, id, status) }));
    this.store.update({ stage: 'uploading', content, steps: setStep(UPLOAD_STEPS, 'content', 'done'), result: undefined });

    step('open', 'active');
    const tabId = await openUploadTab(signal);
    await injectContentScript(tabId);
    signal.throwIfAborted();

    const status = await request(tabId, { type: 'PROBE_PAGE' });
    if (status.kind === 'not-logged-in') throw new AppError('NOT_LOGGED_IN');
    if (status.kind === 'security-challenge') throw new AppError('SECURITY_CHALLENGE');
    if (status.kind === 'not-upload-page') throw new AppError('DRIBBBLE_UNAVAILABLE', `Landed on ${status.url}`);

    step('image', 'active');
    const uploaded = await request(tabId, { type: 'UPLOAD_IMAGE', payload: image });
    if (!uploaded.ok) throw new AppError(uploaded.error.code, uploaded.error.detail);
    signal.throwIfAborted();

    step('details', 'active');
    const filled = await request(tabId, { type: 'FILL_SHOT_DETAILS', payload: content });
    if (!filled.ok) throw new AppError(filled.error.code, filled.error.detail);

    // Automation stops here. Publishing is always the designer's decision.
    this.store.update((s) => ({
      stage: 'ready',
      steps: setStep(s.steps, 'review', 'done'),
      result: { tabId, tagsPending: filled.tagsPending, warnings: [...uploaded.warnings, ...filled.warnings] },
    }));
  }
}
