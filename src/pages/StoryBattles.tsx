import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Breadcrumbs, LoadState, Panel } from "@altterisk/game-hub";
import {
  ENEMY_ICONS, tr, useData, useLang, type BattleBoss, type BattleEnemy, type Battles, type StorySection,
} from "../data";
import { EffectList, ElementIcon } from "../components";
import { BundleImage } from "../bundleImage";
import { StoryBanner } from "./StoryList";

const BOSS_ICONS = "image_bos_s_assets_all";
const DIFFICULTY = ["", "Normal", "Hard", "Very hard", "Extreme", "Nightmare"];
const RAID_DIFFICULTY = ["", "Beginner", "Intermediate", "Advanced", "Expert", "Master"];

/** Quests, enemies and raid bosses of one story chapter / event. */
export default function StoryBattles() {
  const { id = "" } = useParams();
  const { data: index } = useData<StorySection[]>("stories/index");
  const { data, loading, error } = useData<Battles>(`stories/battles/${id}`);
  const lang = useLang();
  const found = useMemo(() => {
    for (const sec of index ?? []) for (const g of sec.groups) if (g.id === id) return { sec, g };
    return null;
  }, [index, id]);
  // quests grouped by the story section (script pair) they sit between
  const sections = useMemo(() => {
    const m = new Map<string, Battles["quests"]>();
    for (const q of data?.quests ?? []) {
      const k = q.scripts.join("|");
      m.set(k, [...(m.get(k) ?? []), q]);
    }
    return [...m.entries()];
  }, [data]);
  const title = found ? tr(found.g.title, lang) || found.g.id : id;
  const partTitle = (sid: string) => {
    const p = found?.g.parts.find((x) => x.id === sid);
    return p ? [p.section, p.title].filter(Boolean).join(" · ") : sid;
  };

  return (
    <div className="battles-page">
      <Breadcrumbs items={[
        { label: "Story", href: `#/story${found ? `?section=${found.sec.key}` : ""}` },
        { label: title, href: found ? `#/story?section=${found.sec.key}&open=${found.g.id}` : undefined },
        { label: "Battles" },
      ]} />
      <div className="battles-head">
        {found?.g.banner && <StoryBanner banner={found.g.banner} large />}
        <div>
          <h1 lang="ja">{title}</h1>
          {data && <p className="muted">{data.quests.length} quests · {Object.keys(data.enemies).length} enemies
            {data.bosses.length > 0 && ` · ${data.bosses.length} raid bosses`}</p>}
        </div>
      </div>
      <LoadState loading={loading && !data} error={error} />
      {data && data.bosses.length > 0 && (
        <Panel title="Raid bosses">
          <div className="boss-grid">
            {data.bosses.map((b) => <EnemyCard key={b.id} e={b} data={data} label={RAID_DIFFICULTY[b.difficulty] ?? `Difficulty ${b.difficulty}`} open />)}
          </div>
        </Panel>
      )}
      {data && sections.map(([key, quests]) => (
        <Panel key={key} title={<span lang="ja">{partTitle(quests[0].scripts[0])}</span>}
          note={<>Between {quests[0].scripts.map((s, i) => (
            <span key={s}>{i > 0 && " and "}<Link to={`/story/${s}`}>{partTitle(s)}</Link></span>))}</>}>
          <div id={`section-${quests[0].scripts[0]}`} className="quest-list">
            {quests.map((q) => (
              <div key={q.id} className="quest">
                <div className="quest-head">
                  <b>Stage {q.stage}</b>
                  {q.difficulty > 1 && <span className="quest-diff">{DIFFICULTY[q.difficulty] ?? `Difficulty ${q.difficulty}`}</span>}
                </div>
                {q.waves.map((w, i) => (
                  <div key={i} className="wave">
                    <span className="wave-no muted">Wave {i + 1}</span>
                    <div className="wave-enemies">
                      {w.map(([eid], j) => data.enemies[eid] && <EnemyChip key={j} e={data.enemies[eid]} data={data} />)}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Panel>
      ))}
      {data && !data.quests.length && !data.bosses.length && <p className="muted">No battle data for this story.</p>}
      <p className="muted small">Enemy names and skills are the game's own data; skill lines are decoded from it.
        "Enemy" in a skill line means your units, as seen by the enemy.</p>
    </div>
  );
}

function EnemyIcon({ icon, size = 48 }: { icon: string | null; size?: number }) {
  return icon ? <BundleImage stem={icon.startsWith("bos_") ? [ENEMY_ICONS, BOSS_ICONS] : ENEMY_ICONS} name={`${icon}_s`}
    width={size} height={size} className="enemy-icon" />
    : <span className="bundle-image enemy-icon" style={{ width: size, height: size }} />;
}

/** One enemy in a wave: icon, name, level; opens its stats and skills. */
function EnemyChip({ e, data }: { e: BattleEnemy; data: Battles }) {
  const [open, setOpen] = useState(false);
  const lang = useLang();
  return (
    <div className={`enemy-chip${open ? " open" : ""}`}>
      <button className="enemy-chip-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <EnemyIcon icon={e.icon} size={40} />
        <span className="enemy-chip-text">
          <span lang="ja" className="enemy-name">{tr(e.name, lang)}</span>
          <span className="enemy-meta muted"><ElementIcon element={e.element} size={13} /> Lv {e.level}</span>
        </span>
      </button>
      {open && <EnemyDetail e={e} data={data} />}
    </div>
  );
}

function EnemyCard({ e, data, label, open }: { e: BattleBoss; data: Battles; label: string; open?: boolean }) {
  const lang = useLang();
  return (
    <div className="enemy-card">
      <div className="enemy-card-head">
        <EnemyIcon icon={e.icon} size={56} />
        <div>
          <div className="enemy-name" lang="ja">{tr(e.name, lang)}</div>
          <div className="muted small"><ElementIcon element={e.element} size={13} /> {label} · Lv {e.level}</div>
        </div>
      </div>
      {open && <EnemyDetail e={e} data={data} />}
    </div>
  );
}

function EnemyDetail({ e, data }: { e: BattleEnemy; data: Battles }) {
  const lang = useLang();
  return (
    <div className="enemy-detail">
      <dl className="enemy-stats">
        <div><dt>HP</dt><dd>{e.hp.toLocaleString()}</dd></div>
        <div><dt>ATK</dt><dd>{e.atk.toLocaleString()}</dd></div>
        <div><dt>DEF</dt><dd>{e.def.toLocaleString()}</dd></div>
        <div><dt>SPD</dt><dd>{e.spd.toLocaleString()}</dd></div>
      </dl>
      {e.skills.map((k) => data.skills[k] && (
        <div key={k} className="enemy-skill">
          <div className="enemy-skill-name" lang="ja">{tr(data.skills[k].name, lang)}</div>
          <EffectList effects={data.skills[k].effects} />
        </div>
      ))}
    </div>
  );
}
