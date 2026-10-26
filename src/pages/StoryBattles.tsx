import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Breadcrumbs, LoadState, Panel, SegmentedButtons, TabPanel, UrlTabs } from "@altterisk/game-hub";
import {
  ENEMY_ICONS, iconUrl, tr, useData, useLang, type BattleBoss, type BattleEnemy, type BattleQuest, type Battles,
  type QuestDrop, type StorySection,
} from "../data";
import { EffectList, ElementIcon } from "../components";
import { BundleImage } from "../bundleImage";
import { StoryBanner } from "./StoryList";

const BOSS_ICONS = "image_bos_s_assets_all";
// reactflow + dagre only load when a boss flowchart is shown
const BossFlow = lazy(() => import("../bossFlow"));
// quest difficulty 1-3: the game's 初級 / 中級 / 上級
const DIFFICULTY = ["", "Beginner", "Intermediate", "Advanced", "Expert", "Master"];
const ITEM_ICONS = "image_item_s_assets_all";
const BOSS_TABS = [{ id: "skills", label: "Skills" }, { id: "ai", label: "AI" }] as const;
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
  // one stage per section: its difficulties, between the story parts it sits in,
  // in the order those parts come in the chapter
  const stages = useMemo(() => {
    const m = new Map<string, BattleQuest[]>();
    for (const q of data?.quests ?? []) {
      const k = `${q.scripts.join("|")}#${q.section}`;
      m.set(k, [...(m.get(k) ?? []), q]);
    }
    const at = (q: BattleQuest) => found?.g.parts.findIndex((p) => q.scripts.includes(p.id)) ?? 0;
    return [...m.values()].sort((a, b) => at(a[0]) - at(b[0]) || a[0].section - b[0].section);
  }, [data, found]);
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
      {data && stages.map((quests) => (
        <Panel key={quests[0].id} title={<>Stage {quests[0].section}</>}>
          <Stage quests={quests} data={data} partTitle={partTitle} />
        </Panel>
      ))}
      {data && !data.quests.length && !data.bosses.length && <p className="muted">No battle data for this story.</p>}
      <p className="muted small">Enemy names and skills are the game's own data; skill lines are decoded from it.
        "Enemy" in a skill line means your units, as seen by the enemy.</p>
    </div>
  );
}

/** One stage: story before and after, a tab per difficulty, rewards, waves, drops. */
function Stage({ quests, data, partTitle }: { quests: BattleQuest[]; data: Battles; partTitle: (s: string) => string }) {
  const [pick, setPick] = useState(String(quests[0].id));
  const q = quests.find((x) => String(x.id) === pick) ?? quests[0];
  const label = (d: number) => DIFFICULTY[d] ?? `Difficulty ${d}`;
  return (
    <div className="stage" id={`section-${q.scripts[0]}`}>
      <div className="stage-story">
        {q.scripts.map((sc, i) => (
          <Link key={sc} to={`/story/${sc}`}>{q.scripts.length === 2 ? (i ? "After: " : "Before: ") : "Story: "}
            <span lang="ja">{partTitle(sc)}</span></Link>
        ))}
      </div>
      {quests.length > 1 && (
        <SegmentedButtons label="Difficulty" selected={[String(q.id)]} onToggle={setPick}
          options={quests.map((x) => ({ value: String(x.id), label: label(x.difficulty) }))} />
      )}
      <div className="stage-rewards">
        <span>AP <b>{q.ap}</b></span>
        <span>Player EXP <b>{q.userExp.toLocaleString()}</b></span>
        <span>Unit EXP <b>{q.unitExp.toLocaleString()}</b></span>
        <span>Gold <b>{q.gold.toLocaleString()}</b></span>
      </div>
      {q.waves.map((w, i) => (
        <div key={i} className="wave">
          <span className="wave-no muted">Wave {i + 1}</span>
          <div className="wave-enemies">
            {w.map(([eid], j) => data.enemies[eid] && <EnemyChip key={j} e={data.enemies[eid]} data={data} />)}
          </div>
        </div>
      ))}
      <Drops drops={q.drops} />
    </div>
  );
}

const DROP_KINDS: [keyof BattleQuest["drops"], string][] = [
  ["enemy", "Drops"], ["rare", "Rare enemy drops"], ["boss", "Boss drops"], ["luck", "Luck bonus drops"],
];

function Drops({ drops }: { drops: BattleQuest["drops"] }) {
  if (!Object.keys(drops).length) return null;
  return (
    <div className="drops">
      {DROP_KINDS.filter(([k]) => drops[k]?.length).map(([k, title]) => {
        const list = drops[k]!;
        const groups = new Set(list.map((d) => d.group ?? d.frame)).size > 1;
        return (
          <div key={k}>
            <h4>{title}</h4>
            <ul className="drop-list">{list.map((d, i) => <DropLine key={i} d={d} showGroup={groups} />)}</ul>
          </div>
        );
      })}
      <p className="muted small">Rates as listed in the client (out of 10,000); the roll itself happens on the server.</p>
    </div>
  );
}

function DropLine({ d, showGroup }: { d: QuestDrop; showGroup: boolean }) {
  const lang = useLang();
  const name = d.type === "gold" ? "Gold" : d.type === "jewel" ? "Jewels" : tr(d.name ?? null, lang) || d.id;
  const icon = d.type === "item" && d.icon
    ? <BundleImage stem={ITEM_ICONS} name={`${d.icon}_s`} width={32} height={32} className="drop-icon" />
    : d.type === "unit" && d.unit ? <img src={iconUrl(d.unit)} alt="" width={32} height={32} className="drop-icon" />
      : <span className="drop-icon" />;
  const nameEl = d.type === "unit" && d.unit ? <Link to={`/units/${d.unit}`}>{name}</Link> : name;
  return (
    <li title={d.id}>
      {icon}
      <span lang="ja">{nameEl} ×{d.num.toLocaleString()}
        {showGroup && <span className="drop-group"> · {d.frame !== undefined ? `frame ${d.frame}` : `group ${d.group}`}</span>}</span>
      <span className="drop-rate">{(d.rate / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%</span>
    </li>
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
  const [tab, setTab] = useState<string>("skills");
  const idBase = `boss-${e.id}`;
  return (
    <div className="enemy-card">
      <div className="enemy-card-head">
        <EnemyIcon icon={e.icon} size={56} />
        <div>
          <div className="enemy-name" lang="ja">{tr(e.name, lang)}</div>
          <div className="muted small"><ElementIcon element={e.element} size={13} /> {label} · Lv {e.level}</div>
        </div>
      </div>
      {open && (
        <>
          <EnemyDetail e={e} data={data} skills={false} />
          <UrlTabs tabs={BOSS_TABS} active={tab} onChange={setTab} idBase={idBase} label="Boss details" />
          <TabPanel tab={tab} idBase={idBase}>
            {tab === "skills" ? <EnemySkills e={e} data={data} /> : <BossBehaviour e={e} data={data} />}
          </TabPanel>
        </>
      )}
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

function EnemyDetail({ e, data, skills = true }: { e: BattleEnemy; data: Battles; skills?: boolean }) {
  return (
    <div className="enemy-detail">
      <dl className="enemy-stats">
        <div><dt>HP</dt><dd>{e.hp.toLocaleString()}</dd></div>
        <div><dt>ATK</dt><dd>{e.atk.toLocaleString()}</dd></div>
        <div><dt>DEF</dt><dd>{e.def.toLocaleString()}</dd></div>
        <div><dt>SPD</dt><dd>{e.spd.toLocaleString()}</dd></div>
      </dl>
      {skills && <EnemySkills e={e} data={data} />}
    </div>
  );
}

function EnemySkills({ e, data }: { e: BattleEnemy; data: Battles }) {
  const lang = useLang();
  return (
    <div className="enemy-detail">
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
