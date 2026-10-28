import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  BannerCard, Breadcrumbs, CardGrid, EmptyState, FilterChip, FilterRow, LoadState, Panel, SearchBox,
} from "@altterisk/game-hub";
import { textMatch } from "@altterisk/game-hub/filters";
import {
  phaseOf, phaseText, tr, useData, useLang, windowOf, type Battles, type StoryGroup, type StorySection,
} from "../data";
import { EventInfo } from "../battles";
import { StoryBanner } from "./StoryList";

/** Story-index sections that are events; specials only when the client dates them. */
const KINDS: Record<string, string> = { event: "Story event", raid: "Raid event", map: "Map event", special: "Special event" };

export interface EventEntry { g: StoryGroup; kind: string }

/** Every event in the story index, newest first within its kind. */
export function useEvents(): { events: EventEntry[] | null; loading: boolean; error: unknown } {
  const { data, loading, error } = useData<StorySection[]>("stories/index");
  const events = useMemo(() => data && data
    .filter((s) => s.key in KINDS)
    .flatMap((s) => s.groups.filter((g) => s.key !== "special" || g.period).map((g) => ({ g, kind: s.key })))
    .sort((a, b) => b.g.num - a.g.num) || null, [data]);
  return { events, loading, error };
}

export const eventTitle = (e: EventEntry, lang: "en" | "ja") => tr(e.g.title, lang) || `${KINDS[e.kind]} ${e.g.num}`;
export const eventPhase = (e: EventEntry) => (e.g.period ? phaseOf(e.g.period.start, e.g.period.end) : "ended");

/** Period line: "until 2026-11-04 · exchange until 2026-11-18" (a start only when the client's is believable). */
export function periodText(e: EventEntry): string {
  const p = e.g.period;
  if (!p) return "";
  const w = windowOf(p.start, p.end);
  return [w.start ? `${w.start} – ${w.end}` : `until ${w.end}`, p.exchangeEnd && `exchange until ${p.exchangeEnd}`]
    .filter(Boolean).join(" · ");
}

export function EventCard({ e, highlight }: { e: EventEntry; highlight?: boolean }) {
  const lang = useLang();
  const phase = eventPhase(e);
  return (
    <BannerCard href={`#/events/${e.g.id}`} highlight={highlight}
      art={e.g.banner ? <StoryBanner banner={e.g.banner} /> : undefined}
      title={<span lang={e.g.title?.en && lang === "en" ? "en" : "ja"}>{eventTitle(e, lang)}</span>}
      badge={phase === "running" ? "Running" : phase === "upcoming" ? "Upcoming" : undefined}
      window={e.g.period ? `${KINDS[e.kind]} · ${phaseText(e.g.period.start, e.g.period.end)}` : `${KINDS[e.kind]} ${e.g.num}`} />
  );
}

/** All events: running ones first, then by kind; ?kind= and ?q= filter. */
export default function EventList() {
  const { events, loading, error } = useEvents();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const kind = params.get("kind") || "";
  const q = params.get("q") || "";
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
  };
  const shown = (events ?? []).filter((e) => (!kind || e.kind === kind)
    && (!q || textMatch(q, [e.g.id, e.g.title?.ja, e.g.title?.en, `${KINDS[e.kind]} ${e.g.num}`])));
  const live = shown.filter((e) => eventPhase(e) !== "ended")
    .sort((a, b) => (a.g.period?.end ?? "").localeCompare(b.g.period?.end ?? ""));
  const rest = shown.filter((e) => eventPhase(e) === "ended");

  return (
    <div className="events-page">
      <h1>Events</h1>
      <p className="muted">Story, raid and map events with their banners, rewards and battles. Events in the current
        client also list their bonus units, reward shop and box gacha.</p>
      <div className="events-tools">
        <SearchBox value={q} onChange={(v) => set("q", v)} placeholder="Event name or number" />
        <FilterRow label="Kind">
          <FilterChip active={!kind} onClick={() => set("kind", "")}>All</FilterChip>
          {Object.entries(KINDS).map(([k, label]) => (
            <FilterChip key={k} active={kind === k} onClick={() => set("kind", kind === k ? "" : k)}
              count={(events ?? []).filter((e) => e.kind === k).length}>{label}</FilterChip>
          ))}
        </FilterRow>
      </div>
      <LoadState loading={loading && !events} error={error} />
      {live.length > 0 && (
        <section>
          <h2>Now</h2>
          <CardGrid min={280}>{live.map((e) => <EventCard key={e.g.id} e={e} highlight={eventPhase(e) === "running"} />)}</CardGrid>
        </section>
      )}
      {rest.length > 0 && (
        <section>
          {live.length > 0 && <h2>Past events</h2>}
          <CardGrid min={280}>{rest.map((e) => <EventCard key={e.g.id} e={e} />)}</CardGrid>
        </section>
      )}
      {events && !shown.length && <EmptyState title="No events match" hint="Clear the search or the kind." />}
      {lang === "en" && <p className="muted small">Untranslated event names are shown in Japanese.</p>}
    </div>
  );
}

/** One event: banner, period, story and battles links, then its rewards when the client has them. */
export function EventPage() {
  const { id = "" } = useParams();
  const lang = useLang();
  const { events, loading, error } = useEvents();
  const e = events?.find((x) => x.g.id === id);
  const { data: battles } = useData<Battles>(e?.g.battles ? `stories/battles/${id}` : null);
  if (!e) {
    return (
      <div className="events-page">
        <LoadState loading={loading} error={error} />
        {events && <EmptyState title="No such event" hint={<Link to="/events">All events</Link>} />}
      </div>
    );
  }
  const same = (events ?? []).filter((x) => x.kind === e.kind).sort((a, b) => a.g.num - b.g.num);
  const at = same.indexOf(e);
  const prev = same[at - 1];
  const next = same[at + 1];
  const title = eventTitle(e, lang);
  const phase = eventPhase(e);
  const first = e.g.parts[0];

  return (
    <div className="events-page event-page">
      <Breadcrumbs items={[{ label: "Events", href: "#/events" }, { label: KINDS[e.kind], href: `#/events?kind=${e.kind}` }, { label: title }]} />
      <nav className="event-nav">
        {prev ? <Link to={`/events/${prev.g.id}`} lang="ja">‹ {eventTitle(prev, lang)}</Link> : <span />}
        {next && <Link to={`/events/${next.g.id}`} lang="ja">{eventTitle(next, lang)} ›</Link>}
      </nav>
      <div className="event-head">
        {e.g.banner && <StoryBanner banner={e.g.banner} large />}
        <div className="event-head-text">
          <p className="muted">{KINDS[e.kind]} {e.g.num}
            {phase !== "ended" && <span className={`hub-badge event-phase ${phase}`}>{phase === "running" ? "Running" : "Upcoming"}</span>}
          </p>
          <h1 lang={e.g.title?.en && lang === "en" ? "en" : "ja"}>{title}</h1>
          {e.g.period && <p>{periodText(e)} <span className="muted">· {phaseText(e.g.period.start, e.g.period.end)}</span></p>}
          <div className="event-actions">
            {first && <Link className="hub-btn" to={`/story/${first.id}`}>Read the story · {e.g.parts.length} part{e.g.parts.length === 1 ? "" : "s"}</Link>}
            {e.g.battles && (
              <Link className="hub-btn" to={`/story/battles/${e.g.id}`}>
                Battles · {e.g.battles.quests} quests{e.g.battles.bosses ? ` · ${e.g.battles.bosses} raid bosses` : ""}
              </Link>
            )}
          </div>
        </div>
      </div>
      {battles?.event && <Panel title="Event"><EventInfo ev={battles.event} /></Panel>}
      {!e.g.period && (
        <p className="muted small">The current client only keeps rewards, bonus units and shops for the events it is running;
          this one's are gone from it.</p>
      )}
      <Panel title={`Story (${e.g.parts.length})`}>
        <ol className="story-parts">
          {e.g.parts.map((p) => (
            <li key={p.id}>
              <Link to={`/story/${p.id}`}>
                <span className="muted">{p.section ?? p.id}</span>
                {p.title && <span lang="ja"> · {p.title}</span>}
              </Link>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
