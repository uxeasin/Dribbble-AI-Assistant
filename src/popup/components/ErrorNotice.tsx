import type { SerializedError } from '../../types';
import { Button } from './Button';
import { Notice } from './Notice';

interface ErrorNoticeProps {
  error: SerializedError;
  onDismiss: () => void;
  onOpenSettings: () => void;
  onRetry?: () => void;
}

const SETTINGS_ERRORS = new Set(['AI_NOT_CONFIGURED', 'AI_AUTH']);

export function ErrorNotice({ error, onDismiss, onOpenSettings, onRetry }: ErrorNoticeProps) {
  const needsSettings = SETTINGS_ERRORS.has(error.code);
  const actions = needsSettings ? (
    <Button size="sm" variant="secondary" onClick={onOpenSettings}>
      Open Settings
    </Button>
  ) : onRetry ? (
    <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>
      Try again
    </Button>
  ) : undefined;

  return (
    <Notice tone="error" onDismiss={onDismiss} actions={actions}>
      <span title={error.detail}>{error.message}</span>
    </Notice>
  );
}
