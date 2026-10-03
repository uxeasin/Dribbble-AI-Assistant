import type { SerializedError } from '../../types';
import { Button } from './Button';
import { Notice } from './Notice';

interface ErrorNoticeProps {
  error: SerializedError;
  onDismiss: () => void;
  onOpenSettings: () => void;
  onRetry?: () => void;
}

const SETTINGS_ERRORS = new Set(['AI_NOT_CONFIGURED', 'AI_AUTH', 'AI_MODEL_UNAVAILABLE']);

export function ErrorNotice({ error, onDismiss, onOpenSettings, onRetry }: ErrorNoticeProps) {
  const needsSettings = SETTINGS_ERRORS.has(error.code);
  const actions = (
    <>
      {needsSettings && (
        <Button size="sm" variant="secondary" onClick={onOpenSettings}>
          Open Settings
        </Button>
      )}
      {!needsSettings && onRetry && (
        <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      )}
    </>
  );

  return (
    <Notice tone="error" onDismiss={onDismiss} actions={needsSettings || onRetry ? actions : undefined}>
      <span>{error.message}</span>
      {error.detail && (
        <details className="error-details">
          <summary>Details</summary>
          <code>{error.detail}</code>
        </details>
      )}
    </Notice>
  );
}
