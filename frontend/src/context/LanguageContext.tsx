import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LanguageContext } from './languageContextDef';

export type ShopLanguage = 'en-US' | 'zh-TW';

const STORAGE_KEY = 'valorant-shop-language';
const CATALOGS = ['weapons/skins', 'bundles', 'buddies', 'sprays', 'playercards', 'playertitles'];
type CatalogEntry = { uuid: string; displayName?: string; titleText?: string; levels?: Array<{ uuid: string }> };

function getInitialLanguage(): ShopLanguage {
  return localStorage.getItem(STORAGE_KEY) === 'zh-TW' ? 'zh-TW' : 'en-US';
}

function indexCatalog(data: CatalogEntry[]) {
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

function indexEnglishNames(data: CatalogEntry[]) {
  return data.reduce<Record<string, string>>((names, entry) => {
    const name = entry.displayName || entry.titleText;
    if (!name) return names;
    names[name.toLowerCase()] = entry.uuid.toLowerCase();
    entry.levels?.forEach((level) => { names[`${name}:${level.uuid}`.toLowerCase()] = entry.uuid.toLowerCase(); });
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
        const [localizedResponse, englishResponse] = await Promise.all([
          fetch(`https://valorant-api.com/v1/${catalog}?language=zh-TW`),
          fetch(`https://valorant-api.com/v1/${catalog}?language=en-US`),
        ]);
        if (!localizedResponse.ok || !englishResponse.ok) throw new Error('Localized catalog request failed');
        const localized = await localizedResponse.json() as { data: CatalogEntry[] };
        const english = await englishResponse.json() as { data: CatalogEntry[] };
        return { names: indexCatalog(localized.data), englishNames: indexEnglishNames(english.data) };
      }),
    ).then((catalogs) => {
      if (!cancelled) {
        const names = Object.assign({}, ...catalogs.map((catalog) => catalog.names));
        const englishNames = Object.assign({}, ...catalogs.map((catalog) => catalog.englishNames)) as Record<string, string>;
        Object.entries(englishNames).forEach(([englishName, uuid]) => {
          if (names[uuid]) names[englishName] = names[uuid];
        });
        setLocalizedNames(names);
      }
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
