import type { ImageMeta, ProgressStep } from '../../types';
import { Button } from '../components/Button';
import { ImageCard } from '../components/ImageCard';
import { ProgressSteps } from '../components/ProgressSteps';

interface ProgressPageProps {
  title: string;
  subtitle: string;
  steps: ProgressStep[];
  image?: ImageMeta;
  onCancel: () => void;
  footnote?: string;
}

/** Shared layout for the "Preparing" and "Uploading" states. */
export function ProgressPage({ title, subtitle, steps, image, onCancel, footnote }: ProgressPageProps) {
  return (
    <main className="page">
      {image && <ImageCard image={image} compact />}
      <section className="card progress-card" aria-labelledby="progress-title">
        <div className="hero">
          <h2 id="progress-title" style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>
            {title}
          </h2>
          <p className="muted">{subtitle}</p>
        </div>
        <ProgressSteps steps={steps} label={title} />
      </section>
      <div className="page__footer">
        {footnote && <p className="fineprint fineprint--center">{footnote}</p>}
        <Button block variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </main>
  );
}
