import { useRef, useState } from 'react';
import type { OwnedSkin } from '../types';
import { useLanguage } from '../context/useLanguage';
import { localizedName } from '../context/languageNames';
import { staggerStyle, trackPointer } from '../utils/spotlight';
import SkinVideoModal from './SkinVideoModal';

function tierColor(skin: OwnedSkin): string {
  return skin.content_tier_color ? `#${skin.content_tier_color.slice(0, 6)}` : 'var(--color-text-secondary)';
}

export default function SkinCollectionCard({ skin, index, subtitle }: { skin: OwnedSkin; index: number; subtitle?: string }) {
  const { localizedNames } = useLanguage();
  const color = tierColor(skin);
  const name = localizedName(skin.uuid, skin.name, localizedNames);
  const hasVideo = skin.levels.some((level) => level.video_url);
  const imageRef = useRef<HTMLDivElement>(null);
  const [videoOrigin, setVideoOrigin] = useState<DOMRect | null>(null);

  return (
    <div
      className="card-motion card-spotlight group relative overflow-hidden rounded-lg border border-border bg-bg-card"
      onPointerMove={trackPointer}
      style={{ ...staggerStyle(index), '--glow-color': color } as React.CSSProperties}
    >
      <div className="h-0.5" style={{ backgroundColor: color }} />
      <div
        ref={imageRef}
        onClick={() => hasVideo && imageRef.current && setVideoOrigin(imageRef.current.getBoundingClientRect())}
        role={hasVideo ? 'button' : undefined}
        aria-label={hasVideo ? `Play ${name} demo video` : undefined}
        className="relative flex aspect-video items-center justify-center p-4"
        style={{ cursor: hasVideo ? 'pointer' : 'default' }}
      >
        {skin.display_icon ? (
          <img src={skin.display_icon} alt={name} loading="lazy" className="h-full w-full object-contain drop-shadow-lg transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-translate-y-0.5 group-hover:scale-105" />
        ) : (
          <span className="text-sm text-text-secondary">No image</span>
        )}
        {hasVideo && (
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            style={{ boxShadow: 'inset 0 0 0 2px var(--glow-color), inset 0 0 18px -6px var(--glow-color)' }}
          />
        )}
      </div>
      <div className="border-t border-border p-3">
        <h3
          className="truncate text-sm text-text-primary"
          style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600 }}
        >
          {name}
        </h3>
        <span
          className="mt-1 inline-block rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ backgroundColor: color }}
        >
          {skin.content_tier_name}
        </span>
        {subtitle && <span className="ml-2 text-[11px] text-text-secondary">{subtitle}</span>}
      </div>
      {videoOrigin && hasVideo && (
        <SkinVideoModal
          levels={skin.levels}
          fallbackIcon={skin.display_icon}
          name={name}
          originRect={videoOrigin}
          onClose={() => setVideoOrigin(null)}
        />
      )}
    </div>
  );
}
