import type { ImageMeta, ShotContent, ShotField } from '../../types';
import { TITLE_MAX_LENGTH } from '../../ai/schema';
import { DRIBBBLE_MAX_TAGS } from '../../utils/tags';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { ImageCard } from '../components/ImageCard';
import { TagEditor } from '../components/TagEditor';

interface ReviewPageProps {
  image?: ImageMeta;
  draft: ShotContent;
  regenerating?: ShotField;
  onChange: (patch: Partial<ShotContent>) => void;
  onRegenerate: (field: ShotField) => void;
  onUpload: () => void;
}

export function ReviewPage({ image, draft, regenerating, onChange, onRegenerate, onUpload }: ReviewPageProps) {
  const busy = regenerating !== undefined;
  const titleMissing = !draft.title.trim();
  const descriptionMissing = !draft.description.trim();
  const canUpload = !busy && !titleMissing && !descriptionMissing;

  return (
    <main className="page">
      {image && <ImageCard image={image} compact />}

      <Field
        id="shot-title"
        label="Title"
        meta={`${draft.title.length}/${TITLE_MAX_LENGTH}`}
        onRegenerate={() => onRegenerate('title')}
        regenerating={regenerating === 'title'}
        regenerateDisabled={busy}
      >
        <input
          id="shot-title"
          className="input"
          value={draft.title}
          maxLength={TITLE_MAX_LENGTH}
          onChange={(e) => onChange({ title: e.target.value })}
          aria-invalid={titleMissing || undefined}
          disabled={regenerating === 'title'}
        />
      </Field>

      <Field
        id="shot-description"
        label="Description"
        onRegenerate={() => onRegenerate('description')}
        regenerating={regenerating === 'description'}
        regenerateDisabled={busy}
      >
        <textarea
          id="shot-description"
          className="textarea"
          value={draft.description}
          rows={6}
          onChange={(e) => onChange({ description: e.target.value })}
          aria-invalid={descriptionMissing || undefined}
          disabled={regenerating === 'description'}
        />
      </Field>

      <Field
        id="shot-tags"
        label="Tags"
        meta={`${draft.tags.length}/${DRIBBBLE_MAX_TAGS}`}
        hint="Press Enter or comma to add. Backspace removes the last tag."
        onRegenerate={() => onRegenerate('tags')}
        regenerating={regenerating === 'tags'}
        regenerateDisabled={busy}
      >
        <TagEditor
          id="shot-tags"
          tags={draft.tags}
          onChange={(tags) => onChange({ tags })}
          disabled={regenerating === 'tags'}
          describedBy="shot-tags-hint"
        />
      </Field>

      <div className="page__footer page__footer--sticky">
        <Button block icon="upload" onClick={onUpload} disabled={!canUpload}>
          Upload to Dribbble
        </Button>
        <p className="fineprint fineprint--center">
          We'll fill in Dribbble's upload form and stop. Publishing is always manual.
        </p>
      </div>
    </main>
  );
}
