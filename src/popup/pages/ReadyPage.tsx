import type { ImageMeta, ShotContent, UploadResult } from '../../types';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Notice } from '../components/Notice';

interface ReadyPageProps {
  image?: ImageMeta;
  content?: ShotContent;
  result: UploadResult;
  onOpenDribbble: () => void;
  onBackToReview: () => void;
  onStartOver: () => void;
}

export function ReadyPage({ image, content, result, onOpenDribbble, onBackToReview, onStartOver }: ReadyPageProps) {
  return (
    <main className="page">
      <div className="success">
        <span className="success__badge" aria-hidden="true">
          <Icon name="check" size={28} strokeWidth={2.4} />
        </span>
        <h2 className="hero__title">Your shot is ready</h2>
        <p className="muted">Everything has been prepared on Dribbble. Review the details before publishing.</p>
      </div>

      {content && (
        <div className="card summary">
          {image && <img src={image.thumbnailDataUrl} alt="" />}
          <div style={{ minWidth: 0 }}>
            <p className="summary__title">{content.title}</p>
            <p className="fineprint">{content.tags.length} tags</p>
          </div>
        </div>
      )}

      {result.tagsPending && (
        <Notice tone="warning" icon="hand">
          Dribbble asks for tags in its next step. Click <strong>Continue</strong> on Dribbble and your tags will be added
          automatically.
        </Notice>
      )}
      {result.warnings.map((warning) => (
        <Notice key={warning} tone="warning">
          {warning}
        </Notice>
      ))}

      <div className="page__footer">
        <span className="manual-badge">
          <Icon name="lock" size={12} /> Publishing is always manual.
        </span>
        <Button block icon="external" onClick={onOpenDribbble}>
          Open Dribbble
        </Button>
        <div className="row">
          <Button variant="ghost" size="sm" onClick={onBackToReview}>
            Edit & re-upload
          </Button>
          <Button variant="ghost" size="sm" onClick={onStartOver}>
            New shot
          </Button>
        </div>
      </div>
    </main>
  );
}
