import ReflectiveLayer from './ReflectiveLayer';

interface ReflectiveCardProps {
  title?: string;
  number?: string;
}

/** 320 x 500 metal pass: WebGL canvas, HTML title and number, highlight rim. No people, camera or external images. */
export default function ReflectiveCard({ title = '反射通行證', number = '0427 1313 2025 0001' }: ReflectiveCardProps) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: 320,
        height: 500,
        borderRadius: 24,
        willChange: 'transform',
        boxShadow: '0 24px 60px -20px rgba(0,0,0,0.7)',
      }}
    >
      <ReflectiveLayer radius={24} tiltParent className="absolute inset-0 h-full w-full" />

      <div className="absolute inset-x-0 top-0 p-7">
        <h2
          className="text-3xl text-white"
          style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, letterSpacing: '0.12em', textShadow: '0 2px 12px rgba(0,0,0,0.55)' }}
        >
          {title}
        </h2>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-7">
        <p
          className="whitespace-nowrap font-mono text-base tracking-[0.12em] text-white/90"
          style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}
        >
          {number}
        </p>
      </div>

      {/* Highlight rim */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: 24,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.55), inset 0 1.5px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(255,255,255,0.2)',
        }}
      />
    </div>
  );
}
