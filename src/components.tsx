// Game-icon building blocks. The images are cut from the game's own UI atlas
// by tools/web_export/tables.py (public/ui).
import { ELEMENTS, RARITY, type Effect } from "./data";

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
      <span>{e.text}</span>
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
