import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CardGrid, CheckboxGroup, EmptyState, FallbackImage, FilterPanel, ListToolbar, LoadState, Pager, SearchBox,
} from "@altterisk/game-hub";
import { textMatch } from "@altterisk/game-hub/filters";
import { ElementIcon, RarityIcon } from "../components";
import { ELEMENTS, NO_ORIGIN, ORIGINS, RARITY, iconUrl, isUpcoming, tr, unitName, useData, useLang, type TranslationIndex, type UnitIndexEntry } from "../data";

const PAGE = 72;
const SOURCES = [
  { value: "Standard", label: "Standard pool" }, { value: "Pickup", label: "Pickup gacha" },
  { value: "Limited", label: "Limited gacha" }, { value: "Gosha Festival", label: "Gosha Festival" },
  { value: "Yomihara Festival", label: "Yomihara Festival" }, { value: "Collab Festival", label: "Collab Festival" },  { value: "Collab", label: "Collab gacha" }, { value: "Kessen", label: "Kessen" },
  { value: "Story event", label: "Story event" }, { value: "Raid event", label: "Raid event" },
  { value: "Map event", label: "Map event" }, { value: "exchange", label: "Exchange shop" },
  { value: "spark", label: "Spark reward" }, { value: "mission", label: "Mission reward" },
];
const SORTS = [
  { value: "release", label: "Newest" },
  { value: "rarity", label: "Rarity" },
  { value: "atk", label: "ATK" },
  { value: "hp", label: "HP" },
  { value: "spd", label: "SPD" },
  { value: "id", label: "ID" },
];

export default function UnitList() {
  const { data: units, loading, error } = useData<UnitIndexEntry[]>("units/index");
  const { data: tl } = useData<TranslationIndex>("tl/index");
  const lang = useLang();
  // Filters, search and page live in the URL so back/forward and links keep them.
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const sort = params.get("sort") || "release";
  const page = Number(params.get("page") || "1");
  const csv = (k: string) => (params.get(k) || "").split(",").filter(Boolean);
  const rarityF = csv("rarity");
  const elementF = csv("element");
  const traitF = csv("trait");
  const sourceF = csv("source");
  const originF = csv("origin");
  const showUpcoming = params.get("upcoming") === "1";
  const skinF = params.get("skin") === "1";
  const englishF = params.get("english") === "1";
  const aiF = params.get("ai") === "1";
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next, { replace: true });
  };
  const toggle = (k: string, list: string[], v: string) =>
    setParam(k, (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]).join(","));
  const [filtersOpen, setFiltersOpen] = [params.get("f") === "1", () => setParam("f", params.get("f") === "1" ? null : "1")];

  const traits = useMemo(() => [...new Set((units || []).flatMap((u) => u.traits))].sort(), [units]);

  const shown = useMemo(() => {
    let list = (units || []).filter((u) =>
      (showUpcoming || !isUpcoming(u)) &&
      (!rarityF.length || rarityF.includes(String(u.rarity))) &&
      (!elementF.length || (u.element && elementF.includes(u.element))) &&
      (!traitF.length || traitF.some((t) => u.traits.includes(t))) &&
      (!sourceF.length || sourceF.some((t) => u.obtain.includes(t))) &&
      (!originF.length || originF.includes(u.origin || NO_ORIGIN)) &&
      (!skinF || !!u.skin) &&
      (!englishF || !!tl?.units[u.id]) &&
      (!aiF || !!tl?.ai?.[u.id]) &&
      (!q || textMatch(q, [u.id, u.name?.ja, u.name?.en, u.title?.ja, u.title?.en, u.displayName?.en, u.displayName?.ja,
        u.illustrator, u.voiceActor, ...(u.aliases ?? [])])));
    const by: Record<string, (a: UnitIndexEntry, b: UnitIndexEntry) => number> = {
      release: (a, b) => (b.release || "").localeCompare(a.release || "") || b.id.localeCompare(a.id),
      rarity: (a, b) => b.rarity - a.rarity || b.id.localeCompare(a.id),
      id: (a, b) => a.id.localeCompare(b.id),
    };
    const cmp = by[sort] || ((a: UnitIndexEntry, b: UnitIndexEntry) => (b.stats[sort as "atk"] || 0) - (a.stats[sort as "atk"] || 0));
    return [...list].sort(cmp);
  }, [units, q, sort, rarityF.join(), elementF.join(), traitF.join(), sourceF.join(), originF.join(), showUpcoming, skinF, englishF, aiF, tl]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const active = rarityF.length + elementF.length + traitF.length + sourceF.length + originF.length + (showUpcoming ? 1 : 0) + (skinF ? 1 : 0) + (englishF ? 1 : 0) + (aiF ? 1 : 0);
  const originCount = (o: string) => (units || []).filter((u) => (u.origin || NO_ORIGIN) === o && (showUpcoming || !isUpcoming(u))).length;
  // every origin in the data shows, in ORIGINS order, unlisted ones after it, then the units with none
  const originList = [...ORIGINS, ...[...new Set((units || []).map((u) => u.origin).filter((o): o is string => !!o && !ORIGINS.includes(o)))].sort(), NO_ORIGIN];
  const skinCount = useMemo(() => (units || []).filter((u) => u.skin).length, [units]);
  const englishCount = useMemo(() => (units || []).filter((u) => tl?.units[u.id] && (showUpcoming || !isUpcoming(u))).length, [units, tl, showUpcoming]);
  const aiCount = useMemo(() => (units || []).filter((u) => tl?.ai?.[u.id] && (showUpcoming || !isUpcoming(u))).length, [units, tl, showUpcoming]);
  const upcomingCount = useMemo(() => (units || []).filter(isUpcoming).length, [units]);

  return (
    <div className="units-page">
      <h1>Units</h1>
      <ListToolbar
        search={<SearchBox value={q} onChange={(v) => setParam("q", v)} placeholder="Name, title, id, artist or CV" />}
        count={units ? `${shown.length} / ${units.length}` : undefined}
        activeFilters={active}
        onClearFilters={() => { const n = new URLSearchParams(); if (q) n.set("q", q); setParams(n, { replace: true }); }}
        actions={
          <select className="hub-select" value={sort} onChange={(e) => setParam("sort", e.target.value)} aria-label="Sort">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        }
      />
      <FilterPanel open={filtersOpen} onToggle={setFiltersOpen} activeCount={active}>
        <div className="filter-groups">
          <CheckboxGroup title="Rarity" options={[6, 5, 4, 3, 2, 1].filter((r) => units?.some((u) => u.rarity === r)).map((r) => ({ value: String(r), label: <RarityIcon rarity={r} height={16} /> }))}
            selected={rarityF} onToggle={(v) => toggle("rarity", rarityF, v)} />
          <CheckboxGroup title="Element" options={ELEMENTS.map((e) => ({ value: e, label: <span className="chip-icon"><ElementIcon element={e} size={16} />{e}</span> }))}
            selected={elementF} onToggle={(v) => toggle("element", elementF, v)} />
          <CheckboxGroup title="Trait" options={traits.map((t) => ({ value: t, label: t }))}
            selected={traitF} onToggle={(v) => toggle("trait", traitF, v)} />
          <CheckboxGroup title="Source" options={SOURCES.filter((s) => units?.some((u) => u.obtain.includes(s.value)))}
            selected={sourceF} onToggle={(v) => toggle("source", sourceF, v)} />
          <CheckboxGroup title="Origin" options={originList.filter((o) => originCount(o) > 0).map((o) => ({ value: o, label: `${o} (${originCount(o)})` }))}
            selected={originF} onToggle={(v) => toggle("origin", originF, v)} />
          {(skinCount > 0 || englishCount > 0 || aiCount > 0) && (
            <CheckboxGroup title="Extras" options={[
              ...(skinCount > 0 ? [{ value: "skin", label: `Has a skin (${skinCount})` }] : []),
              ...(englishCount > 0 ? [{ value: "english", label: `English scenes (${englishCount})` }] : []),
              ...(aiCount > 0 ? [{ value: "ai", label: `AI-translated scenes (${aiCount})` }] : []),
            ]}
              selected={[...(skinF ? ["skin"] : []), ...(englishF ? ["english"] : []), ...(aiF ? ["ai"] : [])]}
              onToggle={(v) => v === "skin" ? setParam("skin", skinF ? null : "1")
                : v === "ai" ? setParam("ai", aiF ? null : "1") : setParam("english", englishF ? null : "1")} />
          )}
          {upcomingCount > 0 && (
            <CheckboxGroup title="Release" options={[{ value: "1", label: `Upcoming (${upcomingCount})` }]}
              selected={showUpcoming ? ["1"] : []} onToggle={() => setParam("upcoming", showUpcoming ? null : "1")} />
          )}
        </div>
      </FilterPanel>
      <LoadState loading={loading} error={error} />
      {units && !shown.length && <EmptyState title="No units match" hint="Clear a filter or the search." />}
      <CardGrid min={150}>
        {shown.slice((page - 1) * PAGE, page * PAGE).map((u) => (
          <Link key={u.id} to={`/units/${u.id}`} className="unit-card">
            <FallbackImage srcs={[iconUrl(u.id)]} alt="" loading="lazy" width={96} height={96} missingClassName="unit-card-noicon" />
            <span className="unit-card-title">{tr(u.title, lang)}</span>
            <span className="unit-card-name">{unitName(u, lang)}</span>
            <span className="unit-card-meta">
              <RarityIcon rarity={u.rarity} />
              <ElementIcon element={u.element} />
              {isUpcoming(u) && <span className="hub-badge">{u.release}</span>}
              {tl?.units[u.id] ? <span className="tl-badge" title="Has scenes with an English translation">EN</span>
                : tl?.ai?.[u.id] ? <span className="tl-badge ai" title="Has scenes with an AI translation">AI</span> : null}
            </span>
          </Link>
        ))}
      </CardGrid>
      <Pager page={page} pages={pages} onPage={(p) => setParam("page", p > 1 ? String(p) : null)} />
    </div>
  );
}
