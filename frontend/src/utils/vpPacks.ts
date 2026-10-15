// Valorant Points packs sold in the Australian store (prices in AUD).
// Reported by third-party price guides and may change: confirm in the Riot store.
export interface VpPack {
  vp: number; // total VP received, bonus included
  bonus: number; // part of `vp` that is bonus
  aud: number;
}

export const VP_PACKS: VpPack[] = [
  { vp: 475, bonus: 0, aud: 7.25 },
  { vp: 1000, bonus: 50, aud: 14.75 },
  { vp: 2050, bonus: 100, aud: 30 },
  { vp: 3650, bonus: 150, aud: 52 },
  { vp: 5350, bonus: 350, aud: 74 },
  { vp: 11000, bonus: 1000, aud: 148 },
];

// Packs get cheaper per VP as they get bigger, so for large amounts buy the biggest
// pack in bulk and solve only the (small) remainder exactly. Keeping a few packs
// back for the exact step makes the result match a full optimisation.
const BIG_VP = VP_PACKS[VP_PACKS.length - 1];
const KEEP_BACK = 3;

function mergePurchases(a: Purchase, b: Purchase): Purchase {
  const packs = new Map(a.packs);
  for (const [pack, n] of b.packs) packs.set(pack, (packs.get(pack) ?? 0) + n);
  return { vp: a.vp + b.vp, aud: Math.round((a.aud + b.aud) * 100) / 100, packs };
}

function bulk(n: number): Purchase {
  return {
    vp: n * BIG_VP.vp,
    aud: Math.round(n * BIG_VP.aud * 100) / 100,
    packs: n > 0 ? new Map([[BIG_VP, n]]) : new Map(),
  };
}

export interface Purchase {
  vp: number;
  aud: number;
  packs: Map<VpPack, number>;
}

const cents = (aud: number) => Math.round(aud * 100);

// Most VP for a budget (unbounded knapsack over cents).
export function bestForBudget(budgetAud: number): Purchase {
  const n = Math.max(0, Math.floor(budgetAud / BIG_VP.aud) - KEEP_BACK);
  return mergePurchases(bulk(n), bestForBudgetExact(budgetAud - n * BIG_VP.aud));
}

function bestForBudgetExact(budgetAud: number): Purchase {
  const budget = cents(budgetAud);
  const best: { vp: number; spent: number; pick: number }[] = Array.from({ length: budget + 1 }, () => ({
    vp: 0,
    spent: 0,
    pick: -1,
  }));
  for (let b = 1; b <= budget; b++) {
    best[b] = { ...best[b - 1], pick: -2 }; // carry over the previous best (unused change)
    VP_PACKS.forEach((pack, i) => {
      const c = cents(pack.aud);
      if (c <= b && best[b - c].vp + pack.vp > best[b].vp) {
        best[b] = { vp: best[b - c].vp + pack.vp, spent: best[b - c].spent + c, pick: i };
      }
    });
  }
  return rebuild(best, budget);
}

function rebuild(best: { vp: number; spent: number; pick: number }[], from: number): Purchase {
  const packs = new Map<VpPack, number>();
  let b = from;
  while (b > 0 && best[b].vp > 0) {
    if (best[b].pick === -2) {
      b -= 1;
      continue;
    }
    const pack = VP_PACKS[best[b].pick];
    packs.set(pack, (packs.get(pack) ?? 0) + 1);
    b -= cents(pack.aud);
  }
  const total = [...packs].reduce((acc, [pack, n]) => ({ vp: acc.vp + pack.vp * n, aud: acc.aud + pack.aud * n }), {
    vp: 0,
    aud: 0,
  });
  return { ...total, aud: Math.round(total.aud * 100) / 100, packs };
}

// Cheapest way to reach at least `targetVp`.
export function cheapestForVp(targetVp: number): Purchase {
  const n = Math.max(0, Math.floor(targetVp / BIG_VP.vp) - KEEP_BACK);
  return mergePurchases(bulk(n), cheapestForVpExact(targetVp - n * BIG_VP.vp));
}

function cheapestForVpExact(targetVp: number): Purchase {
  const max = targetVp + Math.max(...VP_PACKS.map((p) => p.vp));
  const cost: number[] = Array(max + 1).fill(Infinity);
  const pick: number[] = Array(max + 1).fill(-1);
  cost[0] = 0;
  for (let v = 1; v <= max; v++) {
    VP_PACKS.forEach((pack, i) => {
      const prev = Math.max(0, v - pack.vp);
      const c = cost[prev] + cents(pack.aud);
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
    const pack = VP_PACKS[pick[v]];
    packs.set(pack, (packs.get(pack) ?? 0) + 1);
    v = Math.max(0, v - pack.vp);
  }
  const vp = [...packs].reduce((sum, [pack, n]) => sum + pack.vp * n, 0);
  return { vp, aud: cost[end] / 100, packs };
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
