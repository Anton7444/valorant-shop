import { useState } from 'react';
import type { SkinOffer } from '../types';
import { useLanguage } from '../context/useLanguage';
import { localizedName } from '../context/languageNames';

const TIER_COLOR_MAP: Record<string, string> = {
  select: 'var(--color-tier-select)',
  deluxe: 'var(--color-tier-deluxe)',
  premium: 'var(--color-tier-premium)',
  ultra: 'var(--color-tier-ultra)',
  exclusive: 'var(--color-tier-exclusive)',
};

function getTierColor(tierName: string, apiColor: string): string {
  const key = tierName.toLowerCase().replace(/\s*edition$/i, '');
  return TIER_COLOR_MAP[key] || (apiColor ? `#${apiColor.slice(0, 6)}` : 'var(--color-text-secondary)');
}

interface SkinCardProps {
  skin: SkinOffer;
}

export default function SkinCard({ skin }: SkinCardProps) {
  const { localizedNames } = useLanguage();
  const name = localizedName(skin.uuid, skin.name, localizedNames);
  const tierColor = getTierColor(skin.content_tier_name, skin.content_tier_color);

  const [revealed, setRevealed] = useState(false);
  const [bursting, setBursting] = useState(false);

  function handleReveal() {
    if (revealed) return;
    setRevealed(true);
    setBursting(true);
    setTimeout(() => setBursting(false), 600);
  }

  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-border bg-bg-card transition-all duration-200 hover:scale-[1.02]"
      style={{
        '--glow-color': tierColor,
      } as React.CSSProperties}
    >
      {/* Tier accent line at top -- visible even before reveal as a rarity hint */}
      <div className="h-0.5" style={{ backgroundColor: tierColor }} />

      {/* Reveal burst */}
      {bursting && (
        <div
          className="animate-reveal-burst pointer-events-none absolute inset-0 z-20 rounded-lg"
          style={{ background: `radial-gradient(circle, ${tierColor}80 0%, transparent 70%)` }}
        />
      )}

      <div className="[perspective:1200px]">
        <div
          className="relative transition-transform duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] [transform-style:preserve-3d]"
          style={{ transform: revealed ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* Front face: mystery cover */}
          <button
            type="button"
            onClick={handleReveal}
            disabled={revealed}
            aria-label="Click to reveal skin"
            className="block w-full text-left [backface-visibility:hidden]"
            style={{ cursor: revealed ? 'default' : 'pointer' }}
          >
            <div className="flex aspect-video items-center justify-center p-4">
              <div className="animate-mystery-pulse flex flex-col items-center gap-2">
                <svg
                  className="h-10 w-10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={tierColor}
                  strokeWidth="1.5"
                >
                  <path d="M12 2L2 12l10 10 10-10L12 2z" />
                </svg>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
                  Click to Reveal
                </span>
              </div>
            </div>

            <div className="flex items-end justify-between border-t border-border p-4">
              <div className="min-w-0 space-y-1.5">
                <div className="h-4 w-28 rounded bg-bg-secondary/70" />
                <div
                  className="h-3.5 w-16 rounded-full"
                  style={{ backgroundColor: `${tierColor}33` }}
                />
              </div>
              <div className="h-4 w-14 shrink-0 rounded bg-bg-secondary/70" />
            </div>
          </button>

          {/* Back face: actual skin, shown once flipped */}
          <div
            className="absolute inset-0 [backface-visibility:hidden]"
            style={{ transform: 'rotateY(180deg)' }}
          >
            <div className={revealed ? 'animate-reveal-pop' : 'opacity-0'}>
              {/* Skin image */}
              <div className="flex aspect-video items-center justify-center p-4">
                {skin.display_icon ? (
                  <img
                    src={skin.display_icon}
                    alt={name}
                    className="h-full w-full object-contain drop-shadow-lg transition-transform duration-200 group-hover:scale-105"
                  />
                ) : (
                  <div className="text-sm text-text-secondary">No image</div>
                )}
              </div>

              {/* Info */}
              <div className="flex items-end justify-between border-t border-border bg-bg-card p-4">
                <div className="min-w-0">
                  <h3
                    className="truncate text-base text-text-primary"
                    style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600 }}
                  >
                    {name}
                  </h3>
                  {/* Tier badge */}
                  <span
                    className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
                    style={{ backgroundColor: tierColor }}
                  >
                    {skin.content_tier_name}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-text-primary">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 12l10 10 10-10L12 2zm0 3.5L18.5 12 12 18.5 5.5 12 12 5.5z" />
                  </svg>
                  <span className="text-sm font-semibold">{skin.cost.toLocaleString()}</span>
                  <span className="text-xs text-text-secondary">VP</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hover glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          boxShadow: `inset 0 0 0 1px ${tierColor}40, 0 0 20px ${tierColor}15`,
        }}
      />
    </div>
  );
}
