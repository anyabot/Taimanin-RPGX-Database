import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FallbackImage, FilterChip, FilterRow, GroupCard, LoadState, PageHeader, Panel } from "@altterisk/game-hub";
import { listState, searchParamsAdapter } from "@altterisk/game-hub/filters";
import { SHOW_UPCOMING, iconUrl, isUpcoming, tr, unitName, useData, useLang, type RuneSet, type UnitIndexEntry } from "../data";
import { ElementIcon, RarityIcon } from "../components";
import { LIST_META } from "../meta";
import { usePageMeta } from "../usePageMeta";
import "./ailments.css";

/** The rows of public/data/buffs.json this page reads (tools/web_export/buffs.py). */
interface Row {
  u: string; c: string; k: string; v: number; p: 0 | 1;
  sc: "self" | "all" | "some" | "element" | "trait" | "enemies" | "enemy";
  el?: string; tr?: string; t: number;
  s: "attack" | "skill1" | "skill2" | "ultimate" | "leader";
  n?: string; x: string;
  /** ailment rows: rolls on a lone enemy when not 1 (0 = varies); ra = read from the text */
  r?: number; ra?: 1;
}

const SOURCE_LABEL: Record<Row["s"], string> = { attack: "Normal attack", skill1: "Skill 1", skill2: "Skill 2", ultimate: "Ultimate", leader: "Leader" };
const RATE = "Ailment infliction rate";
const RESIST_KEYS = ["Status ailment resistance", "All status ailments resistance"];
const FROZEN = "Frozen: acts later; status ailment resistance";
const PREVIEW = 25;

/** Resist after the ailment has landed `times` times this battle
 *  (DamageCalculation.UnitAbnormalCalculate): base + Enhancement resist is
 *  raised to min(floor(x × 1.5) + 5, 90) while it is 89 or less. */
function grown(base: number, enh: number, times: number) {
  let b = base;
  for (let i = 0; i < times; i++) {
    const x = b + enh;
    if (x > 89) break;
    b = Math.min(Math.floor((Math.max(x, 0) * 150) / 100) + 5, 90);
  }
  return b;
}
/** Frozen (state 26, BattleUnit.GetFrozenAbnormalStateAdjustmentValue): -50 at
 *  0 SPD rising to 0 at 150 SPD, by the square of SPD / 150. */
const frozenAdj = (spd: number) => Math.min(Math.floor(-50 + (Math.max(spd, 0) / 150) ** 2 * 50), 0);
/** Chance per roll, %: CEIL((100 − resist) / 100 × rate), rolled as Random.Range(0, 100) < chance. */
const perRoll = (resist: number, rate: number) => Math.min(Math.max(Math.ceil((100 - resist) / 100 * rate - 1e-9), 0), 100);
const total = (p: number, rolls: number) => 100 * (1 - (1 - p / 100) ** rolls);
const num2 = (x: number) => String(Math.round(x * 100) / 100);
const fmt = (x: number) => (x >= 99.995 ? "100" : x < 0.005 ? "0" : x.toFixed(x < 10 ? 2 : 1).replace(/\.?0+$/, ""));

/** Does a buff row reach this attacker? */
function reaches(r: Row, u: UnitIndexEntry | undefined) {
  if (r.sc === "all") return true;
  if (r.sc === "element") return u?.element === r.el;
  if (r.sc === "trait") return !!u && !!r.tr && u.traits.includes(r.tr);
  if (r.sc === "self") return u?.id === r.u;
  return false;
}
const scopeLabel = (r: Row) =>
  r.sc === "all" ? "all allies" : r.sc === "element" ? `${r.el} allies` : r.sc === "trait" ? `${r.tr} allies` : r.sc === "self" ? "self only" : r.sc;

function NumberField({ label, value, onChange, min, max, step = 1, suffix, help }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; help?: string;
}) {
  return (
    <label className="ail-field" title={help}>
      <span className="ail-label">{label}</span>
      <span className="ail-input">
        <input className="hub-input" type="number" inputMode="numeric" value={Number.isFinite(value) ? value : 0}
          min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value) || 0)} />
        {suffix && <span className="muted small">{suffix}</span>}
      </span>
    </label>
  );
}

function SelectField({ label, value, onChange, options, help }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; help?: string;
}) {
  return (
    <label className="ail-field" title={help}>
      <span className="ail-label">{label}</span>
      <select className="hub-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export default function Ailments() {
  usePageMeta(LIST_META["/ailments"]);
  const { data: rows, loading, error } = useData<Row[]>("buffs");
  const { data: index } = useData<UnitIndexEntry[]>("units/index");
  const { data: runes } = useData<RuneSet[]>("runes");
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const url = listState(searchParamsAdapter(params, setParams));
  const [showAll, setShowAll] = useState(false);
  const num = (k: string, d: number) => { const v = Number(url.text(k)); return url.text(k) === "" || !Number.isFinite(v) ? d : v; };
  const setNum = (k: string, d: number) => (v: number) => url.setText(k, v === d ? "" : String(v));

  const units = useMemo(() => new Map((index || []).map((u) => [u.id, u])), [index]);
  const upcoming = useMemo(() => new Set((index || []).filter(isUpcoming).map((u) => u.id)), [index]);
  const visible = useMemo(() => (rows || []).filter((r) => SHOW_UPCOMING || !upcoming.has(r.u)), [rows, upcoming]);
  const name = (id: string) => { const u = units.get(id); return u ? unitName(u, lang) : id; };

  const ailments = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of visible) if (r.c === "ailment" && r.k !== "A random status ailment") m.set(r.k, (m.get(r.k) || new Set()).add(r.u));
    return [...m.entries()].sort((a, b) => b[1].size - a[1].size);
  }, [visible]);
  const ailment = ailments.find(([k]) => k === url.text("a"))?.[0] ?? "Paralysis";

  // ---- inputs
  const baseRes = num("res", 90);
  const landed = num("landed", 0);
  const spd = num("spd", 100);
  const extraRes = num("xres", 0);
  const extraMul = num("xmul", 0);
  const extraFlat = num("xflat", 0);

  // Option lists from the buff rows. Resist changes and timed rate buffs are
  // whole points (BuffDebuffDataAbstract.IsFixed); leader / rune rates are %.
  const byKey = (pred: (r: Row) => boolean) => visible.filter(pred).sort((a, b) => Math.abs(b.v) - Math.abs(a.v) || a.u.localeCompare(b.u));
  const ailResKey = `${ailment} resistance`;
  const leaderRes = useMemo(() => byKey((r) => r.c === "debuff" && r.s === "leader" && (RESIST_KEYS.includes(r.k) || r.k === ailResKey)), [visible, ailResKey]);
  const skillRes = useMemo(() => byKey((r) => r.c === "debuff" && r.s !== "leader" && (RESIST_KEYS.includes(r.k) || r.k === ailResKey)), [visible, ailResKey]);
  const leaderRate = useMemo(() => byKey((r) => r.k === RATE && r.s === "leader"), [visible]);
  const skillRate = useMemo(() => byKey((r) => r.k === RATE && r.s !== "leader"), [visible]);
  const hasFrozen = useMemo(() => visible.some((r) => r.k === FROZEN), [visible]);

  const rowId = (r: Row) => `${r.u}.${r.s}.${r.v}`;
  const pick = (list: Row[], key: string) => list.find((r) => rowId(r) === url.text(key));
  const ls1 = pick(leaderRate, "ls");
  const ls2 = pick(leaderRate, "sls");
  const buff = pick(skillRate, "buff");
  const resLs = pick(leaderRes, "rls");
  const resSk = pick(skillRes, "rsk");
  const frozen = url.text("frozen") === "1";

  // Rune set bonuses that raise the infliction rate, per family and tier.
  const runeOpts = useMemo(() => {
    const out = new Map<string, { value: string; label: string; v: number }[]>();
    for (const s of runes || []) {
      for (const [pieces, lines] of Object.entries(s.bonusFx || {})) {
        for (const l of lines) {
          const m = /^Status ailment infliction rate \+(\d+)%$/.exec(l.text);
          if (!m) continue;
          const fam = `${s.family}|${pieces}`;
          out.set(fam, [...(out.get(fam) || []), { value: String(s.id), label: `${s.name?.ja ?? s.family} +${m[1]}%`, v: Number(m[1]) }]);
        }
      }
    }
    return [...out.entries()].map(([fam, opts]) => {
      const [family, pieces] = fam.split("|");
      return { key: `rune${family}`, family, pieces, opts: opts.sort((a, b) => a.v - b.v) };
    });
  }, [runes]);
  const runeBonus = runeOpts.reduce((sum, f) => sum + (f.opts.find((o) => o.value === url.text(f.key))?.v || 0), 0);

  // ---- enemy resist: base (grown by earlier landings) + leader-type debuffs
  // (Enhancement, part of the growth base) + buff/debuff total + Frozen
  const enh = (resLs?.v || 0);
  const base = grown(baseRes, enh, landed);
  const resist = base + enh + Math.trunc((resSk?.v || 0) + extraRes) + (frozen ? frozenAdj(spd) : 0);

  const ranked = useMemo(() => {
    const list = visible.filter((r) => r.c === "ailment" && r.k === ailment);
    const best = new Map<string, { r: Row; mul: number; flat: number; rate: number; p: number; rolls: number; tot: number }>();
    for (const r of list) {
      const u = units.get(r.u);
      const mul = runeBonus + extraMul + [ls1, ls2].reduce((s, l) => s + (l && reaches(l, u) ? l.v : 0), 0);
      const flat = extraFlat + (buff && reaches(buff, u) ? buff.v : 0);
      const rate = (1 + mul / 100) * r.v + flat;
      const p = perRoll(resist, rate);
      const rolls = r.r === 0 ? 1 : r.r ?? 1;
      const tot = total(p, rolls);
      const key = `${r.u}.${r.s}`;
      const prev = best.get(key);
      if (!prev || tot > prev.tot) best.set(key, { r, mul, flat, rate, p, rolls, tot });
    }
    return [...best.values()].sort((a, b) => b.tot - a.tot || b.r.v - a.r.v || a.r.u.localeCompare(b.r.u));
  }, [visible, ailment, units, resist, runeBonus, extraMul, extraFlat, ls1, ls2, buff]);

  if (!rows) return <LoadState loading={loading} error={error} />;
  const shown = showAll ? ranked : ranked.slice(0, PREVIEW);
  const opt = (list: Row[], none: string) => [{ value: "", label: none },
    ...list.map((r) => ({ value: rowId(r), label: `${r.v > 0 ? "+" : ""}${r.v}${r.p ? "%" : ""} · ${name(r.u)} (${r.s === "leader" ? "" : `${SOURCE_LABEL[r.s]}, `}${scopeLabel(r)}${r.n ? `; ${r.n}` : ""})` }))];

  return (
    <div className="ail-page">
      <PageHeader title="Ailment odds"
        subtitle="The chance each unit's skill lands a status ailment on a lone enemy (a boss), with the enemy's resist, debuffs, leader skills, buffs and rune sets. Formula read from the game client." />

      <FilterRow label="Ailment">
        {ailments.map(([k, us]) => (
          <FilterChip key={k} active={k === ailment} count={us.size} onClick={() => { url.setText("a", k); setShowAll(false); }}>{k}</FilterChip>
        ))}
      </FilterRow>

      <div className="ail-panels">
        <Panel title="Enemy" note={<>Resist used: <strong>{resist}</strong>{landed > 0 && <> (base grown to {base})</>}</>}>
          <div className="ail-grid">
            <NumberField label={`${ailment} resist`} value={baseRes} onChange={setNum("res", 90)} min={0} max={999}
              help="The enemy's own resist to this ailment (999 = immune)." />
            <NumberField label="Times it already landed" value={landed} onChange={setNum("landed", 0)} min={0} max={10}
              help="Each landing raises the resist: min(floor(resist × 1.5) + 5, 90), while it is 89 or less. Resets each battle." />
            <SelectField label="Leader skill debuff" value={url.text("rls")} onChange={(v) => url.setText("rls", v)}
              options={opt(leaderRes, "None")} help="Your leader / support skill lowering enemy resist." />
            <SelectField label="Skill debuff" value={url.text("rsk")} onChange={(v) => url.setText("rsk", v)}
              options={opt(skillRes, "None")} help="A resist-down debuff on the enemy from a skill." />
            {hasFrozen && (
              <label className="ail-field ail-check" title="Frozen lowers resist by up to 50: -50 at 0 SPD, 0 at 150 SPD.">
                <input type="checkbox" checked={frozen} onChange={(e) => url.setText("frozen", e.target.checked ? "1" : "")} />
                <span>Frozen{frozen && <> ({frozenAdj(spd)})</>}</span>
              </label>
            )}
            {frozen && <NumberField label="Enemy SPD" value={spd} onChange={setNum("spd", 100)} min={0} />}
            <NumberField label="Other resist change" value={extraRes} onChange={setNum("xres", 0)}
              help="Anything else added to the enemy's resist (negative lowers it)." />
          </div>
        </Panel>

        <Panel title="Your side" note={<>Rate multiplier from runes and extras: +{runeBonus + extraMul}%</>}>
          <div className="ail-grid">
            <SelectField label="Leader skill" value={url.text("ls")} onChange={(v) => url.setText("ls", v)}
              options={opt(leaderRate, "None")} help="Multiplies the skill's chance. Element and trait versions apply only to matching units." />
            <SelectField label="Support leader skill" value={url.text("sls")} onChange={(v) => url.setText("sls", v)}
              options={opt(leaderRate, "None")} help="The friend unit's leader skill; adds to the same multiplier." />
            <SelectField label="Rate buff (skill)" value={url.text("buff")} onChange={(v) => url.setText("buff", v)}
              options={opt(skillRate, "None")} help="A timed buff: adds flat points after the multiplier." />
            {runeOpts.map((f) => (
              <SelectField key={f.key} label={`${f.family} ${f.pieces}-piece`} value={url.text(f.key)} onChange={(v) => url.setText(f.key, v)}
                options={[{ value: "", label: "None" }, ...f.opts]} help="Rune set bonus: adds to the multiplier. Assumed on every unit." />
            ))}
            <NumberField label="Other rate multiplier" value={extraMul} onChange={setNum("xmul", 0)} suffix="%"
              help="Anything else that adds to the multiplier (abilities, other passives)." />
            <NumberField label="Other flat rate" value={extraFlat} onChange={setNum("xflat", 0)}
              help="Flat points added after the multiplier." />
          </div>
        </Panel>
      </div>

      <GroupCard className="ail-group" title={`${ailment} · best chance first`} count={`${ranked.length} skills`}
        note="Per roll = CEIL((100 − resist) / 100 × rate). Total = chance to land at least once over the skill's rolls.">
        <table className="hub-table hub-table--stack buff-table ail-table">
          <thead><tr><th>#</th><th>Total</th><th>Per roll</th><th>Unit</th><th>Skill</th><th>Rate</th></tr></thead>
          <tbody>
            {shown.map(({ r, mul, flat, rate, p, rolls, tot }, i) => {
              const u = units.get(r.u);
              return (
                <tr key={`${r.u}-${r.s}`}>
                  <td data-label="#" className="muted">{i + 1}</td>
                  <td data-label="Total"><strong>{fmt(tot)}%</strong></td>
                  <td data-label="Per roll">
                    {p}%{rolls > 1 && <> × {rolls}</>}
                    {r.r === 0 && <div className="muted small" title="The target count changes when the skill is used">rolls vary</div>}
                    {r.ra && r.r !== 0 && <div className="muted small" title="Read from the effect text, not the raw skill rows">rolls from text</div>}
                  </td>
                  <td data-label="Unit">
                    <Link className="buff-unit" to={`/units/${r.u}?tab=skills`}>
                      <FallbackImage srcs={[iconUrl(r.u)]} alt="" width={36} height={36} loading="lazy" missingClassName="buff-noicon" />
                      <span>
                        <span className="buff-unit-name">{u ? unitName(u, lang) : r.u}</span>
                        {u && <span className="buff-unit-meta"><RarityIcon rarity={u.rarity} height={12} /><ElementIcon element={u.element} size={12} />{tr(u.title, lang)}</span>}
                      </span>
                    </Link>
                  </td>
                  <td data-label="Skill" title={r.x}>
                    {SOURCE_LABEL[r.s]} · {r.v}%
                    <div className="muted small">{r.x}</div>
                  </td>
                  <td data-label="Rate" className="muted" title="(1 + multiplier) × skill chance + flat">
                    {num2(rate)}{(mul || flat) ? <div className="small">×{num2(1 + mul / 100)}{flat ? ` + ${flat}` : ""}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {ranked.length > PREVIEW && (
          <button className="hub-btn buff-more" onClick={() => setShowAll((x) => !x)}>
            {showAll ? `Show top ${PREVIEW}` : `Show all ${ranked.length}`}
          </button>
        )}
      </GroupCard>

      <details className="ail-help">
        <summary>How the chance works</summary>
        <ul>
          <li><strong>Per roll:</strong> CEIL((100 − resist) / 100 × rate) %, rounded up. Resist = the enemy's resist for the ailment + resist buffs/debuffs (always whole points) + Frozen. Rate = (1 + leader, support and rune bonuses / 100) × the skill's chance + timed rate buffs (flat points).</li>
          <li><strong>Rolls:</strong> a lone enemy is rolled once per time it is in the skill's target list. Only "random enemies" multi-hit skills can pick it more than once, so a 4-hit random skill rolls 4 times. Single-target and all-enemy skills roll once, however many hits they have.</li>
          <li><strong>Build-up:</strong> each time an ailment lands, the enemy's resist to it becomes min(floor(resist × 1.5) + 5, 90) while it is 89 or less: 0 → 5 → 12 → 23 → 39 → 63 → 90. It resets each battle.</li>
          <li>An ailment already on the enemy is extended by 1 turn instead (not Sleep or Petrification). An immunity charge on the enemy blocks one landing. A Petrified enemy takes no other ailment.</li>
          <li>Ailments applied after the attack miss if the enemy evades it; "before attacking" ones always roll.</li>
        </ul>
      </details>
    </div>
  );
}
