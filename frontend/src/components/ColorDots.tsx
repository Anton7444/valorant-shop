import type { SkinChroma } from '../types';
import { useLanguage } from '../context/useLanguage';

interface ColorDotsProps {
  colors: SkinChroma[];
  index: number;
  onChange: (index: number) => void;
}

/** Colour swatches over a skin's image: pick one and the card's picture changes to that colour. */
export default function ColorDots({ colors, index, onChange }: ColorDotsProps) {
  const { localizedNames } = useLanguage();
  if (colors.length < 2) return null;

  return (
    <div
      role="group"
      aria-label="Colours"
      className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-full bg-bg-primary/70 p-1 backdrop-blur-sm"
      // The picture behind is a button that opens the preview; these must not trigger it.
      onClick={(event) => event.stopPropagation()}
    >
      {colors.map((c, i) => {
        const label = localizedNames[`chroma:${c.uuid}`] ?? c.name;
        return (
          <button
            key={c.uuid}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={i === index}
            onClick={() => onChange(i)}
            className={`h-4 w-4 shrink-0 overflow-hidden rounded-full border bg-bg-secondary transition-transform duration-150 hover:scale-125 ${
              i === index ? 'scale-110 border-text-primary' : 'border-transparent'
            }`}
          >
            {c.swatch && <img src={c.swatch} alt="" className="h-full w-full object-cover" />}
          </button>
        );
      })}
    </div>
  );
}
