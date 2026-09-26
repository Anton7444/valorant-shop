import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface OriginRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface SkinVideoModalProps {
  videoUrl: string;
  posterUrl: string;
  name: string;
  originRect: OriginRect;
  onClose: () => void;
}

const TRANSITION_MS = 380;

export default function SkinVideoModal({ videoUrl, posterUrl, name, originRect, onClose }: SkinVideoModalProps) {
  const [phase, setPhase] = useState<'entering' | 'open' | 'closing'>('entering');

  const targetWidth = Math.min(window.innerWidth * 0.9, 960);
  const targetHeight = (targetWidth * 9) / 16;
  const targetTop = (window.innerHeight - targetHeight) / 2;
  const targetLeft = (window.innerWidth - targetWidth) / 2;

  const scaleX = originRect.width / targetWidth;
  const scaleY = originRect.height / targetHeight;
  const translateX = originRect.left + originRect.width / 2 - (targetLeft + targetWidth / 2);
  const translateY = originRect.top + originRect.height / 2 - (targetTop + targetHeight / 2);
  const originTransform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;

  useEffect(() => {
    document.body.style.overflow = 'hidden';

    // Paint the card-sized frame first, then animate to the centered floating window.
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase('open'));
    });

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') requestClose();
    }
    window.addEventListener('keydown', handleKey);

    return () => {
      cancelAnimationFrame(raf1);
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestClose() {
    setPhase('closing');
    window.setTimeout(onClose, TRANSITION_MS);
  }

  const panelTransform = phase === 'open' ? 'translate(0, 0) scale(1, 1)' : originTransform;
  const backdropOpacity = phase === 'open' ? 1 : 0;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${name} preview`}>
      <div
        className="absolute inset-0 bg-bg-primary/80 backdrop-blur-xl"
        style={{ opacity: backdropOpacity, transition: `opacity ${TRANSITION_MS}ms ease` }}
        onClick={requestClose}
      />

      <div
        className="absolute overflow-hidden rounded-xl border border-border bg-bg-card shadow-2xl [transform-origin:center]"
        style={{
          top: targetTop,
          left: targetLeft,
          width: targetWidth,
          height: targetHeight,
          transform: panelTransform,
          opacity: phase === 'entering' ? 0.4 : 1,
          transition: `transform ${TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${TRANSITION_MS}ms ease`,
        }}
      >
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close preview"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-bg-primary/70 text-text-primary transition-colors hover:bg-accent-red"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <video
          src={videoUrl}
          poster={posterUrl}
          className="h-full w-full bg-black object-contain"
          autoPlay
          loop
          muted
          playsInline
          controls
        />

        <h3
          className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent p-3 text-sm text-white"
          style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600 }}
        >
          {name}
        </h3>
      </div>
    </div>,
    document.body,
  );
}
