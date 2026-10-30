import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckboxGroup, EmptyState, ListToolbar, LoadState, Panel, SearchBox, SegmentedButtons } from "@altterisk/game-hub";
import { listState, searchParamsAdapter, textMatch } from "@altterisk/game-hub/filters";
import { RarityIcon } from "../components";
import { RARITY, RUNE_ICONS, tr, useData, useLang, type Growth, type RuneEffect, type RuneSet } from "../data";
import { BundleImage } from "../bundleImage";
import { LIST_META } from "../meta";
import { usePageMeta } from "../usePageMeta";

const fmtRange = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);
const ui = (name: string) => `${import.meta.env.BASE_URL}ui/${name}.webp`;

/** One effect as a skill-style line: stat icon, stat, value range over the
 *  enhancement levels. The game's own wording is the tooltip. */
function EffectLine({ e }: { e: RuneEffect }) {
  const lang = useLang();
  const value = `+${fmtRange(e.range)}${e.flat ? "" : "%"}`;
  return (
    <li title={tr(e.description, lang)}>
      {e.icon ? <img src={ui(`Battle_status_icon_${e.icon}`)} alt="" width={22} height={22} /> : <span className="effect-dot" />}
      <span>{e.stat ? <>{e.stat} <span className="rune-value">{value}</span></> : `${tr(e.description, lang)} ${fmtRange(e.range)}`}</span>
    </li>
  );
}

/** All nine ailment resistances with one shared range -> one line (1024 of the
 *  lists that have any; the 49 with one or two keep them listed). Both lists
 *  are pools (a slot's main stat is one of them, sub effects are rolled from
 *  them), so the line says "any", not "all". */
function collapse(list: RuneEffect[]): RuneEffect[] {
  const res = list.filter((e) => e.stat?.endsWith(" resistance"));
  if (res.length < 9 || new Set(res.map((e) => e.range.join())).size !== 1) return list;
  const at = list.indexOf(res[0]);
  const rest = list.filter((e) => !res.includes(e));
  const all: RuneEffect = { ...res[0], stat: "Any status ailment resistance",
    description: { ja: res.map((e) => e.description?.ja).join(" / ") } };
  return [...rest.slice(0, at), all, ...rest.slice(at)];
}

function Effects({ title, list }: { title: string; list: RuneEffect[] }) {
  if (!list.length) return null;
  return (
    <div className="rune-effects">
      {title && <h4>{title}</h4>}
      <ul className="effect-list">{collapse(list).map((e, i) => <EffectLine key={i} e={e} />)}</ul>
    </div>
  );
}

/** The 2- and 4-piece bonuses: decoded lines, the game's text as the tooltip
 *  (and as the fallback for the few bonus types not decoded). */
function Bonuses({ set }: { set: RuneSet }) {
  const lang = useLang();
  return (
    <dl className="rune-bonus">
      {Object.entries(set.bonus).map(([n, b]) => {
        const fx = set.bonusFx?.[n];
        return (
          <div key={n} title={tr(b, lang)}>
            <dt>{n}-piece</dt>
            <dd>
              {fx ? (fx.length ? (
                <ul className="effect-list">
                  {fx.map((l, i) => (
                    <li key={i}>
                      {l.icon ? <img src={ui(`Battle_status_icon_${l.icon}`)} alt="" width={20} height={20} /> : <span className="effect-dot" />}
                      <span>{l.text}</span>
                    </li>
                  ))}
                </ul>
              ) : <span className="muted">No effect</span>) : <span lang="ja">{tr(b, lang)}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** One rarity tier of a set family (不屈の序装 N, 不屈の中装 R, ...). */
function Tier({ set }: { set: RuneSet }) {
  const lang = useLang();
  const p = set.pieces[0];
  return (
    <section className="rune-tier">
      <h3 lang="ja">{tr(set.name, lang)}</h3>
      <Bonuses set={set} />
      <div className="rune-pieces">
        {set.pieces.map((x) => (
          <div key={x.id} className="rune-piece" title={tr(x.name, lang)}>
            <BundleImage stem={RUNE_ICONS} name={`${x.icon}_s`} width={40} height={40} className="rune-icon" />
            <span className="rune-slot">{x.slotLabel}{x.main.length > 1 && <span className="muted small"> · one of</span>}</span>
            <ul className="effect-list">{collapse(x.main).map((e, i) => <EffectLine key={i} e={e} />)}</ul>
            {x.evolve && <Evolve list={x.evolve} />}
          </div>
        ))}
      </div>
      <details>
        <summary>Sub effects ({p.subCount.join("–")} per piece, rolled from these)</summary>
        <Effects title="" list={p.sub} />
      </details>
    </section>
  );
}

const ITEM_ICONS = "image_item_s_assets_all";

/** The items that evolve a piece into the next tier (RuneEvolutionItems). */
function Evolve({ list }: { list: string }) {
  const { data: growth } = useData<Growth>("growth");
  const lang = useLang();
  const items = growth?.rune.evolve[list];
  if (!items) return null;
  return (
    <div className="rune-evolve small"><span className="muted">Evolve:</span>{" "}
      {items.map(([id, n]) => (
        <Link key={id} to={`/items/${id}`} className="rune-evolve-item" title={tr(growth!.items[id]?.name ?? null, lang) || id}>
          <BundleImage stem={ITEM_ICONS} name={`${growth!.items[id]?.icon ?? id}_s`} width={20} height={20} /> ×{n.toLocaleString()}
        </Link>
      ))}
    </div>
  );
}

// refine cost category = the rune effect's stat code (tables.py RUNE_PARAM)
const REFINE_STAT: Record<number, string> = {
  0: "—", 1: "HP", 3: "ATK", 5: "DEF", 7: "SPD", 11: "Crit rate", 31: "Sleep res.", 32: "Paralysis res.", 33: "Poison res.",
  34: "Burn res.", 35: "Curse res.", 36: "Seal res.", 37: "Darkness res.", 38: "Confusion res.", 39: "Petrification res.",
};

/** Enhance gold by rarity and level, and refine costs, as listed in the client. */
function Costs() {
  const { data: growth } = useData<Growth>("growth");
  const lang = useLang();
  if (!growth) return null;
  const enh = Object.entries(growth.rune.enhance);
  const levels = [...new Set(enh.flatMap(([, m]) => Object.keys(m)))].sort((a, b) => Number(a) - Number(b));
  return (
    <details className="rune-costs">
      <summary>Enhance and refine costs</summary>
      <div className="hub-table-wrap"><table className="hub-table">
        <thead><tr><th>Enhance gold</th>{levels.map((l) => <th key={l}>→ +{Number(l) - 1}</th>)}</tr></thead>
        <tbody>{enh.map(([r, m]) => (
          <tr key={r}><th scope="row"><RarityIcon rarity={Number(r)} height={14} /></th>
            {levels.map((l) => <td key={l}>{m[l]?.toLocaleString() ?? ""}</td>)}</tr>
        ))}</tbody>
      </table></div>
      <div className="hub-table-wrap"><table className="hub-table">
        <thead><tr><th>Refine</th><th>Stat</th><th>Chip</th><th>Chips (main / sub)</th><th>Cost (main / sub)</th></tr></thead>
        <tbody>{growth.rune.refine.map((r, i) => (
          <tr key={i}><th scope="row"><RarityIcon rarity={r.rarity} height={14} /></th><td>{REFINE_STAT[r.category] ?? r.category}</td>
            <td lang="ja">{r.refine_chip_id
              ? <Link to={`/items/${r.refine_chip_id}`}>{tr(growth.items[r.refine_chip_id]?.name ?? null, lang) || r.refine_chip_id}</Link> : "—"}</td>
            <td>{r.main_chip_cost} / {r.sub_chip_cost}</td><td>{r.main_refine_cost} / {r.sub_refine_cost}</td></tr>
        ))}</tbody>
      </table></div>
    </details>
  );
}

/** A set family with its rarity tiers as tabs (highest tier first shown). */
function Family({ family, tiers }: { family: string; tiers: RuneSet[] }) {
  const [pick, setPick] = useState<string | null>(null);
  const t = tiers.find((x) => String(x.id) === pick) ?? tiers[tiers.length - 1];
  return (
    <Panel title={<span lang="ja">{family}</span>} className="rune-family">
      {tiers.length > 1 && (
        <SegmentedButtons label="Rarity" selected={[String(t.id)]} onToggle={setPick}
          options={tiers.map((x) => ({ value: String(x.id), label: <RarityIcon rarity={x.pieces[0].rarity} height={16} /> }))} />
      )}
      <Tier set={t} />
    </Panel>
  );
}

export default function Runes() {
  usePageMeta(LIST_META["/runes"]);
  const { data: sets, loading, error } = useData<RuneSet[]>("runes");
  const [params, setParams] = useSearchParams();
  const url = listState(searchParamsAdapter(params, setParams));
  const q = url.text("q");
  const rarityF = url.list("rarity");
  // Each rarity tier is its own group id in the tables; show them per family.
  const families = useMemo(() => {
    const m = new Map<string, RuneSet[]>();
    for (const s of sets || []) {
      if (rarityF.length && !s.pieces.some((p) => rarityF.includes(String(p.rarity)))) continue;
      if (q && !textMatch(q, [s.family, s.name?.ja, s.name?.en, ...Object.values(s.bonus).map((b) => b?.ja),
        ...Object.values(s.bonusFx ?? {}).flat().map((l) => l.text)])) continue;
      m.set(s.family, [...(m.get(s.family) || []), s]);
    }
    for (const list of m.values()) list.sort((a, b) => a.pieces[0].rarity - b.pieces[0].rarity);
    return [...m.entries()];
  }, [sets, q, rarityF.join()]);
  const total = useMemo(() => new Set((sets || []).map((s) => s.family)).size, [sets]);

  return (
    <div className="runes-page">
      <h1>Runes</h1>
      <p className="muted">Equipment: six slots α–ζ, with two- and four-piece set bonuses. Each family comes in rarity tiers; piece values are the range over every enhancement level.</p>
      <ListToolbar
        search={<SearchBox value={q} onChange={(v) => url.setText("q", v)} placeholder="Set name or bonus" />}
        count={sets ? `${families.length} / ${total} sets` : undefined}
      />
      <CheckboxGroup title="Rarity" options={[1, 2, 3, 4, 5].map((r) => ({ value: String(r), label: <RarityIcon rarity={r} height={16} /> }))}
        selected={rarityF} onToggle={(v) => url.toggle("rarity", v)} />
      <Costs />
      <LoadState loading={loading} error={error} />
      {sets && !families.length && <EmptyState title="No rune sets match" />}
      <div className="rune-sets">
        {families.map(([family, tiers]) => (
          <Family key={family} family={family}
            tiers={tiers.filter((t) => !rarityF.length || rarityF.includes(String(t.pieces[0].rarity)))} />
        ))}
      </div>
    </div>
  );
}
