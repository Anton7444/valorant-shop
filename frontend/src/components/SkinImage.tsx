import { useState } from 'react';

// Some skins' main icon is a square grey "X" placeholder instead of the weapon.
// Real weapon art is wide, so a near-square (or failed) image moves on to the
// next picture of the same skin; if every picture is square the last one stays.
const MIN_ASPECT = 1.15;

function SkinImageInner({
  src,
  alts = [],
  alt,
  className,
  loading,
}: {
  src: string;
  alts?: string[];
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}) {
  const candidates = [src, ...alts];
  const [index, setIndex] = useState(0);
  const last = candidates.length - 1;

  return (
    <img
      src={candidates[Math.min(index, last)]}
      alt={alt}
      loading={loading}
      className={className}
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        if (index < last && naturalHeight > 0 && naturalWidth / naturalHeight < MIN_ASPECT) {
          setIndex(index + 1);
        }
      }}
      onError={() => {
        if (index < last) setIndex(index + 1);
      }}
    />
  );
}

// Start over whenever the main picture changes (e.g. a card re-used after filtering).
export default function SkinImage(props: Parameters<typeof SkinImageInner>[0]) {
  return <SkinImageInner key={props.src} {...props} />;
}
