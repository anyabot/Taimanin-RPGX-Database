// The battle view shared by story chapters (/story/battles/:id) and the
// story-less modes (/quests/:id): raid bosses, then one panel per stage.
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Panel, SegmentedButtons, TabPanel, UrlTabs } from "@altterisk/game-hub";
import {
  ENEMY_ICONS, iconUrl, tr, useLang, type BattleBoss, type BattleEnemy, type BattleQuest, type Battles,
  type BattleEvent, type LuckTier, type QuestDrop,
} from "./data";
import { EffectList, ElementIcon } from "./components";
import { BundleImage } from "./bundleImage";
import "./battles.css";

const BOSS_ICONS = "image_bos_s_assets_all";
const ITEM_ICONS = "image_item_s_assets_all";
// reactflow + dagre only load when a flowchart is shown
const BossFlow = lazy(() => import("./bossFlow"));
// quest difficulty 1-3: the game's 初級 / 中級 / 上級
export const DIFFICULTY = ["", "Beginner", "Intermediate", "Advanced", "Expert", "Master", "Legend"];
const difficulty = (d: number) => DIFFICULTY[d] ?? `Difficulty ${d}`;
// difficulty / rank suffixes the game puts on quest titles ("～初級～")
const TITLE_SUFFIX = /[～~](初級|中級|上級|超上級|超級|極級)[～~]\s*$/;
const pct = (n: number) => `${(n / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

/** Raid bosses, then every stage. `order` places a stage (story: its position in the chapter). */
export function BattleBody({ data, partTitle, order }: {
  data: Battles; partTitle?: (script: string) => string; order?: (q: BattleQuest) => number;
}) {
  const lang = useLang();
  // one stage per section (and story parts): its difficulties together
  const stages = useMemo(() => {
    const m = new Map<string, BattleQuest[]>();
    for (const q of data.quests) {
      const k = `${q.scripts.join("|")}#${q.section}`;
      m.set(k, [...(m.get(k) ?? []), q]);
    }
    const at = order ?? (() => 0);
    return [...m.values()].sort((a, b) => at(a[0]) - at(b[0]) || a[0].section - b[0].section);
  }, [data, order]);
  // quest titles name the stage only where they differ between stages
  const titled = useMemo(() => new Set(stages.map((s) => tr(s[0].title, "ja").replace(TITLE_SUFFIX, ""))).size > 1,
    [stages]);
  const noun = data.stage ?? "Stage";
  const stageName = (q: BattleQuest) => {
    if (q.stageTitle) return tr(q.stageTitle, lang);
    const t = titled ? tr(q.title, lang).replace(TITLE_SUFFIX, "") : "";
    return `${noun} ${q.section}${t ? ` · ${t}` : ""}`;
  };
  const stageOf = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of stages) for (const q of s) m.set(q.id, `${stageName(q)} (${difficulty(q.difficulty)})`);
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, lang, titled]);

  return (
    <>
      {data.event && <Panel title="Event"><EventInfo ev={data.event} /></Panel>}
      {data.bosses.length > 0 && (
        <Panel title="Raid bosses"><RaidBosses bosses={data.bosses} data={data} stageOf={stageOf} /></Panel>
      )}
      {stages.map((quests) => (
        <Panel key={quests[0].id} title={<span lang="ja">{stageName(quests[0])}</span>}>
          <Stage quests={quests} data={data} partTitle={partTitle} />
        </Panel>
      ))}
      {!data.quests.length && !data.bosses.length && <p className="muted">No battle data.</p>}
      <p className="muted small">Enemy names and skills are the game's own data; skill lines, rules and AI are decoded from it.
        "Enemy" in a skill line means your units, as seen by the enemy.</p>
    </>
  );
}

/** One stage: story before and after, a tab per difficulty, rules, rewards, waves, drops. */
function Stage({ quests, data, partTitle }: { quests: BattleQuest[]; data: Battles; partTitle?: (s: string) => string }) {
  const lang = useLang();
  const [pick, setPick] = useState(String(quests[0].id));
  const q = quests.find((x) => String(x.id) === pick) ?? quests[0];
  const raid = data.raidRates?.[q.id];
  const spends = q.ap || q.userExp || q.unitExp || q.gold;
  return (
    <div className="stage" id={`quest-${q.id}`}>
      {q.scripts.length > 0 && (
        <div className="stage-story">
          {q.scripts.map((sc, i) => (
            <Link key={sc} to={`/story/${sc}`}>{q.scripts.length === 2 ? (i ? "After: " : "Before: ") : "Story: "}
              <span lang="ja">{partTitle ? partTitle(sc) : sc}</span></Link>
          ))}
        </div>
      )}
      {quests.length > 1 && (
        <SegmentedButtons label="Difficulty" selected={[String(q.id)]} onToggle={setPick}
          options={quests.map((x) => ({ value: String(x.id), label: difficulty(x.difficulty) }))} />
      )}
      {spends ? (
        <div className="stage-rewards">
          <span>AP <b>{q.ap}</b></span>
          <span>Player EXP <b>{q.userExp.toLocaleString()}</b></span>
          <span>Unit EXP <b>{q.unitExp.toLocaleString()}</b></span>
          <span>Gold <b>{q.gold.toLocaleString()}</b></span>
        </div>
      ) : null}
      {q.rules && q.rules.length > 0 && (
        <div className="stage-rules">
          <h4>Special rules</h4>
          <ul>{q.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      {q.missions && q.missions.length > 0 && (
        <div className="stage-missions">
          <h4>Missions</h4>
          <ol>{q.missions.map((m, i) => <li key={i} lang="ja">{tr(m, lang)}</li>)}</ol>
        </div>
      )}
      {q.reward && (
        <div className="stage-first-clear"><h4>First clear</h4><ul className="drop-list"><DropLine d={q.reward} /></ul></div>
      )}
      {q.waves.map((w, i) => (
        <div key={i} className="wave">
          <span className="wave-no muted">Wave {i + 1}</span>
          <div className="wave-enemies">
            {w.map(([eid], j) => data.enemies[eid] && <EnemyChip key={j} e={data.enemies[eid]} data={data} />)}
          </div>
        </div>
      ))}
      {(q.raidChance || raid) ? (
        <p className="stage-raid small">
          {q.raidChance ? <>Raid boss on clear: <b>{pct(q.raidChance)}</b></> : null}
          {raid && raid.some(Boolean) && <> · tier odds {raid.map((r, i) => r ? `${difficulty(i + 1)} ${pct(r)}` : null)
            .filter(Boolean).join(", ")}</>}
        </p>
      ) : null}
      <Drops drops={q.drops} />
      {q.luckRewards?.length ? <LuckRewards tiers={q.luckRewards} /> : null}
    </div>
  );
}

/** A stage's luck rewards, folded away. */
function LuckRewards({ tiers }: { tiers: LuckTier[] }) {
  return (
    <details className="luck-rewards">
      <summary>Luck rewards ({tiers.length} tiers)</summary>
      <LuckTiers tiers={tiers} />
    </details>
  );
}

/** A running event: dates, bonus units, reward shop, box gacha, lap rewards. */
function EventInfo({ ev }: { ev: BattleEvent }) {
  return (
    <div className="event-info">
      <p className="small">{ev.start} – {ev.end}{ev.exchangeEnd ? ` · exchange until ${ev.exchangeEnd}` : ""}</p>
      {ev.bonus.length > 0 && (
        <div>
          <h4>Bonus units</h4>
          <ul className="drop-list">{ev.bonus.map((b, i) => (
            <DropLine key={i} d={{ ...b, rate: undefined }} note={`luck +${b.luckRate.toLocaleString()}%`} />
          ))}</ul>
          <p className="muted small">Each bonus unit in the team adds the listed % of its own Luck.</p>
        </div>
      )}
      {ev.shop && ev.shop.length > 0 && (
        <div>
          <h4>Reward shop</h4>
          <ul className="drop-list">{ev.shop.map((r, i) => (
            <DropLine key={i} d={r} note={`${r.cost.toLocaleString()} pt${r.max > 1 ? ` · ×${r.max}` : ""}`} />
          ))}</ul>
        </div>
      )}
      {ev.gacha && <BoxGacha gacha={ev.gacha} />}
      {ev.laps && ev.laps.length > 0 && (
        <details>
          <summary>Lap rewards ({ev.laps.length})</summary>
          <ul className="drop-list">{ev.laps.map((r, i) => <DropLine key={i} d={r} note={`lap ${r.lap}`} />)}</ul>
        </details>
      )}
    </div>
  );
}

function BoxGacha({ gacha }: { gacha: NonNullable<BattleEvent["gacha"]> }) {
  const [box, setBox] = useState(String(gacha.boxes[0]?.box ?? 1));
  const b = gacha.boxes.find((x) => String(x.box) === box) ?? gacha.boxes[0];
  if (!b) return null;
  const total = b.items.reduce((n, x) => n + x.max, 0);
  return (
    <div>
      <h4>Box gacha{gacha.start ? ` (${gacha.start} – ${gacha.end})` : ""}</h4>
      {gacha.boxes.length > 1 && (
        <SegmentedButtons label="Box" selected={[box]} onToggle={setBox}
          options={gacha.boxes.map((x) => ({ value: String(x.box), label: `Box ${x.box}` }))} />
      )}
      <ul className="drop-list">{b.items.map((r, i) => (
        <DropLine key={i} d={r} note={`${r.max} in box${r.main ? " · headline" : ""}`} />
      ))}</ul>
      <p className="muted small">{total.toLocaleString()} draws empty the box.</p>
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
      {DROP_KINDS.filter(([k]) => drops[k]?.length).map(([k, title]) => (
        <DropBlock key={k} title={title} list={drops[k]!} />
      ))}
      <p className="muted small">Rates as listed in the client (out of 10,000); the roll itself happens on the server.</p>
    </div>
  );
}

function DropBlock({ title, list }: { title: string; list: QuestDrop[] }) {
  const groups = new Set(list.map((d) => d.group ?? d.frame)).size > 1;
  return (
    <div>
      <h4>{title}</h4>
      <ul className="drop-list">{list.map((d, i) => <DropLine key={i} d={d} showGroup={groups} />)}</ul>
    </div>
  );
}

export function DropLine({ d, showGroup, note }: { d: QuestDrop; showGroup?: boolean; note?: string }) {
  const lang = useLang();
  const name = d.type === "gold" ? "Gold" : d.type === "jewel" ? "Jewels" : tr(d.name ?? null, lang) || d.id;
  const icon = d.type === "item" && d.icon
    ? <BundleImage stem={ITEM_ICONS} name={`${d.icon}_s`} width={32} height={32} className="drop-icon" />
    : d.type === "unit" && d.unit ? <img src={iconUrl(d.unit)} alt="" width={32} height={32} className="drop-icon" />
      : <span className="drop-icon" />;
  const nameEl = d.type === "unit" && d.unit ? <Link to={`/units/${d.unit}`}>{name}</Link> : name;
  const extra = [
    showGroup && (d.frame !== undefined ? `frame ${d.frame}` : d.group ? `group ${d.group}` : null),
    d.range && `rank ${d.range[0].toLocaleString()}–${d.range[1].toLocaleString()}`,
  ].filter(Boolean).join(" · ");
  return (
    <li title={d.id}>
      {icon}
      <span lang="ja">{nameEl}{d.type === "unit" && d.num === 1 ? "" : ` ×${d.num.toLocaleString()}`}
        {extra && <span className="drop-group"> · {extra}</span>}</span>
      <span className="drop-rate">{note ?? (d.rate !== undefined ? pct(d.rate) : "")}</span>
    </li>
  );
}

function EnemyIcon({ icon, size = 48 }: { icon: string | null; size?: number }) {
  return icon ? <BundleImage stem={icon.startsWith("bos_") ? [ENEMY_ICONS, BOSS_ICONS] : ENEMY_ICONS} name={`${icon}_s`}
    width={size} height={size} className="enemy-icon" />
    : <span className="bundle-image enemy-icon" style={{ width: size, height: size }} />;
}

/** One enemy in a wave: icon, name, level; opens its stats, skills and AI. */
function EnemyChip({ e, data }: { e: BattleEnemy; data: Battles }) {
  const [open, setOpen] = useState(false);
  const lang = useLang();
  return (
    <div className={`enemy-chip${open ? " open" : ""}`}>
      <button className="enemy-chip-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <EnemyIcon icon={e.icon} size={40} />
        <span className="enemy-chip-text">
          <span lang="ja" className="enemy-name">{tr(e.name, lang)}</span>
          <span className="enemy-meta muted"><ElementIcon element={e.element} size={13} /> Lv {e.level}
            {e.ai?.length ? <span className="enemy-ai-tag" title="Has scripted behaviour">AI</span> : null}</span>
        </span>
      </button>
      {open && <EnemyTabs e={e} data={data} idBase={`enemy-${e.icon}-${e.level}-${e.hp}`} />}
    </div>
  );
}

const ENEMY_TABS = [{ id: "skills", label: "Skills" }, { id: "ai", label: "AI" }] as const;

function EnemyTabs({ e, data, idBase }: { e: BattleEnemy; data: Battles; idBase: string }) {
  const [tab, setTab] = useState("skills");
  return (
    <div className="enemy-detail">
      <EnemyStats e={e} />
      {e.ai?.length ? (
        <>
          <UrlTabs tabs={ENEMY_TABS} active={tab} onChange={setTab} idBase={idBase} label="Enemy details" />
          <TabPanel tab={tab} idBase={idBase}>
            {tab === "skills" ? <EnemySkills e={e} data={data} /> : <Behaviour e={e} data={data} />}
          </TabPanel>
        </>
      ) : <EnemySkills e={e} data={data} />}
    </div>
  );
}

/** Raid bosses: pick the boss (when there are several), then its tier. */
function RaidBosses({ bosses, data, stageOf }: { bosses: BattleBoss[]; data: Battles; stageOf: Map<number, string> }) {
  const lang = useLang();
  const names = useMemo(() => [...new Set(bosses.map((b) => tr(b.name, lang)))], [bosses, lang]);
  const [who, setWho] = useState(names[0]);
  const tiers = bosses.filter((b) => tr(b.name, lang) === who);
  const list = tiers.length ? tiers : bosses;
  const [pick, setPick] = useState(String(list[0].id));
  const b = list.find((x) => String(x.id) === pick) ?? list[0];
  return (
    <>
      {names.length > 1 && (
        <SegmentedButtons label="Boss" selected={[who]} onToggle={(v) => { setWho(v); setPick(""); }}
          options={names.map((n) => ({ value: n, label: n }))} />
      )}
      {list.length > 1 && (
        <SegmentedButtons label="Difficulty" selected={[String(b.id)]} onToggle={setPick}
          options={list.map((x) => ({ value: String(x.id), label: `${difficulty(x.difficulty)} (Lv ${x.level})` }))} />
      )}
      <BossCard key={b.id} e={b} data={data} stageOf={stageOf} />
    </>
  );
}

function BossCard({ e, data, stageOf }: { e: BattleBoss; data: Battles; stageOf: Map<number, string> }) {
  const lang = useLang();
  const tabs = useMemo(() => [
    { id: "skills", label: "Skills" }, { id: "ai", label: "AI" },
    ...(e.rewards && Object.keys(e.rewards).length ? [{ id: "rewards", label: "Rewards" }] : []),
    ...(e.luckRewards?.length ? [{ id: "luck", label: "Luck rewards" }] : []),
  ], [e]);
  const [tab, setTab] = useState("skills");
  const idBase = `boss-${e.id}`;
  // the stages (any difficulty) whose clear can find this boss
  const where = [...new Set((e.appearsIn ?? []).map((q) => stageOf.get(q)?.replace(/ \([^)]*\)$/, "")).filter(Boolean))];
  return (
    <div className="enemy-card">
      <div className="enemy-card-head">
        <EnemyIcon icon={e.icon} size={56} />
        <div>
          <div className="enemy-name" lang="ja">{tr(e.name, lang)}</div>
          <div className="muted small"><ElementIcon element={e.element} size={13} /> {difficulty(e.difficulty)} · Lv {e.level}
            {e.turnLimit ? ` · ${e.turnLimit} turn limit` : ""}</div>
        </div>
      </div>
      {(where.length > 0 || e.challenge) && (
        <div className="boss-facts small">
          {where.length > 0 && <div><span className="muted">Found after clearing:</span> <span lang="ja">{where.join(" · ")}</span></div>}
          {e.challenge && (
            <div><span className="muted">Raid challenge{e.challenge.start ? ` (from ${e.challenge.start})` : ""}:</span>{" "}
              {e.challenge.ticket.num} × <span lang="ja">{tr(e.challenge.ticket.name ?? null, lang) || e.challenge.ticket.id}</span>,
              {" "}{e.challenge.perDay} per day</div>
          )}
        </div>
      )}
      {e.points && e.points.length > 0 && (
        <div className="boss-facts small"><span className="muted">Bonus points:</span>{" "}
          {e.points.map((p, i) => <span key={i} className="boss-point" lang="ja">{tr(p.text, lang)} +{p.points}</span>)}</div>
      )}
      {e.rules && e.rules.length > 0 && <ul className="stage-rules boss-rules">{e.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>}
      <div className="enemy-detail">
        <EnemyStats e={e} />
        <UrlTabs tabs={tabs} active={tab} onChange={setTab} idBase={idBase} label="Boss details" />
        <TabPanel tab={tab} idBase={idBase}>
          {tab === "skills" ? <EnemySkills e={e} data={data} />
            : tab === "ai" ? <Behaviour e={e} data={data} />
              : tab === "luck" ? <LuckTiers tiers={e.luckRewards!} /> : <BossRewards rewards={e.rewards!} />}
        </TabPanel>
      </div>
    </div>
  );
}

const REWARD_KINDS: [keyof NonNullable<BattleBoss["rewards"]>, string][] = [
  ["discover", "Discoverer"], ["mvp", "MVP"], ["semi", "Runner-up MVP"], ["destroy", "Participants (on defeat)"],
];

function BossRewards({ rewards }: { rewards: NonNullable<BattleBoss["rewards"]> }) {
  return (
    <div className="drops">
      {REWARD_KINDS.filter(([k]) => rewards[k]?.length).map(([k, title]) => <DropBlock key={k} title={title} list={rewards[k]!} />)}
      <p className="muted small">Rates as listed in the client (out of 10,000) within each group; the roll happens on the server.</p>
    </div>
  );
}

/** Rewards by the team's total luck (and for raid bosses, by contribution). */
function LuckTiers({ tiers }: { tiers: LuckTier[] }) {
  const range = (r: [number, number]) => r[1] >= 99999 ? `${r[0].toLocaleString()}+` : `${r[0].toLocaleString()}–${r[1].toLocaleString()}`;
  return (
    <div className="drops">
      {tiers.map((t, i) => (
        <DropBlock key={i} list={t.drops}
          title={`Luck ${range(t.luck)}${t.contribution ? ` · contribution ${range(t.contribution)}` : ""}`} />
      ))}
      <p className="muted small">Total luck of the team, bonus units included; rates as listed (out of 10,000).</p>
    </div>
  );
}

/** How an enemy picks its skills: the game's default, then its scripted rules by phase. */
function Behaviour({ e, data }: { e: BattleEnemy; data: Battles }) {
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

function EnemyStats({ e }: { e: BattleEnemy }) {
  const el = Object.entries(e.res?.element ?? {});
  const ab = Object.entries(e.res?.ailment ?? {});
  return (
    <>
      <dl className="enemy-stats">
        <div><dt>HP</dt><dd>{e.hp.toLocaleString()}</dd></div>
        {e.sp !== undefined && <div><dt>SP</dt><dd>{e.sp.toLocaleString()}</dd></div>}
        <div><dt>ATK</dt><dd>{e.atk.toLocaleString()}</dd></div>
        <div><dt>DEF</dt><dd>{e.def.toLocaleString()}</dd></div>
        <div><dt>SPD</dt><dd>{e.spd.toLocaleString()}</dd></div>
      </dl>
      {e.traits?.length ? <div className="enemy-traits">{e.traits.map((t) => <span key={t} className="trait-chip">{t}</span>)}</div> : null}
      {(el.length > 0 || ab.length > 0) && (
        <div className="enemy-res small">
          {el.length > 0 && <div><span className="muted">Element resist:</span> {el.map(([k, v]) => (
            <span key={k} className={`res ${v < 0 ? "weak" : "strong"}`}><ElementIcon element={k} size={13} /> {v > 0 ? "+" : ""}{v}%</span>
          ))}</div>}
          {ab.length > 0 && <div><span className="muted">Ailment resist:</span> {byValue(ab).map(([v, ks]) => (
            <span key={v} className="res">{ks.join(", ")} {v}%</span>
          ))}</div>}
        </div>
      )}
    </>
  );
}

/** [["Sleep", 999], ["Poison", 999], ["Burn", 50]] -> [[999, ["Sleep", "Poison"]], [50, ["Burn"]]] */
function byValue(list: [string, number][]): [number, string[]][] {
  const m = new Map<number, string[]>();
  for (const [k, v] of list) m.set(v, [...(m.get(v) ?? []), k]);
  return [...m.entries()];
}

function EnemySkills({ e, data }: { e: BattleEnemy; data: Battles }) {
  const lang = useLang();
  return (
    // Running raids' skills have no names in the client's strings: number them.
    <ol className={`enemy-skills${e.skills.every((k) => !tr(data.skills[k]?.name, lang)) ? " numbered" : ""}`}>
      {e.skills.map((k, i) => data.skills[k] && (
        <li key={k} className="enemy-skill">
          <div className="enemy-skill-name" lang="ja">{tr(data.skills[k].name, lang) || <span lang="en">Skill {i + 1}</span>}</div>
          <EffectList effects={data.skills[k].effects} />
        </li>
      ))}
    </ol>
  );
}
