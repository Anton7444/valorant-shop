import { useCallback, useEffect, useMemo, useState } from 'react';

// Prices in the app are stored in AUD; other currencies are converted at today's rate.
const CACHE_KEY = 'fx-rates-aud';
const CHOICE_KEY = 'fx-currency';
const CACHE_MS = 12 * 60 * 60 * 1000;
const SOURCES = [
  'https://open.er-api.com/v6/latest/AUD',
  'https://api.frankfurter.app/latest?from=AUD',
];

// Shown first when the rate source has them; anything else the source offers follows alphabetically.
const PREFERRED = ['AUD', 'USD', 'EUR', 'GBP', 'JPY', 'KRW', 'TWD', 'HKD', 'CNY', 'SGD', 'MYR', 'THB', 'PHP', 'IDR', 'INR', 'CAD', 'NZD', 'BRL', 'MXN', 'TRY'];

interface RateCache {
  rates: Record<string, number>;
  at: number;
}

function readCache(): RateCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as RateCache) : null;
  } catch {
    return null;
  }
}

async function fetchRates(): Promise<Record<string, number>> {
  for (const url of SOURCES) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const rates = data.rates as Record<string, number> | undefined;
      if (rates && typeof rates.USD === 'number') return { ...rates, AUD: 1 };
    } catch {
      // try the next source
    }
  }
  throw new Error('No exchange-rate source reachable');
}

function readChoice(): string {
  try {
    return localStorage.getItem(CHOICE_KEY) || 'AUD';
  } catch {
    return 'AUD';
  }
}

export interface CurrencyState {
  /** Currency actually used for display (AUD until the rates have loaded). */
  code: string;
  /** Currencies that can be chosen, preferred ones first. */
  options: string[];
  setCode: (code: string) => void;
  /** AUD -> `code` multiplier. */
  rate: number;
  status: 'ready' | 'loading' | 'failed';
  /** Format an amount that is already in `code`. */
  money: (amount: number) => string;
  /** Format an AUD amount in `code`. */
  fromAud: (aud: number) => string;
}

export function useCurrency(): CurrencyState {
  const [choice, setChoice] = useState(readChoice);
  const [cache, setCache] = useState<RateCache | null>(() => {
    const cached = readCache();
    return cached && Date.now() - cached.at < CACHE_MS ? cached : null;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    fetchRates()
      .then((rates) => {
        const next = { rates, at: Date.now() };
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(next));
        } catch {
          // storage unavailable: just keep it in memory
        }
        if (!cancelled) setCache(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cache]);

  const rates = cache?.rates ?? null;
  const code = rates && rates[choice] ? choice : 'AUD';
  const rate = rates?.[code] ?? 1;

  const options = useMemo(() => {
    if (!rates) return ['AUD'];
    const all = Object.keys(rates).filter((c) => /^[A-Z]{3}$/.test(c));
    const preferred = PREFERRED.filter((c) => all.includes(c));
    const rest = all.filter((c) => !preferred.includes(c)).sort();
    return [...preferred, ...rest];
  }, [rates]);

  const setCode = useCallback((next: string) => {
    setChoice(next);
    try {
      localStorage.setItem(CHOICE_KEY, next);
    } catch {
      // storage unavailable: the choice just won't persist
    }
  }, []);

  const money = useCallback(
    (amount: number) => {
      if (code === 'AUD') return `A$${amount.toFixed(2)}`;
      try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount);
      } catch {
        return `${amount.toFixed(2)} ${code}`;
      }
    },
    [code],
  );
  const fromAud = useCallback((aud: number) => money(aud * rate), [money, rate]);

  return {
    code,
    options,
    setCode,
    rate,
    status: rates ? 'ready' : failed ? 'failed' : 'loading',
    money,
    fromAud,
  };
}
