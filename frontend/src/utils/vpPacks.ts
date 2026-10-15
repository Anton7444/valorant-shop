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

export interface Purchase {
  vp: number;
  aud: number;
  packs: Map<VpPack, number>;
}

const cents = (aud: number) => Math.round(aud * 100);

// Most VP for a budget (unbounded knapsack over cents).
export function bestForBudget(budgetAud: number): Purchase {
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
