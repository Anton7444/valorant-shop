import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LanguageContext } from './languageContextDef';

export type ShopLanguage = 'en-US' | 'zh-TW';

const STORAGE_KEY = 'valorant-shop-language';
const CATALOGS = ['weapons/skins', 'bundles', 'buddies', 'sprays', 'playercards', 'playertitles'];

function getInitialLanguage(): ShopLanguage {
  return localStorage.getItem(STORAGE_KEY) === 'zh-TW' ? 'zh-TW' : 'en-US';
}

function indexCatalog(data: Array<{ uuid: string; displayName?: string; titleText?: string; levels?: Array<{ uuid: string }> }>) {
  return data.reduce<Record<string, string>>((names, entry) => {
    const name = entry.displayName || entry.titleText;
    if (!name) return names;
    names[entry.uuid.toLowerCase()] = name;
    entry.levels?.forEach((level) => {
      names[level.uuid.toLowerCase()] = name;
    });
    return names;
  }, {});
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<ShopLanguage>(getInitialLanguage);
  const [localizedNames, setLocalizedNames] = useState<Record<string, string>>({});

  function setLanguage(next: ShopLanguage) {
    localStorage.setItem(STORAGE_KEY, next);
    setLanguageState(next);
  }

  useEffect(() => {
    if (language !== 'zh-TW') return;

    let cancelled = false;
    Promise.all(
      CATALOGS.map(async (catalog) => {
        const response = await fetch(`https://valorant-api.com/v1/${catalog}?language=zh-TW`);
        if (!response.ok) throw new Error(`Localized catalog request failed: ${response.status}`);
        const payload = await response.json() as { data: Array<{ uuid: string; displayName?: string; titleText?: string; levels?: Array<{ uuid: string }> }> };
        return indexCatalog(payload.data);
      }),
    ).then((catalogs) => {
      if (!cancelled) setLocalizedNames(Object.assign({}, ...catalogs));
    }).catch(() => {
      if (!cancelled) setLocalizedNames({});
    });

    return () => { cancelled = true; };
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage, localizedNames: language === 'zh-TW' ? localizedNames : {} }),
    [language, localizedNames],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
