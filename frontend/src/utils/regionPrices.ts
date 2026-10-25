import type { PackSet, VpPack } from './vpPacks';

// Valorant Points packs as sold in each region, in that region's currency: [total VP, bonus VP, price].
// Collected from Riot's wiki and third-party price guides (see `confidence` / `note`); Riot publishes
// no price API, so confirm in the Riot store before buying. Currencies not listed here are estimated
// from the AUD packs at the current exchange rate.
export type Confidence = 'high' | 'medium' | 'low';

interface Region {
  confidence: Confidence;
  note?: string;
  packs: [number, number, number][];
}

export const REGION_PRICES: Record<string, Region> = {
  USD: {
    confidence: 'high',
    packs: [[475, 0, 4.99], [1000, 50, 9.99], [2050, 150, 19.99], [3650, 325, 34.99], [5350, 600, 49.99], [11000, 1500, 99.99]],
  },
  EUR: {
    confidence: 'high',
    note: 'PC prices. Console stores use different prices.',
    packs: [[475, 0, 5], [1000, 50, 10], [2050, 150, 20], [3650, 320, 35], [5350, 600, 50], [11000, 1500, 100]],
  },
  GBP: {
    confidence: 'high',
    note: 'PC packs. Console stores use different packs and prices.',
    packs: [[500, 0, 4.5], [1050, 105, 9], [2150, 260, 18], [3650, 500, 30], [5500, 775, 45], [11500, 2050, 90]],
  },
  AUD: {
    confidence: 'medium',
    note: 'Sources disagree: an older list has 475 / 1,000 / 2,050 / 3,650 / 5,350 / 11,000 VP at A$7.25 / 14.75 / 30 / 52 / 74 / 148, which looks like prices before GST.',
    packs: [[525, 0, 7.99], [1025, 40, 14.99], [2175, 140, 30.99], [3975, 300, 55.99], [5800, 550, 79.99], [9750, 1220, 129.99]],
  },
  CAD: {
    confidence: 'high',
    note: 'PC prices. Console stores use different prices.',
    packs: [[475, 0, 6.99], [1000, 50, 13.99], [2050, 150, 27.99], [3650, 320, 47.99], [5350, 600, 69.99], [11000, 1500, 139.99]],
  },
  NZD: {
    confidence: 'medium',
    note: 'Sources disagree on the smallest pack (525 or 599 VP for NZ$8.99).',
    packs: [[599, 0, 8.99], [1025, 35, 16.99], [2175, 135, 34.99], [3975, 300, 62.99], [5800, 550, 89.99], [9750, 1290, 144.99]],
  },
  KRW: {
    confidence: 'medium',
    note: 'Bonus amounts are inferred from the standard pack sizes.',
    packs: [[475, 0, 6500], [1000, 50, 13000], [2050, 150, 26000], [3650, 325, 45000], [5350, 600, 65000], [11000, 1500, 130000]],
  },
  SGD: {
    confidence: 'medium',
    note: 'Singapore uses its own pack sizes; the bonus amounts are inferred and sources disagree on the smallest pack.',
    packs: [[575, 75, 6.98], [975, 46, 12.98], [1975, 118, 25.98], [3550, 264, 45.98], [7000, 643, 88.98], [10500, 1286, 128.98]],
  },
  MYR: {
    confidence: 'low',
    note: 'From a third-party price guide for the post-2024 price change.',
    packs: [[475, 0, 18.65], [1000, 50, 38.39], [2050, 150, 74.99], [3650, 325, 130.39], [5350, 600, 185.99], [11000, 1500, 372.86]],
  },
  MXN: {
    confidence: 'high',
    note: 'Mexico has its own pack sizes.',
    packs: [[550, 0, 99], [1150, 200, 199], [2400, 500, 399], [4250, 900, 699], [6300, 1500, 1029], [12400, 2900, 1999]],
  },
  INR: {
    confidence: 'low',
    note: 'Sources give three different lists; this is the most likely current one.',
    packs: [[500, 0, 449], [1000, 50, 799], [2050, 150, 1599], [3650, 445, 2699], [5350, 600, 3999], [11000, 1620, 7900]],
  },
  BRL: {
    confidence: 'low',
    note: 'Probably the list from before the 2024 price change.',
    packs: [[475, 0, 16.9], [1200, 80, 39.9], [2300, 190, 74.9], [4400, 470, 139.9], [5500, 720, 169.9], [11500, 1670, 349.9]],
  },
  TRY: {
    confidence: 'low',
    note: 'The wiki does not say whether this is before or after the 2024 price change.',
    packs: [[475, 0, 155], [1000, 50, 310], [2050, 150, 620], [3650, 325, 1085], [5350, 600, 1550], [11000, 1475, 3100]],
  },
  IDR: {
    confidence: 'low',
    note: 'From a reseller that lists the official price.',
    packs: [[475, 0, 50000], [1000, 50, 100000], [2050, 150, 200000], [3650, 325, 350000], [5350, 600, 500000], [11000, 1500, 1000000]],
  },
  HKD: {
    confidence: 'low',
    note: 'From a reseller that lists the official price.',
    packs: [[475, 0, 40], [1000, 50, 80], [2050, 150, 160], [3650, 325, 280], [5350, 600, 400], [11000, 1500, 800]],
  },
  VND: {
    confidence: 'low',
    note: 'Card / ATM payment list; other payment methods give a different amount of VP for the same price.',
    packs: [[255, 5, 50000], [535, 35, 100000], [1090, 90, 200000], [2860, 360, 500000], [6160, 1160, 1000000], [12660, 2660, 2000000]],
  },
  HUF: {
    confidence: 'low',
    note: 'Probably the list from before the 2024 price change.',
    packs: [[500, 0, 1790], [1000, 30, 3490], [2050, 100, 6990], [3800, 230, 12790], [5350, 380, 17790], [11000, 1230, 34990]],
  },
  PLN: {
    confidence: 'low',
    note: 'Sources disagree; it is not stated which list is newer.',
    packs: [[475, 0, 21.49], [1000, 50, 42.99], [2050, 150, 85.49], [3650, 325, 149.99], [5350, 600, 213.99], [11000, 1475, 427.99]],
  },
  RON: {
    confidence: 'low',
    note: 'Probably the list from before the 2024 price change.',
    packs: [[475, 0, 24.99], [1000, 50, 49.99], [2050, 150, 99.99], [3650, 325, 174.49], [5350, 600, 248.99], [11000, 1475, 497.99]],
  },
};

export function hasRegionPrices(code: string): boolean {
  return code in REGION_PRICES;
}

/** Fraction digits to show: the currency's own, except estimates in big-number currencies (TWD, JPY...) which read better whole. */
export function decimalsFor(code: string, rate: number): number {
  if (!hasRegionPrices(code) && rate >= 10) return 0;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * The pack list for a currency: the region's real packs when known, otherwise the AUD packs
 * converted at `rate` (AUD -> code) and rounded to the currency's smallest unit.
 */
export function getPackSet(code: string, rate: number): PackSet {
  const decimals = decimalsFor(code, rate);
  const region = REGION_PRICES[code];
  if (region) {
    return { decimals, packs: region.packs.map(([vp, bonus, price]): VpPack => ({ vp, bonus, price })) };
  }
  const factor = 10 ** decimals;
  return {
    decimals,
    packs: REGION_PRICES.AUD.packs.map(([vp, bonus, aud]): VpPack => ({
      vp,
      bonus,
      price: Math.round(aud * rate * factor) / factor,
    })),
  };
}
