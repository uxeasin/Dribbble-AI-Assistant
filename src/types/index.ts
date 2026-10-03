// Shared domain types used across popup, background and content script.

export interface DesignAnalysis {
  designType: string;
  visualStyle: string;
  subject: string;
  colors: string[];
  keywords: string[];
  /** Optional richer signals; providers fill what they can infer. */
  industry?: string;
  typography?: string;
  uxPatterns?: string[];
}

export interface ShotContent {
  title: string;
  description: string;
  tags: string[];
}

export type ShotField = keyof ShotContent;

export type Tone = 'professional' | 'minimal' | 'creative';

export const TAG_COUNT_OPTIONS = [5, 8, 10, 12] as const;
export type TagCount = (typeof TAG_COUNT_OPTIONS)[number];

export interface UserSettings {
  aiProvider: string;
  model?: string;
  /** OpenAI-compatible base URL. */
  baseUrl?: string;
  defaultTags?: string[];
  tone?: Tone;
  tagCount?: TagCount;
}

export interface GenerationOptions {
  tone: Tone;
  tagCount: TagCount;
  defaultTags: string[];
}

export type SupportedMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ImageMeta {
  name: string;
  mimeType: SupportedMimeType;
  size: number;
  width: number;
  height: number;
  /** Small preview (data URL) for the popup. The full image is never put in UI state. */
  thumbnailDataUrl: string;
}

/** Image bytes as they travel between extension contexts (structured-clone safe). */
export interface ImagePayload {
  dataUrl: string;
  fileName: string;
  mimeType: SupportedMimeType;
}

export type StepStatus = 'pending' | 'active' | 'done' | 'error';

export interface ProgressStep {
  id: string;
  /** Shown while pending/active, e.g. "Creating description". */
  label: string;
  /** Shown once complete, e.g. "Description created". */
  doneLabel: string;
  status: StepStatus;
}

export type WorkflowStage = 'idle' | 'selected' | 'preparing' | 'review' | 'uploading' | 'ready';

export interface UploadResult {
  tabId: number;
  /** True when Dribbble only shows the tag field in a later step the designer opens. */
  tagsPending: boolean;
  warnings: string[];
}

export interface WorkflowState {
  stage: WorkflowStage;
  image?: ImageMeta;
  steps: ProgressStep[];
  analysis?: DesignAnalysis;
  content?: ShotContent;
  /** Incremented whenever the AI replaces content, so the popup knows to refresh its editable draft. */
  contentRevision: number;
  regenerating?: ShotField;
  result?: UploadResult;
  error?: SerializedError;
}

export type ErrorCode =
  | 'AI_FAILED'
  | 'AI_NOT_CONFIGURED'
  | 'AI_AUTH'
  | 'AI_MODEL_UNAVAILABLE'
  | 'AI_RATE_LIMITED'
  | 'INVALID_IMAGE'
  | 'IMAGE_TOO_LARGE'
  | 'IMAGE_MISSING'
  | 'DRIBBBLE_UNAVAILABLE'
  | 'NOT_LOGGED_IN'
  | 'SECURITY_CHALLENGE'
  | 'UPLOAD_FAILED'
  | 'DOM_CHANGED'
  | 'INTERRUPTED'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface SerializedError {
  code: ErrorCode;
  message: string;
  detail?: string;
}
