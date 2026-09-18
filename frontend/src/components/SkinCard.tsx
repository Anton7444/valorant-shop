import type { SkinOffer } from '../types';

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
  const tierColor = getTierColor(skin.content_tier_name, skin.content_tier_color);

  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-border bg-bg-card transition-all duration-200 hover:scale-[1.02]"
      style={{
        '--glow-color': tierColor,
      } as React.CSSProperties}
    >
      {/* Tier accent line at top */}
      <div className="h-0.5" style={{ backgroundColor: tierColor }} />

      {/* Skin image */}
      <div className="flex aspect-video items-center justify-center p-4">
        {skin.display_icon ? (
          <img
            src={skin.display_icon}
            alt={skin.name}
            className="h-full w-full object-contain drop-shadow-lg transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="text-sm text-text-secondary">No image</div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-end justify-between border-t border-border p-4">
        <div className="min-w-0">
          <h3
            className="truncate text-base text-text-primary"
            style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600 }}
          >
            {skin.name}
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
