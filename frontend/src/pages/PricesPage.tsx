import { useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import ScrollFade from '../components/ScrollFade';
import CurrencyPicker from '../components/CurrencyPicker';
import { useCurrency, type CurrencyState } from '../utils/currency';
import { REGION_PRICES, getPackSet } from '../utils/regionPrices';
import {
  RP_PACKS,
  bestForBudget,
  bestRpForVp,
  cheapestForVp,
  cheapestVpForRp,
  type Purchase,
  type RpPurchase,
} from '../utils/vpPacks';

function PackList({ purchase, fx }: { purchase: Purchase; fx: CurrencyState }) {
  const rows = [...purchase.packs].sort((a, b) => b[0].vp - a[0].vp);
  if (rows.length === 0) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs text-text-secondary">
      {rows.map(([pack, count]) => (
        <li key={pack.vp}>
          {count} × {pack.vp.toLocaleString()} VP ({fx.money(pack.price)})
        </li>
      ))}
    </ul>
  );
}

function RpPackList({ purchase }: { purchase: RpPurchase }) {
  const rows = [...purchase.packs].sort((a, b) => b[0].rp - a[0].rp);
  if (rows.length === 0) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs text-text-secondary">
      {rows.map(([pack, count]) => (
        <li key={pack.rp}>
          {count} × {pack.rp} RP ({pack.vp.toLocaleString()} VP)
        </li>
      ))}
    </ul>
  );
}

const inputClass =
  'w-full rounded-sm border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary/50 focus:border-accent-red';

// Public page: the VP pack price list (AUD, convertible) and small calculators.
export default function PricesPage() {
  const fx = useCurrency();
  const [audText, setAudText] = useState('');
  const [vpText, setVpText] = useState('');

  const set = useMemo(() => getPackSet(fx.code, fx.rate), [fx.code, fx.rate]);
  const maxPrice = Math.max(...set.packs.map((p) => p.price));
  const minPrice = Math.min(...set.packs.map((p) => p.price));

  const budget = Number(audText); // in the selected currency
  const forBudget = useMemo(
    () =>
      Number.isFinite(budget) && budget >= minPrice && budget <= maxPrice * 10_000 ? bestForBudget(set, budget) : null,
    [budget, set, minPrice, maxPrice],
  );
  const target = Number(vpText);
  const forVp = useMemo(
    () => (Number.isFinite(target) && target >= 1 && target <= 100_000_000 ? cheapestForVp(set, Math.round(target)) : null),
    [target, set],
  );

  const [vpBudgetText, setVpBudgetText] = useState('');
  const [rpText, setRpText] = useState('');
  const vpBudget = Number(vpBudgetText);
  const rpForVp = useMemo(
    () => (Number.isFinite(vpBudget) && vpBudget >= 1600 && vpBudget <= 100_000_000 ? bestRpForVp(vpBudget) : null),
    [vpBudget],
  );
  const rpTarget = Number(rpText);
  const vpForRp = useMemo(
    () => (Number.isFinite(rpTarget) && rpTarget >= 1 && rpTarget <= 1_000_000 ? cheapestVpForRp(Math.round(rpTarget)) : null),
    [rpTarget],
  );
  const vpForRpPrice = useMemo(() => (vpForRp ? cheapestForVp(set, vpForRp.vp).price : null), [vpForRp, set]);

  const bestRate = Math.min(...set.packs.map((p) => p.price / p.vp));
  const region = REGION_PRICES[fx.code];

  return (
    <div className="min-h-dvh">
      <AppHeader />

      <main id="main" className="mx-auto max-w-4xl space-y-12 px-4 py-10">
        <section>
          <h2 className="font-display mb-1 text-xl uppercase tracking-[0.18em] text-text-primary">VP price list</h2>
          <p className="mb-5 text-xs text-text-secondary">
            Valorant Points packs in{' '}
            <CurrencyPicker code={fx.code} options={fx.options} onChange={fx.setCode} className="!px-1 text-xs font-semibold" />
            {fx.status === 'loading' && <span className="ml-1">(loading exchange rates…)</span>}
          </p>

          <ScrollFade className="rounded-lg border border-border bg-bg-card">
            <table className="w-full min-w-[460px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-text-secondary">
                  <th className="px-4 py-3 font-semibold">Valorant Points</th>
                  <th className="px-4 py-3 font-semibold">Bonus</th>
                  <th className="px-4 py-3 text-right font-semibold">Price ({fx.code})</th>
                  <th className="px-4 py-3 text-right font-semibold">{fx.code} / 100 VP</th>
                </tr>
              </thead>
              <tbody>
                {set.packs.map((pack) => {
                  const rate = (pack.price / pack.vp) * 100;
                  const isBest = pack.price / pack.vp === bestRate;
                  return (
                    <tr key={pack.vp} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold text-text-primary">{pack.vp.toLocaleString()} VP</td>
                      <td className="px-4 py-3 text-text-secondary">{pack.bonus ? `+${pack.bonus.toLocaleString()}` : '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-text-primary">{fx.money(pack.price)}</td>
                      <td className={`px-4 py-3 text-right ${isBest ? 'text-accent-teal' : 'text-text-secondary'}`}>
                        {fx.money(rate)}
                        {isBest && <span className="ml-2 text-[10px] uppercase tracking-wider">best value</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollFade>
          <p className="mt-3 text-xs leading-relaxed text-text-secondary">
            {region ? (
              <>
                Pack sizes and prices are those sold in this region ({region.confidence} confidence).
                {region.note && <> {region.note}</>}
              </>
            ) : (
              <>
                No regional price list for {fx.code} yet: these are the Australian packs converted at today's exchange
                rate, so they are estimates and Riot's real {fx.code} packs and prices may differ.
              </>
            )}{' '}
            Prices come from Riot's wiki and third-party guides and can change. Check the Riot store before you buy.
          </p>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-bg-card p-5">
            <h3 className="font-display mb-3 flex items-center gap-1 text-sm uppercase tracking-widest text-text-primary">
              <CurrencyPicker code={fx.code} options={fx.options} onChange={fx.setCode} className="-ml-1.5 !text-sm font-bold" />
              <span aria-hidden="true">→</span> VP
            </h3>
            <label className="mb-1 block text-xs text-text-secondary" htmlFor="aud-budget">
              How much do you want to spend ({fx.code})?
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
                  for {fx.money(forBudget.price)} (change left: {fx.money(Math.max(0, budget - forBudget.price))})
                </div>
                <PackList purchase={forBudget} fx={fx} />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-bg-card p-5">
            <h3 className="font-display mb-3 flex items-center gap-1 text-sm uppercase tracking-widest text-text-primary">
              VP <span aria-hidden="true">→</span>
              <CurrencyPicker code={fx.code} options={fx.options} onChange={fx.setCode} className="!text-sm font-bold" />
            </h3>
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
                <div className="text-2xl font-semibold text-text-primary">{fx.money(forVp.price)}</div>
                <div className="text-xs text-text-secondary">
                  for {forVp.vp.toLocaleString()} VP ({(forVp.vp - Math.round(target)).toLocaleString()} VP left over)
                </div>
                <PackList purchase={forVp} fx={fx} />
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="font-display mb-1 text-xl uppercase tracking-[0.18em] text-text-primary">Radianite price list</h2>
          <p className="mb-5 text-xs text-text-secondary">
            Radianite Points (RP) are bought with VP in the store and cannot be turned back into VP.
          </p>

          <ScrollFade className="rounded-lg border border-border bg-bg-card">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-text-secondary">
                  <th className="px-4 py-3 font-semibold">Radianite</th>
                  <th className="px-4 py-3 text-right font-semibold">Price (VP)</th>
                  <th className="px-4 py-3 text-right font-semibold">VP per RP</th>
                </tr>
              </thead>
              <tbody>
                {RP_PACKS.map((pack) => (
                  <tr key={pack.rp} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold text-accent-teal">{pack.rp} RP</td>
                    <td className="px-4 py-3 text-right font-semibold text-text-primary">{pack.vp.toLocaleString()} VP</td>
                    <td className="px-4 py-3 text-right text-text-secondary">{pack.vp / pack.rp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollFade>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-bg-card p-5">
            <h3 className="font-display mb-3 text-sm uppercase tracking-widest text-text-primary">VP → RP</h3>
            <label className="mb-1 block text-xs text-text-secondary" htmlFor="vp-budget">
              How many VP do you want to spend?
            </label>
            <input
              id="vp-budget"
              inputMode="numeric"
              value={vpBudgetText}
              onChange={(e) => setVpBudgetText(e.target.value)}
              placeholder="e.g. 5000 (smallest pack is 1600)"
              className={inputClass}
            />
            {rpForVp && (
              <div className="mt-4">
                <div className="text-2xl font-semibold text-accent-teal">{rpForVp.rp} RP</div>
                <div className="text-xs text-text-secondary">
                  for {rpForVp.vp.toLocaleString()} VP ({(Math.round(vpBudget) - rpForVp.vp).toLocaleString()} VP left)
                </div>
                <RpPackList purchase={rpForVp} />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-bg-card p-5">
            <h3 className="font-display mb-3 text-sm uppercase tracking-widest text-text-primary">RP → VP</h3>
            <label className="mb-1 block text-xs text-text-secondary" htmlFor="rp-target">
              How much Radianite do you need?
            </label>
            <input
              id="rp-target"
              inputMode="numeric"
              value={rpText}
              onChange={(e) => setRpText(e.target.value)}
              placeholder="e.g. 60"
              className={inputClass}
            />
            {vpForRp && (
              <div className="mt-4">
                <div className="text-2xl font-semibold text-text-primary">{vpForRp.vp.toLocaleString()} VP</div>
                <div className="text-xs text-text-secondary">
                  for {vpForRp.rp} RP ({vpForRp.rp - Math.round(rpTarget)} RP left over)
                  {vpForRpPrice !== null && <> · about {fx.money(vpForRpPrice)} in VP packs</>}
                </div>
                <RpPackList purchase={vpForRp} />
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
