// Loading placeholders shaped like the content they stand in for.

function Block({ className = '', children }: { className?: string; children?: React.ReactNode }) {
  return <div className={`skeleton ${className}`}>{children}</div>;
}

// Same box as a filter chip (SkinFilters / profile chips) so the page below doesn't jump.
function ChipRowSkeleton({ label, widths }: { label: string; widths: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 w-14 text-[11px] uppercase tracking-widest text-text-secondary/0">{label}</span>
      {widths.map((w, i) => (
        <span key={i} className="skeleton border rounded-sm px-2.5 py-1 text-xs font-semibold uppercase tracking-wider">
          <span className="invisible">{w}</span>
        </span>
      ))}
    </div>
  );
}

// The weapon + tier filter block above the skin grids (Catalog, Inventory).
export function FiltersSkeleton() {
  return (
    <div className="mb-8 space-y-3" aria-hidden="true">
      <ChipRowSkeleton label="Weapon" widths={['Classic', 'Ghost', 'Vandal', 'Phantom', 'Operator']} />
      <ChipRowSkeleton label="Tier" widths={['Select', 'Deluxe', 'Premium', 'Exclusive']} />
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading" className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <Block key={i} className="rounded-lg">
          <div className="aspect-video" />
          <div className="space-y-2 border-t border-border p-3">
            <div className="skeleton-line w-2/3" />
            <div className="skeleton-line w-1/4" />
          </div>
        </Block>
      ))}
    </div>
  );
}

export function BundleSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <Block className="rounded-lg">
        <div className="h-16" />
        <div className="grid grid-cols-2 gap-3 border-t border-border p-4 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-video rounded-sm bg-white/5" />
              <div className="skeleton-line w-3/4" />
            </div>
          ))}
        </div>
      </Block>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-12">
      <section>
        <div className="mb-6">
          <div className="skeleton-line h-9 w-64" />
          <div className="skeleton-line mt-1 h-4 w-40" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Block key={i} className="h-[78px] rounded-lg" />
          ))}
        </div>
      </section>

      <section>
        <div className="skeleton-line mb-4 h-7 w-40" />
        <div className="mb-4">
          <ChipRowSkeleton label="Role" widths={['Duelist', 'Initiator', 'Controller', 'Sentinel']} />
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9">
          {Array.from({ length: 18 }, (_, i) => (
            <Block key={i} className="aspect-[3/4] rounded-lg" />
          ))}
        </div>
      </section>

      <section>
        <div className="skeleton-line mb-4 h-7 w-48" />
        <div className="mb-4">
          <ChipRowSkeleton label="Mode" widths={['Competitive', 'Unrated', 'Swiftplay']} />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Block key={i} className="h-[74px] rounded-lg" />
          ))}
        </div>
      </section>
    </div>
  );
}
