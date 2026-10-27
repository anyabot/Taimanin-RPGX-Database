import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Breadcrumbs, CardGrid, FallbackImage, LoadState, PageHeader, Panel, SearchBox, SegmentedButtons } from "@altterisk/game-hub";
import { textMatch } from "@altterisk/game-hub/filters";
import { ElementIcon, RarityIcon } from "../components";
import { iconUrl, isUpcoming, tr, unitName, useData, useLang, type ArenaCard, type UnitIndexEntry } from "../data";
import { ROLE_LABEL, gatherPeople, personHref, personKey, type Person, type Role } from "../people";

function usePeople() {
  const units = useData<UnitIndexEntry[]>("units/index");
  const cards = useData<ArenaCard[]>("cards");
  const people = useMemo(() => units.data && cards.data ? gatherPeople(units.data, cards.data) : null, [units.data, cards.data]);
  return { people, loading: units.loading || cards.loading, error: units.error || cards.error };
}

const ROLES: Role[] = ["artist", "cv"];

/** Every artist and voice actor, with how much they worked on. */
export default function PeopleIndex() {
  const { people, loading, error } = usePeople();
  const [params, setParams] = useSearchParams();
  const role = (params.get("role") as Role) || "artist";
  const q = params.get("q") || "";
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  if (!people) return <LoadState loading={loading} error={error} />;
  const all = [...people.values()];
  const list = all.filter((p) => p.role === role && (!q || textMatch(q, [p.name])))
    .sort((a, b) => b.units.length + b.cards.length - (a.units.length + a.cards.length) || a.name.localeCompare(b.name));
  return (
    <div className="people-page">
      <PageHeader title="Artists & voice actors" subtitle="Everyone credited on a unit or an Arena card, from the game's own credits." />
      <div className="filter-row">
        <SegmentedButtons label="Role" selected={[role]} onToggle={(v) => set("role", v === "artist" ? null : v)}
          options={ROLES.map((r) => ({ value: r, label: `${ROLE_LABEL[r]}s (${all.filter((p) => p.role === r).length})` }))} />
        <SearchBox value={q} onChange={(v) => set("q", v || null)} placeholder="Search names" />
      </div>
      <ul className="people-list">
        {list.map((p) => (
          <li key={p.key}>
            <a href={personHref(p.role, p.name)} lang="ja">{p.name}</a>
            <span className="muted small">{count(p)}</span>
          </li>
        ))}
      </ul>
      {!list.length && <p className="muted">Nobody matches.</p>}
    </div>
  );
}

const count = (p: Person) => [p.units.length && `${p.units.length} unit${p.units.length === 1 ? "" : "s"}`,
  p.cards.length && `${p.cards.length} card${p.cards.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ");

const PAGE = 48;

/** One person: every unit and Arena card they are credited on. */
export function PersonPage() {
  const { role = "artist", name = "" } = useParams<{ role: Role; name: string }>();
  const { people, loading, error } = usePeople();
  const lang = useLang();
  const [upcoming, setUpcoming] = useState(false);
  const [shown, setShown] = useState(PAGE);
  if (!people) return <LoadState loading={loading} error={error} />;
  const p = people.get(`${role}:${personKey(name)}`);
  const label = ROLE_LABEL[role as Role] ?? role;
  if (!p) return <p className="muted">No {label.toLowerCase()} named {name}.</p>;
  const units = p.units.filter((x) => upcoming || !isUpcoming(x.unit))
    .sort((a, b) => (b.unit.release || "").localeCompare(a.unit.release || "") || b.unit.id.localeCompare(a.unit.id));
  const upcomingCount = p.units.filter((x) => isUpcoming(x.unit)).length;
  return (
    <div className="people-page">
      <Breadcrumbs items={[{ label: "Artists & voice actors", href: `#/people${role === "cv" ? "?role=cv" : ""}` }, { label: p.name }]} />
      <PageHeader title={<span lang="ja">{p.name}</span>} subtitle={`${label} · ${count(p)}`} />
      {p.units.length > 0 && (
        <Panel title={`Units (${units.length})`} note={upcomingCount > 0 && (
          <label className="small"><input type="checkbox" checked={upcoming} onChange={(e) => setUpcoming(e.target.checked)} /> Include upcoming ({upcomingCount})</label>
        )}>
          <CardGrid min={130}>
            {units.slice(0, shown).map(({ unit: u, note }) => (
              <Link key={u.id} to={`/units/${u.id}`} className="unit-card">
                <FallbackImage srcs={[iconUrl(u.id)]} alt="" loading="lazy" width={96} height={96} missingClassName="unit-card-noicon" />
                <span className="unit-card-title">{tr(u.title, lang)}</span>
                <span className="unit-card-name">{unitName(u, lang)}</span>
                <span className="unit-card-meta">
                  <RarityIcon rarity={u.rarity} />
                  <ElementIcon element={u.element} />
                  {isUpcoming(u) && <span className="hub-badge">{u.release}</span>}
                </span>
                {note && <span className="muted small">{note}</span>}
              </Link>
            ))}
          </CardGrid>
          {units.length > shown && (
            <button className="hub-btn people-more" onClick={() => setShown(shown + PAGE)}>Show more ({units.length - shown})</button>
          )}
        </Panel>
      )}
      {p.cards.length > 0 && (
        <Panel title={`Arena cards (${p.cards.length})`}>
          <div className="quest-groups">
            {p.cards.map(({ card: c, note }) => (
              <Link key={c.id} className="quest-card" to={`/cards/${c.id}`}>
                <span className="quest-card-title" lang="ja"><RarityIcon rarity={c.rarity} height={14} /> {tr(c.name, lang) || c.id}</span>
                {c.title && <span className="muted" lang="ja">{tr(c.title, lang)}</span>}
                <span className="muted">{[c.union, note].filter(Boolean).join(" · ")}</span>
              </Link>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
