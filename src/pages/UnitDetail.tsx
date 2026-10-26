import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Breadcrumbs, LevelControl, Lightbox, LoadState, MetaChip, MetaChips, PageHeader, Panel, SegmentedButtons, TabPanel, UrlTabs,
} from "@altterisk/game-hub";
import { searchParamsAdapter } from "@altterisk/game-hub/filters";
import { tabParam } from "@altterisk/game-hub";
import {
  RARITY, STATS, iconUrl, isUpcoming, tr, unitName, useAssets, useData, useLang, voiceUrl, type Skill, type Unit, type UnitForm,
  type UnitIndexEntry, type ObtainEntry,
} from "../data";
import { toImageData } from "../unity/client";
import { EffectList, ElementIcon, RarityIcon } from "../components";
import type { SceneDoc } from "../adv";

const TABS = [
  { id: "stats", label: "Stats" },
  { id: "skills", label: "Skills" },
  { id: "leader", label: "Leader & abilities" },
  { id: "voices", label: "Voices" },
  { id: "obtain", label: "Obtain" },
  { id: "profile", label: "Profile" },
  { id: "art", label: "Art" },
  { id: "scenes", label: "Scenes" },
];

const SLOT_LABEL: Record<Skill["slot"], string> = { attack: "Normal attack", skill1: "Skill 1", skill2: "Skill 2", ultimate: "Ultimate" };

/** Linear between Lv1 and max level: the game stores only the two ends. */
const statAt = ([lo, hi]: [number, number], lv: number, max: number) =>
  max <= 1 ? hi : Math.floor(lo + ((hi - lo) * (lv - 1)) / (max - 1));

export default function UnitDetail() {
  const { id = "" } = useParams();
  const { data: unit, loading, error } = useData<Unit>(`units/${id}`);
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = tabParam(searchParamsAdapter(params, setParams), TABS);
  const [formIdx, setFormIdx] = useState<number | null>(null);
  const form = unit ? unit.forms[formIdx ?? unit.forms.length - 1] : null;

  if (!unit || !form) return <LoadState loading={loading} error={error} />;
  const name = unitName(unit, lang);

  return (
    <div className="unit-page">
      <Breadcrumbs items={[{ label: "Units", href: "#/units" }, { label: name }]} />
      <PageHeader
        art={<img src={iconUrl(unit.id)} alt="" width={96} height={96} />}
        title={name}
        subtitle={tr(unit.title, lang)}
        id={unit.id}
        badges={<>
          <RarityIcon rarity={unit.rarity} height={22} />
          <ElementIcon element={unit.element} size={24} />
          {unit.limited && <span className="hub-badge">Limited</span>}
          {isUpcoming(unit) && <span className="hub-badge">Upcoming</span>}
        </>}
        meta={<MetaChips>
          {unit.traits.map((t) => <MetaChip key={t} label="Trait" value={t} href={`#/units?trait=${encodeURIComponent(t)}`} />)}
          {unit.roles.map((r) => <MetaChip key={r} label="Role" value={r} />)}
          {unit.release && <MetaChip label="Released" value={unit.release} />}
        </MetaChips>}
      />
      <RelatedUnits id={unit.id} />
      {unit.forms.length > 1 && (
        <SegmentedButtons
          label="Form"
          options={unit.forms.map((f, i) => ({ value: String(i), label: `${f.rarityLabel}` }))}
          selected={[String(formIdx ?? unit.forms.length - 1)]}
          onToggle={(v) => setFormIdx(Number(v))}
        />
      )}
      <UrlTabs tabs={TABS} active={tab} onChange={setTab} idBase="unit" />
      <TabPanel tab={tab} idBase="unit">
        {tab === "stats" && <StatsTab key={form.id} form={form} />}
        {tab === "skills" && <SkillsTab unit={unit} form={form} />}
        {tab === "leader" && <LeaderTab unit={unit} />}
        {tab === "voices" && <VoicesTab unit={unit} />}
        {tab === "obtain" && <ObtainTab unit={unit} />}
        {tab === "profile" && <ProfileTab unit={unit} />}
        {tab === "art" && <ArtTab unit={unit} />}
        {tab === "scenes" && <ScenesTab unit={unit} />}
      </TabPanel>
    </div>
  );
}

/** Other versions of the same character (same family key from the exporter). */
function RelatedUnits({ id }: { id: string }) {
  const { data: index } = useData<UnitIndexEntry[]>("units/index");
  const lang = useLang();
  const related = useMemo(() => {
    const self = index?.find((u) => u.id === id);
    if (!self) return [];
    return index!.filter((u) => u.family === self.family && u.id !== id)
      .sort((a, b) => (b.release || "").localeCompare(a.release || ""));
  }, [index, id]);
  if (!related.length) return null;
  return (
    <section className="related-units" aria-label="Other versions">
      <h2>Other versions <span className="muted">({related.length})</span></h2>
      <div className="related-strip">
        {related.map((u) => (
          <Link key={u.id} to={`/units/${u.id}`} className="related-unit" title={`${tr(u.title, lang)} ${unitName(u, lang)}`}>
            <img src={iconUrl(u.id)} alt="" width={64} height={64} loading="lazy" />
            <span className="related-title">{tr(u.title, lang) || unitName(u, lang)}</span>
            <span className="related-meta"><RarityIcon rarity={u.rarity} height={14} /><ElementIcon element={u.element} size={14} /></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function StatsTab({ form }: { form: UnitForm }) {
  const [lv, setLv] = useState(form.levelMax);
  return (
    <Panel title={`${form.rarityLabel} form`} note={`Max level ${form.levelMax}. Values between Lv1 and max are interpolated.`}>
      <LevelControl label="Level" value={lv} min={1} max={form.levelMax} onChange={setLv} marks={[1, form.levelMax]} />
      <table className="hub-table stat-table">
        <thead><tr><th>Stat</th><th>Lv {lv}</th><th>Lv 1</th><th>Lv {form.levelMax}</th></tr></thead>
        <tbody>
          {STATS.map(([k, label]) => (
            <tr key={k}>
              <th scope="row">{label}</th>
              <td><b>{statAt(form.stats[k], lv, form.levelMax)}</b></td>
              <td>{form.stats[k][0]}</td>
              <td>{form.stats[k][1]}</td>
            </tr>
          ))}
          <tr><th scope="row">SP charge</th><td colSpan={3}>{form.spCharge}</td></tr>
        </tbody>
      </table>
    </Panel>
  );
}

function SkillsTab({ unit, form }: { unit: Unit; form: UnitForm }) {
  const lang = useLang();
  return (
    <div className="skill-list">
      {form.skills.map((key) => {
        const s = unit.skills[key];
        if (!s) return null;
        return <SkillCard key={key} skill={s} lang={lang} />;
      })}
    </div>
  );
}

function SkillCard({ skill: s, lang }: { skill: Skill; lang: "en" | "ja" }) {
  const [lvIdx, setLvIdx] = useState(s.levels.length - 1);
  const lv = s.levels[lvIdx];
  // Many skills (every normal attack) read the same at each level.
  const varies = s.levels.some((l) => l.sp !== lv.sp || tr(l.detail, lang) !== tr(lv.detail, lang));
  return (
    <Panel
      title={<>{SLOT_LABEL[s.slot]}{s.name && <> · {tr(s.name, lang)}</>}</>}
      note={[lv.sp ? `SP ${lv.sp}` : "", `${s.hits} hit${s.hits === 1 ? "" : "s"}`, s.cutin ? "cut-in" : ""].filter(Boolean).join(" · ")}
    >
      {varies && (
        <LevelControl label="Skill level" value={lvIdx + 1} min={1} max={s.levels.length} onChange={(v) => setLvIdx(v - 1)} />
      )}
      <p className="skill-detail">{tr(lv.detail, lang)}</p>
      {s.effects.length > 0 && (
        <div className="skill-effects">
          <h4>Effects at max level</h4>
          <EffectList effects={s.effects} />
        </div>
      )}
    </Panel>
  );
}

function LeaderTab({ unit }: { unit: Unit }) {
  const lang = useLang();
  // Ability rows come one per level; group them under their slot.
  const slots = useMemo(() => {
    const m = new Map<number, Unit["abilities"]>();
    for (const a of unit.abilities) m.set(a.slot, [...(m.get(a.slot) || []), a]);
    return [...m.entries()];
  }, [unit]);
  return (
    <>
      {unit.leader ? (
        <Panel title={<>Leader skill · {tr(unit.leader.name, lang)}</>}>
          <p className="skill-detail">{tr(unit.leader.detail, lang)}</p>
          {unit.leader.effects.length > 0 && (
            <div className="skill-effects"><EffectList effects={unit.leader.effects} /></div>
          )}
        </Panel>
      ) : <p>No leader skill.</p>}
      {slots.map(([slot, rows]) => (
        <Panel key={slot} title={<>Ability {slot} · {tr(rows[0].name, lang)}</>}>
          <ol className="ability-levels">
            {rows.map((a, i) => <li key={i}><b>Lv {a.level}</b> {tr(a.description, lang)}</li>)}
          </ol>
        </Panel>
      ))}
      {!slots.length && <p className="muted">This unit has no abilities.</p>}
    </>
  );
}

function VoicesTab({ unit }: { unit: Unit }) {
  const lang = useLang();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const play = (clip: string) => {
    audio.current?.pause();
    const a = new Audio(voiceUrl(clip));
    audio.current = a;
    setPlaying(clip);
    a.onended = () => setPlaying(null);
    a.play().catch(() => setPlaying(null));
  };
  useEffect(() => () => audio.current?.pause(), []);
  const groups = [["base", "Voice lines"], ["r18", "R18 voice lines"]] as const;
  return (
    <>
      {groups.map(([variant, title]) => {
        const list = unit.voices.filter((v) => v.variant === variant);
        if (!list.length) return null;
        return (
          <Panel key={variant} title={title} note={unit.voiceActor ? `CV: ${unit.voiceActor}` : undefined}>
            <ul className="voice-list">
              {list.map((v, i) => (
                <li key={i}>
                  <button className="hub-btn voice-play" disabled={!v.clip} onClick={() => v.clip && play(v.clip)}
                    aria-label={`Play ${v.label} ${v.index}`}>
                    {playing === v.clip ? "■" : "▶"}
                  </button>
                  <span className="voice-label">{v.label} {v.index}</span>
                  <span className="voice-text">{tr(v.text, lang) || <i className="muted">(no text)</i>}</span>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
    </>
  );
}

const KIND_LABEL: Record<ObtainEntry["kind"], string> = {
  gacha: "Gacha", spark: "Spark reward", event: "Event", exchange: "Exchange shop", mission: "Mission reward",
};

function period(e: ObtainEntry) {
  if (e.start && e.end) return `${e.start} – ${e.end}`;
  if (e.end) return `until ${e.end}`;
  if (e.start) return `from ${e.start}`;
  return "";
}

/** How the unit is obtained: featured banners, events, exchanges, missions. */
function ObtainTab({ unit }: { unit: Unit }) {
  const lang = useLang();
  const groups = useMemo(() => {
    const m = new Map<string, ObtainEntry[]>();
    for (const e of unit.obtain) m.set(e.kind, [...(m.get(e.kind) || []), e]);
    return [...m.entries()];
  }, [unit]);
  return (
    <>
      <Panel title="Availability">
        <MetaChips>
          {unit.limited && <MetaChip value="Limited" title="The game's own limited flag" />}
          {unit.standardPool && <MetaChip value="Standard gacha pool" title="In the lineup of the permanent banners" />}
          {!unit.limited && !unit.standardPool && <MetaChip value="Not in the standard pool" />}
          {unit.release && <MetaChip label="Released" value={unit.release} />}
        </MetaChips>
      </Panel>
      {groups.map(([kind, list]) => (
        <Panel key={kind} title={KIND_LABEL[kind as ObtainEntry["kind"]] ?? kind} note={`${list.length}`}>
          <ul className="obtain-list">
            {list.map((e, i) => (
              <li key={i}>
                {e.type && <span className={`obtain-type t-${e.type.replace(/\s+/g, "-")}`}>{e.type}</span>}
                <span className="obtain-title">
                  {tr(e.title, lang) || (kind === "spark" ? `Spark reward${e.need ? ` at ${e.need} pulls` : ""}` : KIND_LABEL[e.kind])}
                  {e.archive && <span className="muted"> (archive)</span>}
                  {e.upcoming && <span className="obtain-upcoming" title="From the next update's data (REVIEW server), not live yet">Upcoming</span>}
                </span>
                {period(e) && <span className="obtain-period muted">{period(e)}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      ))}
      {!groups.length && <p className="muted">No acquisition source found in the master data (older banners are pruned from it).</p>}
      <p className="muted small">Banners are listed where this unit was a rate-up; dates come from the game's master data.
        "Upcoming" entries come from the next update's data and are not live yet.</p>
    </>
  );
}

function ProfileTab({ unit }: { unit: Unit }) {
  const lang = useLang();
  return (
    <Panel title="Profile">
      <p className="profile-text">{tr(unit.profile, lang) || "No profile."}</p>
      <dl className="credits">
        {unit.illustrator && <><dt>Illustrator</dt><dd>{unit.illustrator}</dd></>}
        {unit.voiceActor && <><dt>Voice</dt><dd>{unit.voiceActor}</dd></>}
        {unit.trust.length > 0 && <><dt>Scene unlocks</dt><dd>Trust {unit.trust.join(", ")}</dd></>}
      </dl>
    </Panel>
  );
}

/** Standing art, decoded from the game CDN on demand. Bundle stems are found
 *  in the live catalog: image_chr_{l,xl,ldiff}_..._uni_<id>[_r18]_l_<n>.png */
function ArtTab({ unit }: { unit: Unit }) {
  const { assets, error } = useAssets();
  const [r18, setR18] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<number | null>(null);
  const stems = useMemo(() => {
    if (!assets) return [];
    const re = new RegExp(`^(r18_)?image_chr_(l|xl|ldiff)_assets_image_chr_(l|xl|ldiff)_uni_${unit.id}(_r18)?_l_([0-9]+)[.]png$`);
    return assets.catalog.allStems()
      .map((s) => ({ s, m: re.exec(s) }))
      .filter((x) => x.m && !!x.m[1] === r18)
      .sort((a, b) => Number(a.m![5]) - Number(b.m![5]) || a.s.localeCompare(b.s))
      .map((x) => x.s);
  }, [assets, unit.id, r18]);
  // Blob URLs of decoded art, for the full-screen gallery. Freed only when
  // the tab unmounts: revoking on every change would kill an image still open.
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  useEffect(() => () => Object.values(urlsRef.current).forEach(URL.revokeObjectURL), []);
  const loaded = stems.filter((s) => urls[s]);
  return (
    <>
      <SegmentedButtons label="Art" options={[{ value: "base", label: "Base" }, { value: "r18", label: "R18" }]}
        selected={[r18 ? "r18" : "base"]} onToggle={(v) => setR18(v === "r18")} />
      <LoadState loading={!assets && !error} error={error} />
      {assets && !stems.length && <p className="muted">No art bundles found for this unit.</p>}
      <div className="art-grid">
        {stems.map((s) => (
          <ArtImage key={s} stem={s} openable={!!urls[s]} url={urls[s]}
            onReady={(url) => setUrls((m) => ({ ...m, [s]: url }))}
            onOpen={() => { const i = loaded.indexOf(s); if (i >= 0) setOpen(i); }} />
        ))}
      </div>
      <Lightbox
        items={loaded.map((s, i) => ({
          srcs: [urls[s]], alt: `${unit.id} art ${i + 1}`,
          label: <a className="hub-btn art-download" href={urls[s]} download={artFileName(s)} onClick={(e) => e.stopPropagation()}>Download PNG</a>,
        }))}
        index={open}
        onIndex={setOpen}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

/** "r18_image_chr_xl_assets_image_chr_xl_uni_00001_r18_l_2.png" -> "uni_00001_r18_l_2_xl.png":
 *  l, xl and ldiff reuse the same file names for different pictures. */
function artFileName(stem: string) {
  const m = /image_chr_(l|xl|ldiff)_(uni_.+)\.png$/.exec(stem);
  return m ? `${m[2]}_${m[1]}.png` : `${stem}.png`;
}

function ArtImage({ stem, openable, url, onReady, onOpen }: {
  stem: string; openable: boolean; url?: string; onReady: (url: string) => void; onOpen: () => void;
}) {
  const { assets } = useAssets();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<string>("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!assets) return;
    let live = true;
    setState("loading");
    (async () => {
      try {
        await assets.open(stem, (l, t) => live && setState(`${Math.round((l / (t || l)) * 100)}%`));
        const tex = (await assets.list(stem)).find((e) => e.classId === 28);
        if (!tex) throw new Error("no texture");
        const img = await assets.texture(stem, tex.pathId);
        if (!live || !canvas.current) return;
        canvas.current.width = img.width;
        canvas.current.height = img.height;
        canvas.current.getContext("2d")!.putImageData(toImageData(img), 0, 0);
        setState("");
        canvas.current.toBlob((b) => { if (b && live) onReady(URL.createObjectURL(b)); }, "image/png");
      } catch (e) {
        if (live) setState(String(e));
      }
    })();
    return () => { live = false; };
  }, [assets, stem, attempt]);
  const failed = state && state !== "loading" && !state.endsWith("%");
  return (
    <figure className="art-item">
      <canvas ref={canvas} className={`art-canvas${openable ? " art-ready" : ""}`} onClick={() => openable && onOpen()}
        role={openable ? "button" : undefined} aria-label={openable ? "Open full screen" : undefined} />
      {url && !state && (
        <figcaption className="art-actions">
          <a className="hub-btn art-download" href={url} download={artFileName(stem)}>Download</a>
        </figcaption>
      )}
      {state && (
        <figcaption>
          {state}
          {failed && <button className="hub-btn art-retry" onClick={() => setAttempt((n) => n + 1)}>Retry</button>}
        </figcaption>
      )}
    </figure>
  );
}

/** The unit's H-scenes, by the trust level that unlocks them. Each opens in
 *  the scene player, which loads everything from the game CDN on demand. */
function ScenesTab({ unit }: { unit: Unit }) {
  if (!unit.scenes.length) return <p className="muted">This unit has no scenes.</p>;
  return (
    <Panel title="Scenes" note="Played in the browser from the game's own files; each scene loads when opened.">
      <ol className="scene-list">
        {unit.scenes.map((group, g) => group.map((sid, k) => (
          <li key={sid}>
            <span className="scene-unlock muted">{unit.trust[g] ? `Trust ${unit.trust[g]}` : `Scene ${g + 1}`}{group.length > 1 ? ` · part ${k + 1}` : ""}</span>
            <SceneLink sid={sid} unitId={unit.id} />
          </li>
        )))}
      </ol>
    </Panel>
  );
}

function SceneLink({ sid, unitId }: { sid: string; unitId: string }) {
  const { data, error } = useData<SceneDoc>(`scenes/${sid}`);
  if (error) return <span className="muted">{sid} (not available)</span>;
  return <Link to={`/scenes/${sid}?unit=${unitId}`} lang="ja">{data?.title || sid}</Link>;
}
