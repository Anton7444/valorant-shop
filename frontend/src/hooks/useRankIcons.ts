import { useEffect, useState } from 'react';

// Rank name ("Gold 2") -> icon URL, loaded once from the newest competitive episode.
let cache: Promise<Record<string, string>> | null = null;

function loadRankIcons(): Promise<Record<string, string>> {
  cache ??= fetch('https://valorant-api.com/v1/competitivetiers')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('rank icons'))))
    .then((body: { data: { tiers: { tierName: string; smallIcon: string | null }[] }[] }) => {
      const icons: Record<string, string> = {};
      const latest = body.data[body.data.length - 1];
      for (const tier of latest?.tiers ?? []) {
        // tierName is upper case ("GOLD 2"); the backend sends "Gold 2".
        if (tier.smallIcon) icons[tier.tierName.toLowerCase()] = tier.smallIcon;
      }
      return icons;
    })
    .catch(() => {
      cache = null;
      return {};
    });
  return cache;
}

export function useRankIcons(): Record<string, string> {
  const [icons, setIcons] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    void loadRankIcons().then((i) => { if (live) setIcons(i); });
    return () => { live = false; };
  }, []);
  return icons;
}
