import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckboxGroup, EmptyState, ListToolbar, LoadState, Panel, SearchBox } from "@altterisk/game-hub";
import { textMatch } from "@altterisk/game-hub/filters";
import { RarityIcon } from "../components";
import { RARITY, tr, useData, useLang, type RuneEffect, type RuneSet } from "../data";

const fmtRange = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);

function Effects({ title, list }: { title: string; list: RuneEffect[] }) {
  const lang = useLang();
  if (!list.length) return null;
  return (
    <div className="rune-effects">
      <h4>{title}</h4>
      <ul>{list.map((e, i) => <li key={i}>{tr(e.description, lang)} <span className="muted">{fmtRange(e.range)}</span></li>)}</ul>
    </div>
  );
}

/** One rarity tier of a set family (不屈の序装 N, 不屈の中装 R, ...). */
function Tier({ set }: { set: RuneSet }) {
  const lang = useLang();
  const p = set.pieces[0];
  return (
    <section className="rune-tier">
      <h3>
        <RarityIcon rarity={p.rarity} />
        {tr(set.name, lang)}
        <span className="muted">slots {[...new Set(set.pieces.map((x) => x.slotLabel))].join("")}</span>
      </h3>
      <dl className="rune-bonus">
        {Object.entries(set.bonus).map(([n, b]) => <div key={n}><dt>{n}-piece</dt><dd>{tr(b, lang)}</dd></div>)}
      </dl>
      <details>
        <summary>Main and sub effects (sub effects {p.subCount.join("–")})</summary>
        <Effects title="Main effect" list={p.main} />
        <Effects title="Sub effects" list={p.sub} />
      </details>
    </section>
  );
}

export default function Runes() {
  const { data: sets, loading, error } = useData<RuneSet[]>("runes");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const rarityF = (params.get("rarity") || "").split(",").filter(Boolean);
  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
  };
  // Each rarity tier is its own group id in the tables; show them per family.
  const families = useMemo(() => {
    const m = new Map<string, RuneSet[]>();
    for (const s of sets || []) {
      if (rarityF.length && !s.pieces.some((p) => rarityF.includes(String(p.rarity)))) continue;
      if (q && !textMatch(q, [s.family, s.name?.ja, s.name?.en, ...Object.values(s.bonus).map((b) => b?.ja)])) continue;
      m.set(s.family, [...(m.get(s.family) || []), s]);
    }
    for (const list of m.values()) list.sort((a, b) => a.pieces[0].rarity - b.pieces[0].rarity);
    return [...m.entries()];
  }, [sets, q, rarityF.join()]);
  const total = useMemo(() => new Set((sets || []).map((s) => s.family)).size, [sets]);

  return (
    <div className="runes-page">
      <h1>Runes</h1>
      <p className="muted">Equipment: six slots α–ζ, with two- and four-piece set bonuses. Each family comes in rarity tiers; effect values are the range over every enhancement level.</p>
      <ListToolbar
        search={<SearchBox value={q} onChange={(v) => setParam("q", v)} placeholder="Set name or bonus" />}
        count={sets ? `${families.length} / ${total} sets` : undefined}
      />
      <CheckboxGroup title="Rarity" options={[1, 2, 3, 4, 5].map((r) => ({ value: String(r), label: <RarityIcon rarity={r} height={16} /> }))}
        selected={rarityF} onToggle={(v) => setParam("rarity", (rarityF.includes(v) ? rarityF.filter((x) => x !== v) : [...rarityF, v]).join(","))} />
      <LoadState loading={loading} error={error} />
      {sets && !families.length && <EmptyState title="No rune sets match" />}
      <div className="rune-sets">
        {families.map(([family, tiers]) => (
          <Panel key={family} title={family}>
            {tiers
              .filter((t) => !rarityF.length || rarityF.includes(String(t.pieces[0].rarity)))
              .map((t) => <Tier key={t.id} set={t} />)}
          </Panel>
        ))}
      </div>
    </div>
  );
}
