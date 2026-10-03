import type { ImageMeta } from '../../types';
import { formatBytes } from '../../image/encoding';

export function ImageCard({ image, compact = false }: { image: ImageMeta; compact?: boolean }) {
  const details = `${image.width} × ${image.height} · ${formatBytes(image.size)}`;

  if (compact) {
    return (
      <figure className="card summary" style={{ margin: 0 }}>
        <img src={image.thumbnailDataUrl} alt={`Preview of ${image.name}`} />
        <figcaption style={{ minWidth: 0, alignSelf: 'center' }}>
          <p className="image-meta__name" title={image.name}>
            {image.name}
          </p>
          <p className="image-meta__details">{details}</p>
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className="card" style={{ margin: 0 }}>
      <div className="preview">
        <img src={image.thumbnailDataUrl} alt={`Preview of ${image.name}`} />
      </div>
      <figcaption className="image-meta">
        <span className="image-meta__name" title={image.name}>
          {image.name}
        </span>
        <span className="image-meta__details">{details}</span>
      </figcaption>
    </figure>
  );
}
