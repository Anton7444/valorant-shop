import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { SkinLevel } from "../types";

interface OriginRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface SkinVideoModalProps {
  levels: SkinLevel[];
  fallbackIcon: string;
  name: string;
  originRect: OriginRect;
  onClose: () => void;
}

const OPEN_MS = 500;
const CLOSE_MS = 300;
const CLOSE_FADE_MS = 300;
const FOOTER_HEIGHT = 52;

export default function SkinVideoModal({
  levels,
  fallbackIcon,
  name,
  originRect,
  onClose,
}: SkinVideoModalProps) {
  const rect = originRect;
  const [phase, setPhase] = useState<"entering" | "open" | "closing">(
    "entering",
  );
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const firstWithVideo = levels.findIndex((level) => level.video_url);
    return firstWithVideo === -1 ? 0 : firstWithVideo;
  });

  const selected = levels[selectedIndex];
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
    document.body.style.overflow = "hidden";

    // Paint the card-sized frame first, then animate to the centered floating window.
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase("open"));
    });

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", handleKey);

    return () => {
      cancelAnimationFrame(raf1);
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestClose() {
    setPhase("closing");
    window.setTimeout(onClose, CLOSE_MS);
  }

  const isClosing = phase === "closing";
  const transformMs = isClosing ? CLOSE_MS : OPEN_MS;
  // Closing fades out in place (with a slight shrink) instead of flying back to the card.
  const panelTransform =
    phase === "open"
      ? "translate(0, 0) scale(1)"
      : isClosing
        ? "translate(0, 0) scale(0.95)"
        : originTransform;
  const backdropOpacity = phase === "open" ? 1 : 0;
  const panelOpacity = isClosing ? 0 : 1;
  const opacityMs = isClosing ? CLOSE_FADE_MS : OPEN_MS;

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={`${name} preview`}
    >
      <div
        className="absolute inset-0 bg-bg-primary/80 backdrop-blur-xl"
        style={{
          opacity: backdropOpacity,
          transition: `opacity ${opacityMs}ms ease`,
        }}
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
        <div className="relative min-h-0 flex-1 bg-black">
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close preview"
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-bg-primary/70 text-text-primary transition-colors hover:bg-accent-red"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          {selected.video_url ? (
            <video
              key={selected.video_url}
              src={selected.video_url}
              className="h-full w-full bg-black object-contain"
              autoPlay
              loop
              controls
              playsInline
              // Opened by a click, so sound is usually allowed; if the browser
              // still blocks unmuted autoplay, fall back to muted playback.
              onCanPlay={(event) => {
                const video = event.currentTarget;
                if (video.paused)
                  video.play().catch(() => {
                    video.muted = true;
                    video.play().catch(() => {});
                  });
              }}
            />
          ) : (
            <img
              src={selected.display_icon || fallbackIcon}
              alt={name}
              className="h-full w-full object-contain p-8"
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
            {name}
          </h3>

          {showThumbStrip && (
            <div className="flex shrink-0 items-center gap-2">
              {levels.map((level, index) => (
                <button
                  key={level.uuid}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={`rounded-md border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
                    index === selectedIndex
                      ? "border-accent-red bg-bg-card text-text-primary"
                      : "border-border bg-bg-card/50 text-text-secondary hover:border-text-secondary"
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
