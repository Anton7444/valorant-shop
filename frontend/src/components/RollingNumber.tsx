import { useEffect, useState } from 'react';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Odometer-style number: each digit rolls up from 0 to its value on mount and whenever the value changes. */
export default function RollingNumber({ value }: { value: number }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setArmed(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  const text = String(value);
  const last = text.length - 1;

  return (
    <span className="inline-flex tabular-nums" aria-label={text} role="img">
      {[...text].map((ch, i) => {
        const digit = Number(ch);
        if (ch === ' ' || Number.isNaN(digit)) {
          return (
            <span key={i} aria-hidden="true">
              {ch}
            </span>
          );
        }
        // Counted from the right so a digit keeps its column when the number grows.
        const fromRight = last - i;
        const shown = armed ? digit : 0;
        return (
          <span key={fromRight} aria-hidden="true" className="inline-block h-[1em] overflow-hidden leading-none">
            <span
              className="roll-column flex flex-col"
              style={{
                transform: `translateY(${-shown}em)`,
                transitionDuration: `${700 + fromRight * 160}ms`,
              }}
            >
              {DIGITS.map((d) => (
                <span key={d} className="block h-[1em] leading-none">
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
