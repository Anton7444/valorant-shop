import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CACHE_CHANGED,
  VIDEO_CAP_BYTES,
  cacheSupported,
  clearAll,
  deleteEntries,
  imageCachingOn,
  listEntries,
  setImageCaching,
  setVideoCaching,
  videoCachingOn,
  type CachedEntry,
} from '../utils/mediaCache';

const MB = 1024 * 1024;
const formatSize = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const rowButton =
  'shrink-0 text-xs text-text-secondary underline-offset-2 transition-colors hover:text-accent-red hover:underline disabled:opacity-50';

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-[var(--color-accent-red)]"
      />
      <span>
        <span className="block text-sm text-text-primary">{label}</span>
        <span className="block text-xs leading-relaxed text-text-secondary/80">{hint}</span>
      </span>
    </label>
  );
}

/** Settings > Storage: what is kept on this device (pictures and videos), with delete controls. */
export default function StorageSection() {
  const [entries, setEntries] = useState<CachedEntry[] | null>(null);
  const [images, setImages] = useState(imageCachingOn);
  const [videos, setVideos] = useState(videoCachingOn);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const refresh = useCallback(() => {
    listEntries()
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(CACHE_CHANGED, refresh);
    return () => window.removeEventListener(CACHE_CHANGED, refresh);
  }, [refresh]);

  const { imageGroups, videoList, imageBytes, videoBytes } = useMemo(() => {
    const groups = new Map<string, { urls: string[]; size: number }>();
    const vids: CachedEntry[] = [];
    let imageBytes = 0;
    let videoBytes = 0;
    for (const entry of entries ?? []) {
      if (entry.kind === 'video') {
        vids.push(entry);
        videoBytes += entry.size;
      } else {
        imageBytes += entry.size;
        const group = groups.get(entry.category) ?? { urls: [], size: 0 };
        group.urls.push(entry.url);
        group.size += entry.size;
        groups.set(entry.category, group);
      }
    }
    return {
      imageGroups: [...groups].sort((a, b) => b[1].size - a[1].size),
      videoList: vids.sort((a, b) => b.cachedAt - a.cachedAt),
      imageBytes,
      videoBytes,
    };
  }, [entries]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      refresh();
    }
  }

  if (!cacheSupported()) {
    return <p className="text-sm text-text-secondary">This browser cannot keep files on the device (or it is blocked), so everything loads from the internet each time.</p>;
  }

  const total = imageBytes + videoBytes;

  return (
    <div>
      <Toggle
        label="Keep pictures on this device"
        hint="Agents, skins, cards and the like are saved the first time you see them, so later visits show them at once and use no data."
        checked={images}
        onChange={(on) => {
          setImages(on);
          setImageCaching(on);
        }}
      />
      <Toggle
        label="Keep videos I watch"
        hint={`Skin videos are saved after they start playing, so they start straight away next time. Up to ${Math.round(VIDEO_CAP_BYTES / MB)} MB; the oldest are removed first.`}
        checked={videos}
        onChange={(on) => {
          setVideos(on);
          setVideoCaching(on);
        }}
      />

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-border/60 pt-3">
        <span className="text-sm text-text-primary">
          Stored on this device: {entries === null ? '…' : formatSize(total)}
        </span>
        {entries !== null && total > 0 && (
          <span className="text-xs">
            {confirmClear ? (
              <>
                <span className="mr-2 text-text-secondary">Delete everything?</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(async () => {
                    await clearAll();
                    setConfirmClear(false);
                  })}
                  className="mr-3 text-accent-red underline-offset-2 hover:underline"
                >
                  Yes, delete
                </button>
                <button type="button" onClick={() => setConfirmClear(false)} className={rowButton}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" disabled={busy} onClick={() => setConfirmClear(true)} className={rowButton}>
                Clear everything
              </button>
            )}
          </span>
        )}
      </div>

      {entries !== null && total === 0 && <p className="mt-2 text-xs text-text-secondary/70">Nothing is stored yet.</p>}

      {imageGroups.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1 text-[11px] uppercase tracking-widest text-text-secondary">Pictures · {formatSize(imageBytes)}</h3>
          <ul className="divide-y divide-border/50">
            {imageGroups.map(([category, group]) => (
              <li key={category} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span className="min-w-0 truncate text-text-primary">
                  {category}
                  <span className="ml-2 text-xs text-text-secondary">
                    {group.urls.length} · {formatSize(group.size)}
                  </span>
                </span>
                <button type="button" disabled={busy} onClick={() => run(() => deleteEntries(group.urls))} className={rowButton}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {videoList.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h3 className="text-[11px] uppercase tracking-widest text-text-secondary">Videos · {formatSize(videoBytes)}</h3>
            <button type="button" disabled={busy} onClick={() => run(() => clearAll('video'))} className={rowButton}>
              Delete all videos
            </button>
          </div>
          <ul className="divide-y divide-border/50">
            {videoList.map((video) => (
              <li key={video.url} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span className="min-w-0 truncate text-text-primary" title={video.url}>
                  {video.label || 'Skin video'}
                  <span className="ml-2 text-xs text-text-secondary">{formatSize(video.size)}</span>
                </span>
                <button type="button" disabled={busy} onClick={() => run(() => deleteEntries([video.url]))} className={rowButton}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
