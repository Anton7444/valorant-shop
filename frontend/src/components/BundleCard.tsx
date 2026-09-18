import { useEffect, useState } from 'react';
import type { Bundle } from '../types';

interface BundleCardProps {
  bundle: Bundle;
}

function formatTime(totalSecs: number): string {
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (d > 0) return `${d}d ${h}h ${m.toString().padStart(2, '0')}m`;
  return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
}

export default function BundleCard({ bundle }: BundleCardProps) {
  const [remaining, setRemaining] = useState(bundle.duration_remaining_secs);
  const [prevSecs, setPrevSecs] = useState(bundle.duration_remaining_secs);

  if (bundle.duration_remaining_secs !== prevSecs) {
    setPrevSecs(bundle.duration_remaining_secs);
    setRemaining(bundle.duration_remaining_secs);
  }

  const isExpired = remaining <= 0;

  useEffect(() => {
    if (isExpired) return;
    const interval = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isExpired]);

  const hasDiscount = bundle.total_discounted_price < bundle.total_base_price;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h3
          className="text-xl text-text-primary"
          style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}
        >
          {bundle.name}
        </h3>
        <div className="flex items-center gap-2 text-sm text-accent-teal">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {formatTime(remaining)}
        </div>
      </div>

      {/* Bundle image if available */}
      {bundle.display_icon && (
        <div className="flex justify-center bg-bg-primary/50 p-4">
          <img
            src={bundle.display_icon}
            alt={bundle.name}
            className="max-h-40 object-contain"
          />
        </div>
      )}

      {/* Items grid */}
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
        {bundle.items.map((item) => (
          <div
            key={item.uuid}
            className="flex flex-col items-center rounded border border-border/50 bg-bg-secondary p-2"
          >
            {item.display_icon ? (
              <img
                src={item.display_icon}
                alt={item.name}
                className="mb-2 h-16 w-full object-contain"
              />
            ) : (
              <div className="mb-2 flex h-16 w-full items-center justify-center text-xs text-text-secondary">
                No image
              </div>
            )}
            <p className="line-clamp-1 text-center text-xs text-text-primary">{item.name}</p>
            <div className="mt-1 flex items-center gap-1 text-xs text-text-secondary">
              <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 12l10 10 10-10L12 2zm0 3.5L18.5 12 12 18.5 5.5 12 12 5.5z" />
              </svg>
              {item.discounted_price.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Total price */}
      <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
        {hasDiscount && (
          <span className="text-sm text-text-secondary line-through">
            {bundle.total_base_price.toLocaleString()} VP
          </span>
        )}
        <span className="flex items-center gap-1 text-lg font-bold text-accent-red">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 12l10 10 10-10L12 2zm0 3.5L18.5 12 12 18.5 5.5 12 12 5.5z" />
          </svg>
          {bundle.total_discounted_price.toLocaleString()} VP
        </span>
      </div>
    </div>
  );
}
