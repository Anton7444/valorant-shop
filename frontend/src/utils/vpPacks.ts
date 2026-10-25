// Valorant Points packs. Each region sells its own pack sizes in its own currency, so every
// calculation works on a PackSet (see regionPrices.ts) instead of one global price list.
export interface VpPack {
  vp: number; // total VP received, bonus included
  bonus: number; // part of `vp` that is bonus
  price: number; // in the PackSet's currency
}

export interface PackSet {
  packs: VpPack[];
  decimals: number; // fraction digits of the currency (KRW 0, USD 2)
}

export interface Purchase {
  vp: number;
  price: number;
  packs: Map<VpPack, number>;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

// Prices as whole numbers of the smallest step (cents, or e.g. 50,000 IDR when every pack is a
// multiple of that) so the dynamic programming tables stay small.
function stepOf(set: PackSet) {
  const scale = 10 ** set.decimals;
  const units = set.packs.map((p) => Math.round(p.price * scale));
  const step = units.reduce(gcd, 0) || 1;
  return { scale, step, cost: (pack: VpPack) => Math.round(pack.price * scale) / step };
}

// The pack with the lowest price per VP: for large amounts buy it in bulk and solve only the
// (small) remainder exactly. Keeping a few packs back for the exact step makes the result match
// a full optimisation.
function bigPack(set: PackSet): VpPack {
  return set.packs.reduce((best, p) => (p.price / p.vp < best.price / best.vp ? p : best));
}
const KEEP_BACK = 3;

function mergePurchases(a: Purchase, b: Purchase, set: PackSet): Purchase {
  const packs = new Map(a.packs);
  for (const [pack, n] of b.packs) packs.set(pack, (packs.get(pack) ?? 0) + n);
  const scale = 10 ** set.decimals;
  return { vp: a.vp + b.vp, price: Math.round((a.price + b.price) * scale) / scale, packs };
}

function bulk(n: number, big: VpPack): Purchase {
  return { vp: n * big.vp, price: n * big.price, packs: n > 0 ? new Map([[big, n]]) : new Map() };
}

// Most VP for a budget (unbounded knapsack).
export function bestForBudget(set: PackSet, budget: number): Purchase {
  const big = bigPack(set);
  const n = Math.max(0, Math.floor(budget / big.price) - KEEP_BACK);
  return mergePurchases(bulk(n, big), bestForBudgetExact(set, budget - n * big.price), set);
}

function bestForBudgetExact(set: PackSet, budgetAmount: number): Purchase {
  const { scale, step, cost } = stepOf(set);
  const budget = Math.floor(Math.round(budgetAmount * scale) / step);
  const best: { vp: number; pick: number }[] = Array.from({ length: budget + 1 }, () => ({ vp: 0, pick: -1 }));
  for (let b = 1; b <= budget; b++) {
    best[b] = { vp: best[b - 1].vp, pick: -2 }; // carry over the previous best (unused change)
    set.packs.forEach((pack, i) => {
      const c = cost(pack);
      if (c <= b && best[b - c].vp + pack.vp > best[b].vp) {
        best[b] = { vp: best[b - c].vp + pack.vp, pick: i };
      }
    });
  }
  const packs = new Map<VpPack, number>();
  let b = budget;
  while (b > 0 && best[b].vp > 0) {
    if (best[b].pick === -2) {
      b -= 1;
      continue;
    }
    const pack = set.packs[best[b].pick];
    packs.set(pack, (packs.get(pack) ?? 0) + 1);
    b -= cost(pack);
  }
  return totalOf(set, packs);
}

function totalOf(set: PackSet, packs: Map<VpPack, number>): Purchase {
  const scale = 10 ** set.decimals;
  let vp = 0;
  let price = 0;
  for (const [pack, n] of packs) {
    vp += pack.vp * n;
    price += pack.price * n;
  }
  return { vp, price: Math.round(price * scale) / scale, packs };
}

// Cheapest way to reach at least `targetVp`.
export function cheapestForVp(set: PackSet, targetVp: number): Purchase {
  const big = bigPack(set);
  const n = Math.max(0, Math.floor(targetVp / big.vp) - KEEP_BACK);
  return mergePurchases(bulk(n, big), cheapestForVpExact(set, targetVp - n * big.vp), set);
}

function cheapestForVpExact(set: PackSet, targetVp: number): Purchase {
  const { cost: unitCost } = stepOf(set);
  const max = targetVp + Math.max(...set.packs.map((p) => p.vp));
  const cost: number[] = Array(max + 1).fill(Infinity);
  const pick: number[] = Array(max + 1).fill(-1);
  cost[0] = 0;
  for (let v = 1; v <= max; v++) {
    set.packs.forEach((pack, i) => {
      const c = cost[Math.max(0, v - pack.vp)] + unitCost(pack);
      if (c < cost[v]) {
        cost[v] = c;
        pick[v] = i;
      }
    });
  }
  let end = targetVp;
  for (let v = targetVp; v <= max; v++) if (cost[v] < cost[end]) end = v;
  const packs = new Map<VpPack, number>();
  let v = end;
  while (v > 0) {
    const pack = set.packs[pick[v]];
    packs.set(pack, (packs.get(pack) ?? 0) + 1);
    v = Math.max(0, v - pack.vp);
  }
  return totalOf(set, packs);
}

// Radianite Points packs, bought with VP in the store (VP cannot be recovered).
export interface RpPack {
  rp: number;
  vp: number;
}

export const RP_PACKS: RpPack[] = [
  { rp: 20, vp: 1600 },
  { rp: 40, vp: 2800 },
  { rp: 80, vp: 4800 },
];

export interface RpPurchase {
  rp: number;
  vp: number;
  packs: Map<RpPack, number>;
}

function summarize(picks: number[]): RpPurchase {
  const packs = new Map<RpPack, number>();
  for (const i of picks) packs.set(RP_PACKS[i], (packs.get(RP_PACKS[i]) ?? 0) + 1);
  const total = picks.reduce((acc, i) => ({ rp: acc.rp + RP_PACKS[i].rp, vp: acc.vp + RP_PACKS[i].vp }), {
    rp: 0,
    vp: 0,
  });
  return { ...total, packs };
}

// Most RP for a VP budget. VP is a multiple of 100 in every pack, so work in hundreds.
function bestRpForVpExact(vpBudget: number): RpPurchase {
  const budget = Math.floor(vpBudget / 100);
  const rp: number[] = Array(budget + 1).fill(0);
  const pick: number[] = Array(budget + 1).fill(-1); // -1 carries over the previous value
  for (let b = 1; b <= budget; b++) {
    rp[b] = rp[b - 1];
    RP_PACKS.forEach((pack, i) => {
      const c = pack.vp / 100;
      if (c <= b && rp[b - c] + pack.rp > rp[b]) {
        rp[b] = rp[b - c] + pack.rp;
        pick[b] = i;
      }
    });
  }
  const picks: number[] = [];
  let b = budget;
  while (b > 0 && rp[b] > 0) {
    if (pick[b] === -1) {
      b -= 1;
      continue;
    }
    picks.push(pick[b]);
    b -= RP_PACKS[pick[b]].vp / 100;
  }
  return summarize(picks);
}

// Cheapest (in VP) way to reach at least `targetRp`.
function cheapestVpForRpExact(targetRp: number): RpPurchase {
  const max = targetRp + Math.max(...RP_PACKS.map((p) => p.rp));
  const cost: number[] = Array(max + 1).fill(Infinity);
  const pick: number[] = Array(max + 1).fill(-1);
  cost[0] = 0;
  for (let r = 1; r <= max; r++) {
    RP_PACKS.forEach((pack, i) => {
      const c = cost[Math.max(0, r - pack.rp)] + pack.vp;
      if (c < cost[r]) {
        cost[r] = c;
        pick[r] = i;
      }
    });
  }
  let end = targetRp;
  for (let r = targetRp; r <= max; r++) if (cost[r] < cost[end]) end = r;
  const picks: number[] = [];
  let r = end;
  while (r > 0) {
    picks.push(pick[r]);
    r = Math.max(0, r - RP_PACKS[pick[r]].rp);
  }
  return summarize(picks);
}

const BIG_RP = RP_PACKS[RP_PACKS.length - 1];

function mergeRp(a: RpPurchase, b: RpPurchase): RpPurchase {
  const packs = new Map(a.packs);
  for (const [pack, n] of b.packs) packs.set(pack, (packs.get(pack) ?? 0) + n);
  return { rp: a.rp + b.rp, vp: a.vp + b.vp, packs };
}

function bulkRp(n: number): RpPurchase {
  return { rp: n * BIG_RP.rp, vp: n * BIG_RP.vp, packs: n > 0 ? new Map([[BIG_RP, n]]) : new Map() };
}

export function bestRpForVp(vpBudget: number): RpPurchase {
  const n = Math.max(0, Math.floor(vpBudget / BIG_RP.vp) - KEEP_BACK);
  return mergeRp(bulkRp(n), bestRpForVpExact(vpBudget - n * BIG_RP.vp));
}

export function cheapestVpForRp(targetRp: number): RpPurchase {
  const n = Math.max(0, Math.floor(targetRp / BIG_RP.rp) - KEEP_BACK);
  return mergeRp(bulkRp(n), cheapestVpForRpExact(targetRp - n * BIG_RP.rp));
}
