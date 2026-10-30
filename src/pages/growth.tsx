import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LevelControl, Panel } from "@altterisk/game-hub";
import { tr, useData, useLang, type Growth, type Unit, type UnitForm } from "../data";
import { EffectList } from "../components";
import { BundleImage } from "../bundleImage";

/* Abilities (levels 1-9) and Bloom (才能開花・特化), from tables.py export_growth
   and each unit's "abilities" / "bloom". */

const ITEM_ICONS = "image_item_s_assets_all";
const fmt = (n: number) => n.toLocaleString();

/** One ability slot: both slots are active in battle at once. */
export function AbilityPanel({ a, growth }: { a: Unit["abilities"][number]; growth: Growth | null }) {
  const lang = useLang();
  const max = a.levels.length;
  const [lv, setLv] = useState(max);
  const row = a.levels.find((x) => x.level === lv) ?? a.levels[a.levels.length - 1];
  // EXP from Lv1 to the chosen level (AbilityExps: level -> EXP to reach it)
  const exp = growth ? a.levels.filter((x) => x.level > 1 && x.level <= lv)
    .reduce((n, x) => n + (growth.abilityExp[String(x.level)] ?? 0), 0) : 0;
  return (
    <Panel title={<>Ability {a.slot} · <span lang="ja">{tr(a.name, lang)}</span></>}
      note={a.release.type === 0 ? "Unlocked when you get the unit, already at its top level."
        : `Unlock: ${fmt(a.release.exp)} EXP (needs max level and max awakening).`}>
      {max > 1 && <LevelControl label="Ability level" value={lv} min={1} max={max} onChange={setLv} marks={[1, max]} />}
      <p className="skill-detail" lang="ja">{tr(row.description, lang)}</p>
      {row.effects.length > 0 && <div className="skill-effects"><EffectList effects={row.effects} /></div>}
      {max > 1 && lv > 1 && <p className="muted small">Lv 1 → {lv}: {fmt(exp)} EXP</p>}
    </Panel>
  );
}

const BLOOM_STATS: [number, keyof UnitForm["stats"], string][] = [[1, "hp", "HP"], [2, "sp", "SP"], [3, "atk", "ATK"], [4, "def", "DEF"], [5, "spd", "SPD"]];
const BONUS_LABEL: Record<number, string> = { 6: "CRI", 7: "SP gain" };
const MAX_STAT_LV = 30;

/** In-game Bloom screen as a calculator: Bloom level gives points; points buy stat levels. */
export function BloomTab({ unit, form }: { unit: Unit; form: UnitForm }) {
  const { data: growth } = useData<Growth>("growth");
  const lang = useLang();
  const b = unit.bloom;
  const pointsTable = growth && b ? growth.bloom.points[String(b.points)] ?? [] : [];
  const maxBloom = pointsTable.length || 50;
  const [bloomLv, setBloomLv] = useState(maxBloom);
  const [levels, setLevels] = useState<Record<number, number>>({});
  const status = useMemo(() => (growth && b ? growth.bloom.status.filter((s) => s.table === b.status) : []), [growth, b]);
  const bonus = useMemo(() => (growth && b ? growth.bloom.bonus.filter((s) => s.table === b.bonus) : []), [growth, b]);
  if (!b) return <p className="muted">This unit has no Bloom.</p>;
  if (!growth) return <p className="muted">Loading…</p>;

  const step = (stat: number, lv: number) => status.find((s) => s.stat === stat && lv >= s.from && lv <= s.to);
  const cost = (stat: number, lv: number) => { let n = 0; for (let i = 1; i <= lv; i++) n += step(stat, i)?.cost ?? 0; return n; };
  const gain = (stat: number, lv: number) => { let n = 0; for (let i = 1; i <= lv; i++) n += step(stat, i)?.gain ?? 0; return n; };
  const points = pointsTable.slice(0, bloomLv).reduce((a, x) => a + x, 0);
  const used = BLOOM_STATS.reduce((n, [s]) => n + cost(s, levels[s] ?? 0), 0);
  const bonusTotal = (kind: number) => bonus.filter((x) => x.bonus === kind && (levels[x.stat] ?? 0) >= x.level).reduce((n, x) => n + x.value, 0);
  const set = (stat: number, lv: number) => {
    const next = Math.max(0, Math.min(MAX_STAT_LV, lv));
    const extra = cost(stat, next) - cost(stat, levels[stat] ?? 0);
    if (extra > 0 && used + extra > points) return;
    setLevels({ ...levels, [stat]: next });
  };
  // materials and gold for Bloom Lv 1..bloomLv
  const gold = (growth.bloom.gold[String(b.gold)] ?? []).slice(0, bloomLv).reduce((a, x) => a + x, 0);
  const mats = new Map<string, number>();
  for (const [lv, item, num] of b.items) if (lv <= bloomLv) mats.set(item, (mats.get(item) ?? 0) + num);

  return (
    <>
      <Panel title="Bloom" note="Needs max level and max awakening. Bloom levels give points; points raise stats (up to Lv 30 each). Reset is free in game.">
        <LevelControl label="Bloom level" value={bloomLv} min={0} max={maxBloom} marks={[0, maxBloom]}
          onChange={(v) => { setBloomLv(v); setLevels({}); }} />
        <p className="bloom-points"><b>{fmt(points - used)}</b> / {fmt(points)} points left
          <button className="hub-button bloom-reset" onClick={() => setLevels({})}>Reset</button></p>
        <div className="bloom-scroll"><table className="hub-table bloom-table">
          <thead><tr><th>Stat</th><th>Value</th><th>Level</th><th>Points</th><th>Bonuses at</th></tr></thead>
          <tbody>
            {BLOOM_STATS.map(([s, key, label]) => {
              const lv = levels[s] ?? 0;
              const base = form.stats[key][1];
              const next = step(s, lv + 1);
              return (
                <tr key={s}>
                  <th scope="row">{label}</th>
                  <td>{fmt(base)}{lv > 0 && <> → <b>{fmt(base + gain(s, lv))}</b></>}</td>
                  <td className="bloom-level">
                    <button className="hub-button" onClick={() => set(s, lv - 1)} disabled={lv === 0} aria-label={`${label} down`}>−</button>
                    <span>{lv}</span>
                    <button className="hub-button" onClick={() => set(s, lv + 1)} aria-label={`${label} up`}
                      disabled={lv >= MAX_STAT_LV || !next || used + next.cost > points}>+</button>
                  </td>
                  <td>{fmt(cost(s, lv))}{next && <span className="muted small"> (next {next.cost}, +{next.gain})</span>}</td>
                  <td className="bloom-bonus"><div>
                    {bonus.filter((x) => x.stat === s).map((x, i) => (
                      <span key={i} className={`bloom-chip${lv >= x.level ? " on" : ""}`}>Lv {x.level}: {BONUS_LABEL[x.bonus] ?? `stat ${x.bonus}`} +{x.value}</span>
                    ))}
                    {!bonus.some((x) => x.stat === s) && <span className="muted small">none</span>}
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <p>Bonus: CRI +{bonusTotal(6)}, SP gain +{bonusTotal(7)}</p>
      </Panel>
      <Panel title={`Cost to Bloom Lv ${bloomLv}`}>
        <p><b>{fmt(gold)}</b> gold</p>
        <ul className="bloom-mats">
          {[...mats.entries()].map(([item, num]) => {
            const it = growth.items[item];
            return (
              <li key={item} title={item}>
                <BundleImage stem={ITEM_ICONS} name={`${it?.icon ?? item}_s`} width={40} height={40} className="item-icon" />
                <Link to={`/items/${item}`} lang="ja">{tr(it?.name ?? null, lang) || item}</Link>
                <b>×{fmt(num)}</b>
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
