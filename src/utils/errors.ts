import type { ErrorCode, SerializedError } from '../types';

export const USER_MESSAGES: Record<ErrorCode, string> = {
  AI_FAILED: "Couldn't generate content. Please try again.",
  AI_NOT_CONFIGURED: 'Add your AI API key in Settings to generate content.',
  AI_AUTH: 'Your AI provider rejected the API key. Check it in Settings.',
  AI_MODEL_UNAVAILABLE: "The selected AI model isn't available for your API key. Choose another model in Settings.",
  AI_RATE_LIMITED: "Your AI provider's rate limit or quota was reached. Wait a minute and try again, or check your plan.",
  INVALID_IMAGE: 'Please select a PNG, JPG or WebP image.',
  IMAGE_TOO_LARGE: 'This image is too large. Dribbble accepts images up to 10 MB.',
  IMAGE_MISSING: 'The selected image is no longer available. Please select it again.',
  DRIBBBLE_UNAVAILABLE: "Dribbble couldn't be reached. Make sure you're logged in and try again.",
  NOT_LOGGED_IN: 'Please log in to Dribbble in this browser, then try again.',
  SECURITY_CHALLENGE:
    'Dribbble is showing a security check. Please complete it in the Dribbble tab, then try again.',
  UPLOAD_FAILED: 'Image upload failed. Please retry.',
  DOM_CHANGED: "Dribbble's upload interface appears to have changed. Please complete the upload manually.",
  INTERRUPTED: 'The previous step was interrupted. Please try again.',
  CANCELLED: 'Cancelled.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly detail?: string;
  /** Transient failure (timeout, rate limit, malformed output) worth one automatic retry. */
  readonly retryable: boolean;

  constructor(code: ErrorCode, detail?: string, options: { retryable?: boolean } = {}) {
    super(USER_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
    this.retryable = options.retryable ?? false;
  }

  toJSON(): SerializedError {
    return { code: this.code, message: this.message, ...(this.detail ? { detail: this.detail } : {}) };
  }
}

export function toAppError(error: unknown, fallback: ErrorCode = 'UNKNOWN'): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') return new AppError('CANCELLED');
  const detail = error instanceof Error ? error.message : String(error);
  return new AppError(fallback, detail);
}

export function serializeError(error: unknown, fallback: ErrorCode = 'UNKNOWN'): SerializedError {
  return toAppError(error, fallback).toJSON();
}

export function isSerializedError(value: unknown): value is SerializedError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SerializedError).code === 'string' &&
    typeof (value as SerializedError).message === 'string'
  );
}
