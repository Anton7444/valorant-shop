import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SkinChroma, SkinLevel } from '../types';
import { useLanguage } from '../context/useLanguage';
import { useVideoViaServer, videoSrc } from '../utils/videoRoute';

interface OriginRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface SkinVideoModalProps {
  levels: SkinLevel[];
  chromas?: SkinChroma[];
  fallbackIcon: string;
  name: string;
  originRect: OriginRect;
  onClose: () => void;
}

const OPEN_MS = 500;
const CLOSE_MS = 300;
const CLOSE_FADE_MS = 300;
const FOOTER_HEIGHT = 52;

export default function SkinVideoModal({ levels, chromas = [], fallbackIcon, name, originRect, onClose }: SkinVideoModalProps) {
  const { localizedNames } = useLanguage();
  const rect = originRect;
  const viaServer = useVideoViaServer();
  const [phase, setPhase] = useState<'entering' | 'open' | 'closing'>('entering');
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const firstWithVideo = levels.findIndex((level) => level.video_url);
    return firstWithVideo === -1 ? 0 : firstWithVideo;
  });

  // Colour variants: -1 shows the skin itself (its levels), otherwise the chosen colour.
  const [chromaIndex, setChromaIndex] = useState(-1);
  const hasColors = chromas.length > 1;
  const chroma = chromaIndex >= 0 ? chromas[chromaIndex] : null;
  const chromaName = (c: SkinChroma) => localizedNames[`chroma:${c.uuid}`] ?? c.name;

  const selected = levels[selectedIndex];
  const mediaVideo = chroma ? chroma.video_url : selected.video_url;
  const mediaImage = chroma ? chroma.display_icon : selected.display_icon || fallbackIcon;
  const mediaTitle = chroma ? chromaName(chroma) : name;
  const showThumbStrip = levels.length > 1;

  const videoWidth = Math.min(window.innerWidth * 0.9, 960);
  const videoHeight = (videoWidth * 9) / 16;
  const panelHeight = videoHeight + FOOTER_HEIGHT;
  const targetTop = (window.innerHeight - panelHeight) / 2;
  const targetLeft = (window.innerWidth - videoWidth) / 2;

  // Uniform scale (not separate X/Y factors) so the panel grows proportionally
  // instead of stretching/skewing, since the origin card and the target panel
  // don't share the same aspect ratio (the panel is taller, for the LV strip).
  // The transform origin is the center of the video area (not the whole panel),
  // so the video lands exactly on the card image and the LV strip hangs below it.
  const scale = rect.width / videoWidth;
  const translateX = rect.left + rect.width / 2 - (targetLeft + videoWidth / 2);
  const translateY = rect.top + rect.height / 2 - (targetTop + videoHeight / 2);
  const originTransform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;

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
    window.setTimeout(onClose, CLOSE_MS);
  }

  const isClosing = phase === 'closing';
  const transformMs = isClosing ? CLOSE_MS : OPEN_MS;
  // Closing fades out in place (with a slight shrink) instead of flying back to the card.
  const panelTransform =
    phase === 'open' ? 'translate(0, 0) scale(1)' : isClosing ? 'translate(0, 0) scale(0.95)' : originTransform;
  const backdropOpacity = phase === 'open' ? 1 : 0;
  const panelOpacity = isClosing ? 0 : 1;
  const opacityMs = isClosing ? CLOSE_FADE_MS : OPEN_MS;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${name} preview`}>
      <div
        className="absolute inset-0 bg-bg-primary/80 backdrop-blur-xl"
        style={{ opacity: backdropOpacity, transition: `opacity ${opacityMs}ms ease` }}
        onClick={requestClose}
      />

      <div
        className="absolute flex flex-col overflow-hidden rounded-xl border border-border bg-bg-card shadow-2xl"
        style={{
          top: targetTop,
          left: targetLeft,
          width: videoWidth,
          height: panelHeight,
          transform: panelTransform,
          transformOrigin: `50% ${videoHeight / 2}px`,
          opacity: panelOpacity,
          transition: `transform ${transformMs}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${opacityMs}ms ease`,
        }}
      >
        <div
          className={`relative min-h-0 flex-1 ${
            mediaVideo ? 'bg-black' : 'bg-[radial-gradient(ellipse_at_center,#243247_0%,#0c121a_75%)]'
          }`}
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

          {hasColors && (
            <div
              role="group"
              aria-label="Colours"
              className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-4.5rem)] items-center gap-1.5 overflow-x-auto rounded-full bg-bg-primary/70 p-1.5 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {chromas.map((c, index) => {
                const active = index === (chromaIndex === -1 ? 0 : chromaIndex);
                return (
                  <button
                    key={c.uuid}
                    type="button"
                    title={chromaName(c)}
                    aria-label={chromaName(c)}
                    aria-pressed={active}
                    onClick={() => setChromaIndex(index === 0 ? -1 : index)}
                    className={`h-6 w-6 shrink-0 overflow-hidden rounded-full border-2 bg-bg-secondary transition-transform duration-200 hover:scale-110 ${
                      active ? 'scale-110 border-text-primary' : 'border-transparent'
                    }`}
                  >
                    {c.swatch ? (
                      <img src={c.swatch} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="block h-full w-full text-[9px] leading-5 text-text-secondary">{index + 1}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {mediaVideo ? (
            <video
              key={mediaVideo}
              src={videoSrc(mediaVideo, viaServer)}
              className="h-full w-full bg-black object-contain"
              autoPlay
              loop
              controls
              playsInline
              // Opened by a click, so sound is usually allowed; if the browser
              // still blocks unmuted autoplay, fall back to muted playback.
              onCanPlay={(event) => {
                const video = event.currentTarget;
                if (video.paused) video.play().catch(() => {
                  video.muted = true;
                  video.play().catch(() => {});
                });
              }}
            />
          ) : (
            <img
              key={mediaImage}
              src={mediaImage}
              alt={mediaTitle}
              className="h-full w-full animate-[fade-in_300ms_ease] object-contain p-8"
            />
          )}

        </div>

        <div
          className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-bg-secondary px-3"
          style={{ height: FOOTER_HEIGHT }}
        >
          <h3
            className="min-w-0 truncate text-sm text-text-primary"
            style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600 }}
          >
            {mediaTitle}
          </h3>

          {showThumbStrip && (
            <div className="flex shrink-0 items-center gap-2">
              {levels.map((level, index) => (
                <button
                  key={level.uuid}
                  type="button"
                  onClick={() => {
                    setSelectedIndex(index);
                    setChromaIndex(-1);
                  }}
                  className={`rounded-md border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
                    index === selectedIndex && !chroma
                      ? 'border-accent-red bg-bg-card text-text-primary'
                      : 'border-border bg-bg-card/50 text-text-secondary hover:border-text-secondary'
                  }`}
                >
                  LV.{level.level_number}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
