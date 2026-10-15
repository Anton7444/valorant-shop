import { useRovingArrows } from '../hooks/useRovingArrows';

type Option<T extends string> = { value: T; label: string };

// Pill-shaped switch with a thumb that slides to the chosen option.
export default function LanguageSwitch<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  const ref = useRovingArrows<HTMLDivElement>('button');
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className="relative grid select-none rounded-full border border-border bg-bg-secondary p-[2px]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[2px] top-[2px] rounded-full border border-border bg-bg-card shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{
          left: 2,
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={`relative z-10 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-200 ${
            option.value === value ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
