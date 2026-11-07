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
  /** Index of the colour to open on (0 = the skin's default). */
  initialColor?: number;
  fallbackIcon: string;
  name: string;
  originRect: OriginRect;
  onClose: () => void;
}

const OPEN_MS = 500;
const CLOSE_MS = 300;
const CLOSE_FADE_MS = 300;
const FOOTER_HEIGHT = 52;
// Phones: the footer stacks the name, the colours and the levels in rows so every button is reachable.
const COMPACT_WIDTH = 640;
const COMPACT_ROW = 36;

export default function SkinVideoModal({ levels, chromas = [], initialColor = 0, fallbackIcon, name, originRect, onClose }: SkinVideoModalProps) {
  const { localizedNames } = useLanguage();
  const rect = originRect;
  const viaServer = useVideoViaServer();
  const [phase, setPhase] = useState<'entering' | 'open' | 'closing'>('entering');
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (initialColor > 0) return levels.length - 1;
    const firstWithVideo = levels.findIndex((level) => level.video_url);
    return firstWithVideo === -1 ? 0 : firstWithVideo;
  });

  // Colour variants: -1 is the skin's default colour, otherwise the chosen colour. Riot's colour videos
  // and renders show a variant at the skin's top level, so choosing a colour moves the level selection
  // to the last level, and choosing an earlier level goes back to the default colour.
  const finalLevel = levels.length - 1;
  const [chromaIndex, setChromaIndex] = useState(initialColor > 0 ? initialColor : -1);
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
  const compact = window.innerWidth < COMPACT_WIDTH;
  const compactRows = 1 + (hasColors ? 1 : 0) + (showThumbStrip ? 1 : 0);
  const footerHeight = compact ? compactRows * COMPACT_ROW + 16 : FOOTER_HEIGHT;
  const panelHeight = videoHeight + footerHeight;
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
          className={`flex shrink-0 border-t border-border bg-bg-secondary px-3 ${
            compact ? 'flex-col justify-center gap-1' : 'items-center justify-between gap-3'
          }`}
          style={{ height: footerHeight }}
        >
          <h3
            className="min-w-0 truncate text-sm text-text-primary"
            style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600 }}
          >
            {mediaTitle}
          </h3>

          {(hasColors || showThumbStrip) && (
            <div
              className={`flex min-w-0 items-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                compact ? 'flex-col items-stretch gap-1' : 'shrink-0 gap-4 overflow-x-auto'
              }`}
            >
              {hasColors && (
                <div role="group" aria-label="Colours" className="flex items-center gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {chromas.map((c, index) => {
                    const active = index === (chromaIndex === -1 ? 0 : chromaIndex);
                    return (
                      <button
                        key={c.uuid}
                        type="button"
                        title={chromaName(c)}
                        aria-label={chromaName(c)}
                        aria-pressed={active}
                        onClick={() => {
                          setChromaIndex(index === 0 ? -1 : index);
                          if (index > 0) setSelectedIndex(finalLevel);
                        }}
                        className={`h-7 w-7 shrink-0 overflow-hidden rounded-full border-2 bg-bg-card transition-transform duration-200 hover:scale-110 ${
                          active ? 'scale-110 border-text-primary' : 'border-border'
                        }`}
                      >
                        {c.swatch ? (
                          <img src={c.swatch} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="block text-[10px] leading-6 text-text-secondary">{index + 1}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {hasColors && showThumbStrip && !compact && <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />}

              {showThumbStrip && (
                <div role="group" aria-label="Levels" className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {levels.map((level, index) => {
                    const active = index === selectedIndex;
                    // With a colour picked, only the top level can show it; the others go back to the default colour.
                    const dim = chroma !== null && index !== finalLevel;
                    return (
                      <button
                        key={level.uuid}
                        type="button"
                        aria-pressed={active}
                        title={dim ? 'Shows the default colour' : undefined}
                        onClick={() => {
                          setSelectedIndex(index);
                          if (index !== finalLevel) setChromaIndex(-1);
                        }}
                        className={`rounded-md border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
                          active
                            ? 'border-accent-red bg-bg-card text-text-primary'
                            : `border-border bg-bg-card/50 text-text-secondary hover:border-text-secondary ${dim ? 'opacity-60' : ''}`
                        }`}
                      >
                        LV.{level.level_number}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
