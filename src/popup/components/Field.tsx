import type { ReactNode } from 'react';
import { IconButton } from './Button';

interface FieldProps {
  id: string;
  label: string;
  children: ReactNode;
  meta?: ReactNode;
  hint?: ReactNode;
  onRegenerate?: () => void;
  regenerating?: boolean;
  regenerateDisabled?: boolean;
}

export function Field({ id, label, children, meta, hint, onRegenerate, regenerating = false, regenerateDisabled = false }: FieldProps) {
  return (
    <div className={`field ${regenerating ? 'is-regenerating' : ''}`} aria-busy={regenerating || undefined}>
      <div className="field__head">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        <div className="field__meta">
          {meta}
          {onRegenerate && (
            <IconButton
              icon="refresh"
              size="sm"
              label={`Regenerate ${label.toLowerCase()}`}
              onClick={onRegenerate}
              disabled={regenerateDisabled}
              spinning={regenerating}
            />
          )}
        </div>
      </div>
      {children}
      {hint && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}
