import { useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import { VP_PACKS, bestForBudget, cheapestForVp, type Purchase } from '../utils/vpPacks';

const money = (n: number) => `A$${n.toFixed(2)}`;

function PackList({ purchase }: { purchase: Purchase }) {
  const rows = [...purchase.packs].sort((a, b) => b[0].vp - a[0].vp);
  if (rows.length === 0) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs text-text-secondary">
      {rows.map(([pack, count]) => (
        <li key={pack.vp}>
          {count} × {pack.vp.toLocaleString()} VP ({money(pack.aud)})
        </li>
      ))}
    </ul>
  );
}

const inputClass =
  'w-full rounded-sm border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary/50 focus:border-accent-red';

// Public page: the VP pack price list (AUD) and a small calculator.
export default function PricesPage() {
  const [audText, setAudText] = useState('');
  const [vpText, setVpText] = useState('');

  const budget = Number(audText);
  const forBudget = useMemo(
    () => (Number.isFinite(budget) && budget >= 1 && budget <= 2000 ? bestForBudget(budget) : null),
    [budget],
  );
  const target = Number(vpText);
  const forVp = useMemo(
    () => (Number.isFinite(target) && target >= 1 && target <= 100000 ? cheapestForVp(Math.round(target)) : null),
    [target],
  );

  const bestRate = Math.min(...VP_PACKS.map((p) => p.aud / p.vp));

  return (
    <div className="min-h-dvh">
      <AppHeader />

      <main id="main" className="mx-auto max-w-4xl space-y-12 px-4 py-10">
        <section>
          <h2 className="font-display mb-1 text-xl uppercase tracking-[0.18em] text-text-primary">VP price list</h2>
          <p className="mb-5 text-xs text-text-secondary">Valorant Points packs in Australian dollars.</p>

          <div className="overflow-x-auto rounded-lg border border-border bg-bg-card">
            <table className="w-full min-w-[460px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-text-secondary">
                  <th className="px-4 py-3 font-semibold">Valorant Points</th>
                  <th className="px-4 py-3 font-semibold">Bonus</th>
                  <th className="px-4 py-3 text-right font-semibold">Price (AUD)</th>
                  <th className="px-4 py-3 text-right font-semibold">AUD / 100 VP</th>
                </tr>
              </thead>
              <tbody>
                {VP_PACKS.map((pack) => {
                  const rate = (pack.aud / pack.vp) * 100;
                  const isBest = pack.aud / pack.vp === bestRate;
                  return (
                    <tr key={pack.vp} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold text-text-primary">{pack.vp.toLocaleString()} VP</td>
                      <td className="px-4 py-3 text-text-secondary">{pack.bonus ? `+${pack.bonus.toLocaleString()}` : '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-text-primary">{money(pack.aud)}</td>
                      <td className={`px-4 py-3 text-right ${isBest ? 'text-accent-teal' : 'text-text-secondary'}`}>
                        {money(rate)}
                        {isBest && <span className="ml-2 text-[10px] uppercase tracking-wider">best value</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-text-secondary">
            Prices come from third-party price guides and can change or differ by payment method and store. Check the
            Riot store before you buy.
          </p>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-bg-card p-5">
            <h3 className="font-display mb-3 text-sm uppercase tracking-widest text-text-primary">AUD → VP</h3>
            <label className="mb-1 block text-xs text-text-secondary" htmlFor="aud-budget">
              How much do you want to spend (AUD)?
            </label>
            <input
              id="aud-budget"
              inputMode="decimal"
              value={audText}
              onChange={(e) => setAudText(e.target.value)}
              placeholder="e.g. 50"
              className={inputClass}
            />
            {forBudget && (
              <div className="mt-4">
                <div className="text-2xl font-semibold text-text-primary">{forBudget.vp.toLocaleString()} VP</div>
                <div className="text-xs text-text-secondary">
                  for {money(forBudget.aud)} (change left: {money(budget - forBudget.aud)})
                </div>
                <PackList purchase={forBudget} />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-bg-card p-5">
            <h3 className="font-display mb-3 text-sm uppercase tracking-widest text-text-primary">VP → AUD</h3>
            <label className="mb-1 block text-xs text-text-secondary" htmlFor="vp-target">
              How many VP do you need?
            </label>
            <input
              id="vp-target"
              inputMode="numeric"
              value={vpText}
              onChange={(e) => setVpText(e.target.value)}
              placeholder="e.g. 1775"
              className={inputClass}
            />
            {forVp && (
              <div className="mt-4">
                <div className="text-2xl font-semibold text-text-primary">{money(forVp.aud)}</div>
                <div className="text-xs text-text-secondary">
                  for {forVp.vp.toLocaleString()} VP ({(forVp.vp - Math.round(target)).toLocaleString()} VP left over)
                </div>
                <PackList purchase={forVp} />
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
