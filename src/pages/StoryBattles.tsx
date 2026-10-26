import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Breadcrumbs, LoadState, Panel, SegmentedButtons } from "@altterisk/game-hub";
import {
  ENEMY_ICONS, tr, useData, useLang, type BattleBoss, type BattleEnemy, type Battles, type StorySection,
} from "../data";
import { EffectList, ElementIcon } from "../components";
import { BundleImage } from "../bundleImage";
import { StoryBanner } from "./StoryList";

const BOSS_ICONS = "image_bos_s_assets_all";
// reactflow + dagre only load when a boss flowchart is shown
const BossFlow = lazy(() => import("../bossFlow"));
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
          {data && <p className="muted">{[
            data.quests.length && `${data.quests.length} quests`,
            Object.keys(data.enemies).length && `${Object.keys(data.enemies).length} enemies`,
            data.bosses.length && `${data.bosses.length} raid boss tiers`,
          ].filter(Boolean).join(" · ")}</p>}
        </div>
      </div>
      <LoadState loading={loading && !data} error={error} />
      {data && data.bosses.length > 0 && (
        <Panel title="Raid bosses"><RaidBosses bosses={data.bosses} data={data} /></Panel>
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

/** One boss at a time, picked by difficulty (and by boss when a raid has several). */
function RaidBosses({ bosses, data }: { bosses: BattleBoss[]; data: Battles }) {
  const lang = useLang();
  const names = new Set(bosses.map((b) => tr(b.name, lang)));
  const label = (b: BattleBoss) => (names.size > 1 ? `${tr(b.name, lang)} · ` : "") + (RAID_DIFFICULTY[b.difficulty] ?? `Difficulty ${b.difficulty}`);
  const [pick, setPick] = useState(String(bosses[0].id));
  const b = bosses.find((x) => String(x.id) === pick) ?? bosses[0];
  return (
    <>
      {bosses.length > 1 && (
        <SegmentedButtons label="Difficulty" selected={[String(b.id)]}
          options={bosses.map((x) => ({ value: String(x.id), label: `${label(x)} (Lv ${x.level})` }))}
          onToggle={setPick} />
      )}
      <EnemyCard e={b} data={data} label={label(b)} open />
    </>
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
      {open && <BossBehaviour e={e} data={data} />}
    </div>
  );
}

/** How the boss picks its skills: the game's default, then its scripted rules by phase. */
function BossBehaviour({ e, data }: { e: BattleBoss; data: Battles }) {
  const lang = useLang();
  const rules = e.ai ?? [];
  const skillName = useCallback((i: number) => tr(data.skills[e.skills[i]]?.name, lang) || `Skill ${i + 1}`,
    [data, e, lang]);
  const [view, setView] = useState("flow");
  const phases = [...new Set(rules.map((r) => r.phase))].sort((a, b) => (a ?? 0) - (b ?? 0));
  return (
    <div className="boss-ai">
      <div className="boss-ai-top">
        <h3>Behaviour</h3>
        {rules.length > 0 && (
          <SegmentedButtons label="View" selected={[view]} onToggle={setView}
            options={[{ value: "flow", label: "Flowchart" }, { value: "list", label: "List" }]} />
        )}
      </div>
      <p className="muted small">{rules.length ? "Otherwise it uses" : "It uses"} the last skill in its list that it has SP for.
        {rules.length > 0 && view === "flow" && " The order of the checks within a phase is not verified yet."}</p>
      {rules.length > 0 && view === "flow" && (
        <Suspense fallback={<p className="muted small">Loading flowchart…</p>}>
          <BossFlow rules={rules} skillName={skillName} />
        </Suspense>
      )}
      {view === "list" && phases.map((ph) => (
        <div key={ph ?? "any"} className="boss-ai-phase">
          {ph !== null && <div className="boss-ai-head">Phase {ph}</div>}
          <ul>
            {rules.filter((r) => r.phase === ph).map((r, i) => (
              <li key={i}><span className="boss-ai-when">{r.when}</span>: {r.do}
                {r.skill !== null && <> <b lang="ja">{skillName(r.skill)}</b></>}</li>
            ))}
          </ul>
        </div>
      ))}
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
      {/* Running raids' skills have no names in the client's strings: number them. */}
      <ol className={`enemy-skills${e.skills.every((k) => !tr(data.skills[k]?.name, lang)) ? " numbered" : ""}`}>
        {e.skills.map((k, i) => data.skills[k] && (
          <li key={k} className="enemy-skill">
            <div className="enemy-skill-name" lang="ja">{tr(data.skills[k].name, lang) || <span lang="en">Skill {i + 1}</span>}</div>
            <EffectList effects={data.skills[k].effects} />
          </li>
        ))}
      </ol>
    </div>
  );
}
