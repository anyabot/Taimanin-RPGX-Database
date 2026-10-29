import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FilterChip, LoadState, Panel } from "@altterisk/game-hub";
import {
  ITEM_ICONS, RARITY, gachaArt, iconUrl, phaseOf, tr, unitName, useData, useLang, windowOf, type UnitIndexEntry,
} from "../data";
import { BundleImage } from "../bundleImage";
import {
  SR, draw, drawKey, emptyTally, rarityRates, unitRates,
  type GachaData, type GachaDraw, type Pull, type SimBanner, type Tally,
} from "../gacha";

const pct = (v: number) => `${v < 0.1 ? v.toFixed(3) : v < 1 ? v.toFixed(2) : +v.toFixed(2)}%`;
// pulls an SR took: at 3% one comes every 33 pulls on average
const gapTone = (gap: number) => (gap <= 20 ? "good" : gap <= 50 ? "ok" : "bad");
const drawName = (d: GachaDraw) => (d.n === 1 ? "Single pull" : `${d.n}-pull`);

/** Gacha simulator: the game's own rates and lineups per banner; ?id= picks a banner. */
export default function GachaSim() {
  const lang = useLang();
  const { data, loading, error } = useData<GachaData>("gacha");
  const { data: unitList } = useData<UnitIndexEntry[]>("units/index");
  const units = useMemo(() => new Map((unitList ?? []).map((u) => [u.id, u])), [unitList]);
  const [params, setParams] = useSearchParams();
  const [tallies, setTallies] = useState<Record<number, Tally>>({});
  const [results, setResults] = useState<Pull[] | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [round, setRound] = useState(0);
  const [showOld, setShowOld] = useState(false);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [variantPick, setVariantPick] = useState<Record<number, number>>({});
  const [selectPick, setSelectPick] = useState<Record<number, string>>({});

  if (!data) return <LoadState loading={loading} error={error} />;

  const live = (b: SimBanner) => b.type === "Permanent" || phaseOf(b.start, b.end) !== "ended";
  const banner = data.banners.find((b) => String(b.id) === params.get("id"))
    ?? data.banners.find((b) => b.type !== "Permanent" && live(b)) ?? data.banners[0];
  const tally = tallies[banner.id] ?? emptyTally();
  const shown = data.banners.filter((b) => showOld || live(b) || b.id === banner.id);
  const oldCount = data.banners.filter((b) => !live(b)).length;

  const name = (id: string) => { const u = units.get(id); return u ? unitName(u, lang) : id; };
  // several versions of a character share a name; the title tells them apart
  const full = (id: string) => { const u = units.get(id); return u ? `${tr(u.title, lang)} ${unitName(u, lang)}`.trim() : id; };
  const choose = (id: number) => {
    const n = new URLSearchParams(params);
    n.set("id", String(id));
    setParams(n, { replace: true });
    setResults(null);
  };

  // the draws on offer: regular buttons grouped by odds (payment variants can differ), a step, a pick-up select
  const variants: GachaDraw[][] = [];
  for (const d of banner.draws) {
    const v = variants.find((x) => x[0].rate === d.rate && x[0].lineup === d.lineup && !!x[0].limit === !!d.limit && !!x[0].daily === !!d.daily);
    if (v) v.push(d); else variants.push([d]);
  }
  const variant = variants[Math.min(variantPick[banner.id] ?? 0, variants.length - 1)] ?? [];
  const steps = banner.steps ?? [];
  const stepAt = steps.length ? tally.step % steps.length : 0;
  const sel = banner.select?.find((s) => s.unit === selectPick[banner.id]) ?? banner.select?.[0];
  const shownDraw = variant[0] ?? steps[stepAt]?.[0] ?? sel?.draws[0];
  const featured = new Set(Object.keys((shownDraw && data.lineups[shownDraw.lineup]?.up) ?? {}));

  const run = (d: GachaDraw, where: string) => {
    const key = drawKey(d, where);
    const { pulls, tally: next } = draw(data, d, tally, key);
    if (where === "step") next.step = tally.step + 1;
    setTallies((all) => ({ ...all, [banner.id]: next }));
    const seen = new Set(owned);
    const newly = new Set<number>();
    pulls.forEach((p, i) => { if (!seen.has(p.unit)) newly.add(i); seen.add(p.unit); });
    setOwned(seen);
    setFresh(newly);
    setResults(pulls);
    setRound((r) => r + 1);
  };
  const usedUp = (d: GachaDraw, where: string) => !!d.limit && (tally.used[drawKey(d, where)] ?? 0) >= d.limit;
  const reset = () => { setTallies((all) => ({ ...all, [banner.id]: emptyTally() })); setResults(null); };
  const resetAll = () => { setTallies({}); setOwned(new Set()); setFresh(new Set()); setResults(null); };

  const session = Object.entries(tallies).reduce((acc, [id, t]) => {
    const b = data.banners.find((x) => x.id === Number(id));
    acc.pulls += t.pulls;
    acc.srs += t.srs.length;
    if (b?.type !== "Permanent") {
      acc.ratedSrs += t.srs.length;
      acc.ups += t.srs.filter((s) => s.up).length;
    }
    return acc;
  }, { pulls: 0, srs: 0, ratedSrs: 0, ups: 0 });

  const w = windowOf(banner.start, banner.end);
  const rates = shownDraw ? unitRates(data, shownDraw) : [];
  const mileage = banner.mileage;
  const top = mileage ? mileage.rewards[mileage.rewards.length - 1].need : 0;
  const laps = mileage && top ? Math.min(Math.floor(tally.points / top), mileage.loop) : 0;
  const lapPoints = mileage && top && laps < mileage.loop ? tally.points - laps * top : tally.points;

  return (
    <div className="gacha-sim">
      <div className="sim-head">
        <h1>Gacha simulator</h1>
        <button className="hub-btn" onClick={resetAll}>Reset everything</button>
      </div>
      <p className="muted">Pulls use the game's own odds and lineups for each banner, the same numbers its rate list shows.
        Nothing here touches your account.</p>

      <div className="sim-banners">
        {shown.map((b) => {
          const icon = b.select?.[0]?.unit ?? Object.keys(data.lineups[(b.draws[0] ?? b.steps?.[0]?.[0])?.lineup ?? 0]?.up ?? {})[0];
          return (
            <FilterChip key={b.id} active={b.id === banner.id} onClick={() => choose(b.id)}>
              {icon && <img src={iconUrl(icon)} alt="" width={20} height={20} className="sim-chip-icon" />}
              <span lang={b.title?.en && lang === "en" ? "en" : "ja"}>{tr(b.title, lang)}</span>
              {b.type !== "Permanent" && live(b) && <span className="hub-badge event-phase running">Live</span>}
            </FilterChip>
          );
        })}
        {oldCount > 0 && (
          <FilterChip onClick={() => setShowOld((v) => !v)} active={showOld}>Ended banners ({oldCount}) {showOld ? "▴" : "▾"}</FilterChip>
        )}
      </div>

      <Panel>
        <div className="sim-banner">
          <BundleImage stem={gachaArt(banner.image)} className="sim-art" />
          <div className="sim-banner-body">
            <h2 lang={banner.title?.en && lang === "en" ? "en" : "ja"}>
              <Link to={`/banners?id=${banner.id}`}>{tr(banner.title, lang)}</Link>
            </h2>
            <p className="muted small">
              {banner.type}{w.end ? ` · ${w.start ? `${w.start} – ` : "until "}${w.end}` : " · always open"}
            </p>
            {shownDraw && (
              <p className="sim-rates">
                {rarityRates(data, shownDraw).map(([r, v]) => (
                  <span key={r} className={`rar-${r}`}>{RARITY[r]} {pct(v)}</span>
                ))}
                {[...featured].map((u) => {
                  const v = rates.flatMap((g) => g.units).find(([x]) => x === u)?.[1] ?? 0;
                  return <span key={u} className="sim-up">{name(u)} {pct(v)}</span>;
                })}
                <button className="link-btn" onClick={() => setRatesOpen((v) => !v)}>{ratesOpen ? "Hide rates" : "All rates"}</button>
              </p>
            )}
          </div>
        </div>

        {ratesOpen && shownDraw && (
          <div className="sim-rate-table">
            {rates.map((g) => (
              <div key={g.rarity}>
                <h3 className={`rar-${g.rarity}`}>{RARITY[g.rarity]} {pct(g.share)} · {g.units.length} units</h3>
                <ul>
                  {[...g.units].sort((a, b) => b[1] - a[1]).map(([u, v, up]) => (
                    <li key={u} className={up ? "sim-up" : undefined} title={full(u)}>
                      <img src={iconUrl(u)} alt="" width={20} height={20} loading="lazy" />
                      <span lang="ja">{name(u)}</span><span className="muted">{pct(v)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {shownDraw.hr && (
              <p className="muted small sim-note">The {shownDraw.n}-pull's last unit is HR or better. The game does not list
                that slot's odds; here it is {rarityRates(data, shownDraw, true).map(([r, v]) => `${RARITY[r]} ${pct(v)}`).join(" / ")},
                the split of the game's HR-guaranteed gacha, which moves R's share to HR.</p>
            )}
          </div>
        )}

        {variants.length > 1 && (
          <div className="sim-row">
            <span className="muted small">Variant</span>
            {variants.map((v, i) => (
              <FilterChip key={i} active={v === variant} onClick={() => setVariantPick((all) => ({ ...all, [banner.id]: i }))}>
                {[...new Set(v.flatMap((d) => d.labels ?? []))].join(" / ") || `Variant ${i + 1}`} · SR {pct(data.rates[v[0].rate]?.[SR] ?? 0)}
              </FilterChip>
            ))}
          </div>
        )}

        <div className="sim-row">
          {variant.map((d) => (
            <button key={drawKey(d, "draw")} className="hub-btn sim-pull" disabled={usedUp(d, "draw")} onClick={() => run(d, "draw")}>
              {usedUp(d, "draw") ? `${drawName(d)}: used up` : drawName(d)}
              {d.limit ? <small> {tally.used[drawKey(d, "draw")] ?? 0}/{d.limit}</small> : d.daily ? <small> once a day</small> : null}
            </button>
          ))}
          {steps.length > 0 && (
            <>
              {steps[stepAt].map((d) => (
                <button key={drawKey(d, "step")} className="hub-btn sim-pull" onClick={() => run(d, "step")}>
                  Step {stepAt + 1}/{steps.length}: {drawName(d)}{d.hr ? " (HR+ slot)" : ""}
                </button>
              ))}
              {tally.step >= steps.length && <span className="muted small">Steps done; drawing them again for the simulation.</span>}
            </>
          )}
          <span className="sim-grow" />
          <button className="hub-btn" onClick={reset}>Reset banner</button>
        </div>

        {banner.select && sel && (
          <div className="sim-row">
            <span className="muted small">Pick-up select</span>
            {banner.select.map((s) => (
              <FilterChip key={s.unit} active={s === sel} onClick={() => setSelectPick((all) => ({ ...all, [banner.id]: s.unit }))}>
                <img src={iconUrl(s.unit)} alt="" width={20} height={20} className="sim-chip-icon" /> <span lang="ja">{name(s.unit)}</span>
              </FilterChip>
            ))}
            {sel.draws.map((d) => (
              <button key={drawKey(d, `sel${sel.unit}`)} className="hub-btn sim-pull" disabled={usedUp(d, `sel${sel.unit}`)}
                onClick={() => run(d, `sel${sel.unit}`)}>
                {drawName(d)}{d.limit ? <small> {tally.used[drawKey(d, `sel${sel.unit}`)] ?? 0}/{d.limit}</small> : null}
              </button>
            ))}
          </div>
        )}

        <p className="sim-stats">
          <span>{tally.pulls} pulls</span>
          {[4, 3, 2].map((r) => {
            const n = Object.entries(tally.got).filter(([u]) => rates.find((g) => g.rarity === r)?.units.some(([x]) => x === u))
              .reduce((s, [, k]) => s + k, 0);
            return <span key={r} className={`rar-${r}`}>{RARITY[r]} {n}</span>;
          })}
          {tally.pulls > 0 && <span>{tally.sinceSr} since the last SR</span>}
        </p>
        {banner.bonus && <p className="muted small">{banner.bonus}</p>}

        {mileage && (
          <div className="sim-mileage">
            <p className="small">Mileage: <b>{lapPoints}</b> / {top} points{laps > 0 ? ` · ${laps} full ${laps === 1 ? "lap" : "laps"}` : ""}
              <span className="muted"> (one point per unit drawn is assumed; the server counts them)</span></p>
            <ul>
              {mileage.rewards.map((r) => (
                <li key={r.need} className={lapPoints >= r.need || laps > 0 ? "done" : undefined}>
                  <span className="sim-need">{r.need}</span>
                  {r.unit
                    ? <Link to={`/units/${r.unit}`}><img src={iconUrl(r.unit)} alt="" width={28} height={28} /> <span lang="ja">{name(r.unit)}</span></Link>
                    : <Link to={`/items/${r.item}`}>
                        {r.icon && <BundleImage stem={ITEM_ICONS} name={`${r.icon}_s`} width={28} height={28} className="item-icon" />}
                        <span>{tr(r.name ?? null, lang) || r.item}</span>
                      </Link>}
                  {r.num > 1 && <span className="muted">×{r.num}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {results && (
        <div className="sim-results" key={round}>
          {results.map((p, i) => (
            <Link key={i} to={`/units/${p.unit}`} style={{ animationDelay: `${i * 60}ms` }} title={full(p.unit)}
              className={`sim-card rar-${p.rarity}${p.up ? " up" : ""}`}>
              {fresh.has(i) && <span className="sim-new">NEW</span>}
              <img src={iconUrl(p.unit)} alt="" width={64} height={64} />
              <span className={`sim-rar rar-${p.rarity}`}>{RARITY[p.rarity]}</span>
              <span className="sim-name" lang="ja">{name(p.unit)}</span>
            </Link>
          ))}
        </div>
      )}

      {session.pulls > 0 && (
        <Panel title="This session">
          <p className="sim-stats">
            <span>{session.pulls} pulls</span>
            <span className="rar-4">SR {session.srs}</span>
            <span>SR rate {pct((100 * session.srs) / session.pulls)}</span>
            <span>{session.srs ? (session.pulls / session.srs).toFixed(1) : "—"} pulls per SR</span>
            {session.ratedSrs > 0 && <span className="sim-up">Rate-up {session.ups}/{session.ratedSrs} of SRs on limited banners</span>}
          </p>
        </Panel>
      )}

      {tally.srs.length > 0 && (
        <Panel title="SRs on this banner, with the pulls each took">
          <ul className="sim-log">
            {tally.srs.map((s, i) => (
              <li key={i} className={s.up ? "up" : undefined} title={full(s.unit)}>
                <img src={iconUrl(s.unit)} alt="" width={24} height={24} />
                <span lang="ja">{name(s.unit)}</span>
                <span className={`sim-gap ${gapTone(s.gap)}`}>{s.gap}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {Object.keys(tally.got).length > 0 && (
        <Panel title="Pulled on this banner">
          <ul className="sim-log">
            {Object.entries(tally.got)
              .map(([u, n]) => [u, n, rates.find((g) => g.units.some(([x]) => x === u))?.rarity ?? 0] as const)
              .sort((a, b) => b[2] - a[2] || b[1] - a[1])
              .map(([u, n, r]) => (
                <li key={u} title={full(u)}>
                  <img src={iconUrl(u)} alt="" width={24} height={24} />
                  <span className={`rar-${r}`}>{RARITY[r]}</span>
                  <span lang="ja">{name(u)}</span>
                  <span className="muted">×{n}</span>
                </li>
              ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
