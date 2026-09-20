import { createContext } from 'react';
import type { ShopLanguage } from './LanguageContext';

export type LanguageContextValue = {
  language: ShopLanguage;
  setLanguage: (language: ShopLanguage) => void;
  localizedNames: Record<string, string>;
};

export const LanguageContext = createContext<LanguageContextValue | null>(null);
