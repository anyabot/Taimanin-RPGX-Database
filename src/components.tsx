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
  return (
    <ul className="effect-list">
      {effects.map((e, i) => (
        <li key={i}>
          {e.icon ? <img src={ui(`Battle_status_icon_${e.icon}`)} alt="" width={22} height={22} /> : <span className="effect-dot" />}
          <span>{e.text}</span>
        </li>
      ))}
    </ul>
  );
}
