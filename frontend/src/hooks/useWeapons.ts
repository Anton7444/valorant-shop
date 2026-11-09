import { useEffect, useState } from 'react';

export type WeaponInfo = { name: string; icon: string };
const cache = new Map<string, Promise<Record<string, WeaponInfo>>>();

function load(language: string): Promise<Record<string, WeaponInfo>> {
  let p = cache.get(language);
  if (!p) {
    p = fetch(`https://valorant-api.com/v1/weapons?language=${language}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('weapons'))))
      .then((body: { data: { uuid: string; displayName: string; displayIcon: string | null }[] }) =>
        Object.fromEntries(body.data.map((w) => [w.uuid.toLowerCase(), { name: w.displayName, icon: w.displayIcon ?? '' }])),
      )
      .catch(() => {
        cache.delete(language);
        return {};
      });
    cache.set(language, p);
  }
  return p;
}

/** Weapon uuid -> name and icon from valorant-api.com, in the chosen language. */
export function useWeapons(language: string): Record<string, WeaponInfo> {
  const [weapons, setWeapons] = useState<Record<string, WeaponInfo>>({});
  useEffect(() => {
    let live = true;
    void load(language).then((w) => { if (live) setWeapons(w); });
    return () => { live = false; };
  }, [language]);
  return weapons;
}
