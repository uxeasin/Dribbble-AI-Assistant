import { useRef, useState, type DragEvent } from 'react';
import { ACCEPT_ATTRIBUTE } from '../../image/validation';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';

interface IdlePageProps {
  onFile: (file: File) => void;
  busy: boolean;
}

export function IdlePage({ onFile, busy }: IdlePageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <main className="page">
      <div className="hero">
        <h2 className="hero__title">Turn your design into a Dribbble-ready shot.</h2>
      </div>

      <div
        className={`dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span className="dropzone__icon" aria-hidden="true">
          <Icon name="image" size={24} />
        </span>
        <div>
          <p style={{ fontWeight: 600 }}>Drop your design here</p>
          <p className="fineprint">PNG, JPG or WebP · up to 10 MB</p>
        </div>
        <Button icon="image" onClick={() => inputRef.current?.click()} loading={busy}>
          Select Design
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
      </div>

      <ul className="feature-list">
        <li>
          <Icon name="sparkles" size={14} />
          AI will prepare your title, description and tags.
        </li>
        <li>
          <Icon name="hand" size={14} />
          You'll review everything and publish yourself.
        </li>
      </ul>
    </main>
  );
}
