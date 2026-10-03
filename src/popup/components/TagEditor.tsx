import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { DRIBBBLE_MAX_TAGS, normalizeTags, parseTagInput } from '../../utils/tags';
import { Icon } from './Icon';

interface TagEditorProps {
  id: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  describedBy?: string;
}

export function TagEditor({ id, tags, onChange, max = DRIBBBLE_MAX_TAGS, placeholder = 'Add a tag…', disabled = false, describedBy }: TagEditorProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const full = tags.length >= max;

  const commit = (raw: string) => {
    const next = normalizeTags([...tags, ...parseTagInput(raw)], max);
    if (next.length !== tags.length) onChange(next);
    setDraft('');
  };

  const remove = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === 'Enter' || event.key === ',' || event.key === 'Tab') && draft.trim()) {
      event.preventDefault();
      commit(draft);
    } else if (event.key === 'Backspace' && !draft && tags.length) {
      event.preventDefault();
      onChange(tags.slice(0, -1));
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    if (/[,\n]/.test(text)) {
      event.preventDefault();
      commit(text);
    }
  };

  return (
    <div className="tags" onClick={() => inputRef.current?.focus()}>
      <ul className="sr-only" aria-live="polite" aria-label="Selected tags">
        {tags.map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
      </ul>
      {tags.map((tag) => (
        <span key={tag} className="tag">
          {tag}
          <button
            type="button"
            className="tag__remove"
            aria-label={`Remove tag ${tag}`}
            onClick={(e) => {
              e.stopPropagation();
              remove(tag);
            }}
            disabled={disabled}
          >
            <Icon name="close" size={11} strokeWidth={2.4} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        className="tags__input"
        value={draft}
        placeholder={full ? `Maximum ${max} tags` : placeholder}
        disabled={disabled || full}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => draft.trim() && commit(draft)}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
