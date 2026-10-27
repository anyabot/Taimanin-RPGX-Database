// Game-icon building blocks. The images are cut from the game's own UI atlas
// by tools/web_export/tables.py (public/ui).
import { ELEMENTS, RARITY, type Effect, type StackTag } from "./data";
import "./stack.css";

const ui = (name: string) => `${import.meta.env.BASE_URL}ui/${name}.webp`;

export function RarityIcon({ rarity, height = 18 }: { rarity: number; height?: number }) {
  const label = RARITY[rarity];
  if (!label) return null;
  return <img className="rarity-icon" src={ui(`Cmn_rarity_icon_${label.toLowerCase()}_m`)} alt={label} title={label}
    style={{ ["--icon-h" as string]: `${height}px` }} />;
}

export function ElementIcon({ element, size = 20 }: { element: string | null; size?: number }) {
  const i = element ? ELEMENTS.indexOf(element) : -1;
  if (i < 0) return null;
  return <img className="element-icon" src={ui(`Cmn_chr_s_attr${i + 1}`)} alt={element!} title={element!}
    style={{ ["--icon-w" as string]: `${size}px` }} />;
}

export function EffectList({ effects }: { effects: Effect[] }) {
  if (!effects.length) return null;
  // Effects that share a `when` (a variant of the skill, or its extra action)
  // are listed together under that condition.
  const groups: { when?: string; items: Effect[] }[] = [];
  for (const e of effects) {
    const last = groups[groups.length - 1];
    if (last && last.when === e.when) last.items.push(e);
    else groups.push({ when: e.when, items: [e] });
  }
  const items = (list: Effect[]) => list.map((e, i) => (
    <li key={i}>
      {e.icon ? <img src={ui(`Battle_status_icon_${e.icon}`)} alt="" width={22} height={22} /> : <span className="effect-dot" />}
      <span><StackBadge tag={e.tag} stack={e.stack} />{e.text}</span>
    </li>
  ));
  return (
    <div className="effect-groups">
      {groups.map((g, i) => g.when ? (
        <div key={i} className="effect-group">
          <div className="effect-when">{g.when}</div>
          <ul className="effect-list">{items(g.items)}</ul>
        </div>
      ) : <ul key={i} className="effect-list">{items(g.items)}</ul>)}
    </div>
  );
}

// How each kind of effect stacks, read from the battle code (libil2cpp 1.25.53):
// BattleUnitBuffDebuff.VerifyAdd*BuffDebuff, BattleUnit.AddStateEffect and
// ChangeStateEffect. "Not checked yet" marks the systems not read so far.
export const STACK: Record<StackTag, { label: string; rule: string }> = {
  buff: { label: "Buff", rule: "One buff per stat. A stronger one replaces it; an equal one replaces it only if it lasts longer; a weaker one is ignored. Trait buffs and states apply on top." },
  debuff: { label: "Debuff", rule: "One debuff per stat. A stronger one replaces it; an equal one replaces it only if it lasts longer; a weaker one is ignored." },
  trait: { label: "Trait buff", rule: "One per trait and stat, kept apart from plain buffs (both apply). An equal or stronger one replaces it." },
  state: { label: "State", rule: "One of each kind per unit." },
  shield: { label: "Shield", rule: "Not checked yet." },
  ailment: { label: "Ailment", rule: "Status ailment. Not checked yet how a second one stacks." },
  marker: { label: "Marker", rule: "Adds or removes stacks, up to the marker's limit." },
  instant: { label: "Instant", rule: "Happens once, when the skill is used." },
  mode: { label: "Mode", rule: "Changes the unit's mode or skill set." },
  modifier: { label: "Modifier", rule: "Changes this attack only (power, hits, crits)." },
  passive: { label: "Passive", rule: "Always on: leader skill or ability." },
  other: { label: "Other", rule: "Not classified yet." },
};

export const STATE_STACK: Record<string, string> = {
  value: "A stronger one replaces it; an equal one adds 1 turn to the one already there; a weaker one is ignored.",
  duration: "A new one replaces it if it lasts at least as long.",
  once: "Can't be applied again while it is active.",
  target: "Easier and harder to target replace each other: the newest wins.",
  regen: "A stronger one replaces it, otherwise the one already there may get more turns. HP regen clears bleed, SP regen clears SP drain.",
  spdrain: "Blocked while the target has SP regen. A bigger value × turns replaces it; an equal one adds a turn.",
  darkblade: "Own rules (Darkness Blade and its cut), not described yet.",
  own: "Has its own handler; not checked yet.",
};

export function stackRule(tag?: StackTag, stack?: string): string {
  if (!tag) return "";
  const base = STACK[tag].rule;
  if (tag !== "state") return base;
  return `${base} ${STATE_STACK[stack ?? "own"] ?? STATE_STACK.own} One that can't be removed is never replaced.`;
}

export function StackBadge({ tag, stack }: { tag?: StackTag; stack?: string }) {
  if (!tag) return null;
  return <span className={`stack-badge ${tag}`} title={stackRule(tag, stack)}>{STACK[tag].label}</span>;
}

/** The stacking rules, one line per badge. */
export function StackRules() {
  const states = Object.entries(STATE_STACK);
  return (
    <ul className="stack-rules">
      {(Object.keys(STACK) as StackTag[]).map((t) => t === "state" ? (
        <li key={t}><span><StackBadge tag={t} stack="own" /></span>
          <span>{STACK.state.rule} By kind:
            <ul>{states.map(([g, r]) => <li key={g} style={{ display: "list-item" }}>{STATE_GROUP_LABEL[g]}: {r}</li>)}</ul>
            One that can't be removed is never replaced, even by a stronger one.</span></li>
      ) : (
        <li key={t}><span><StackBadge tag={t} /></span><span>{STACK[t].rule}</span></li>
      ))}
    </ul>
  );
}

const STATE_GROUP_LABEL: Record<string, string> = {
  value: "Attack boost, damage boost, damage cut, reflection, DEF reduction, mind reading",
  duration: "Ailment blocks, debuff/buff blocks, marker block, death block, Immortal",
  once: "Flying, charge, SP burst, shadow stance",
  target: "Easier / harder to target",
  regen: "HP regen, SP regen",
  spdrain: "SP drain",
  darkblade: "Darkness Blade",
  own: "Others (SP cost changes, bleed, frozen, guts …)",
};
