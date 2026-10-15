// Loading placeholders shaped like the content they stand in for.

function Block({ className = '', children }: { className?: string; children?: React.ReactNode }) {
  return <div className={`skeleton ${className}`}>{children}</div>;
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
      <div>
        <div className="skeleton-line mb-3 h-7 w-64" />
        <div className="skeleton-line mb-6 w-40" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Block key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9">
        {Array.from({ length: 18 }, (_, i) => (
          <Block key={i} className="aspect-[3/4] rounded-lg" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Block key={i} className="h-[74px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}
