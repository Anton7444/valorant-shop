import { useLanguage } from '../context/useLanguage';
import { localizedName } from '../context/languageNames';
import type { SkinTier } from '../utils/skinFilters';

function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-sm border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
        active
          ? 'border-accent-red bg-accent-red/10 text-text-primary'
          : 'border-border bg-bg-secondary text-text-secondary hover:text-text-primary'
      }`}
    >
      {color && <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: color }} />}
      {children}
    </button>
  );
}

export default function SkinFilters({
  weapons,
  tiers,
  weaponFilter,
  tierFilter,
  hasFilters,
  onToggleWeapon,
  onToggleTier,
  onClear,
}: {
  weapons: string[];
  tiers: SkinTier[];
  weaponFilter: Set<string>;
  tierFilter: Set<string>;
  hasFilters: boolean;
  onToggleWeapon: (weapon: string) => void;
  onToggleTier: (tierId: string) => void;
  onClear: () => void;
}) {
  const { localizedNames } = useLanguage();

  return (
    <div className="mb-8 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 w-14 text-[11px] uppercase tracking-widest text-text-secondary">Weapon</span>
        {weapons.map((w) => (
          <FilterChip key={w} active={weaponFilter.has(w)} onClick={() => onToggleWeapon(w)}>
            {localizedName(w, w, localizedNames)}
          </FilterChip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 w-14 text-[11px] uppercase tracking-widest text-text-secondary">Tier</span>
        {tiers.map((tier) => (
          <FilterChip key={tier.id} active={tierFilter.has(tier.id)} color={tier.color} onClick={() => onToggleTier(tier.id)}>
            {tier.name}
          </FilterChip>
        ))}
        {hasFilters && (
          <button
            type="button"
            onClick={onClear}
            className="ml-2 text-xs text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
