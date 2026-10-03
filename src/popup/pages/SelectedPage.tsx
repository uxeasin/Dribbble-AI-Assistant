import { useRef } from 'react';
import { ACCEPT_ATTRIBUTE } from '../../image/validation';
import type { ImageMeta } from '../../types';
import { Button } from '../components/Button';
import { ImageCard } from '../components/ImageCard';
import { Notice } from '../components/Notice';

interface SelectedPageProps {
  image: ImageMeta;
  keyConfigured: boolean | null;
  providerLabel: string;
  onPrepare: () => void;
  onChangeImage: (file: File) => void;
  onOpenSettings: () => void;
}

export function SelectedPage({ image, keyConfigured, providerLabel, onPrepare, onChangeImage, onOpenSettings }: SelectedPageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <main className="page">
      <ImageCard image={image} />

      {keyConfigured === false ? (
        <Notice
          tone="warning"
          actions={
            <Button size="sm" variant="secondary" onClick={onOpenSettings}>
              Add API key
            </Button>
          }
        >
          Connect an AI provider to generate your shot content.
        </Notice>
      ) : (
        <p className="fineprint">
          A resized copy of this image is sent to {providerLabel} to write your content. Nothing is uploaded to Dribbble until you
          choose to.
        </p>
      )}

      <div className="page__footer">
        <Button block icon="sparkles" onClick={onPrepare} disabled={keyConfigured === false}>
          Prepare Shot
        </Button>
        <Button block variant="ghost" onClick={() => inputRef.current?.click()}>
          Change Image
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
            if (file) onChangeImage(file);
            e.target.value = '';
          }}
        />
      </div>
    </main>
  );
}
