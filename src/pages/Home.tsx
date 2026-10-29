import { Link } from "react-router-dom";
import { CardGrid, EntityTile, LoadState } from "@altterisk/game-hub";
import { useData, type GachaBanner, type UnitIndexEntry } from "../data";
import { SITE_NAME } from "../App";
import { EventCard, eventPhase, useEvents } from "./Events";
import { BannerTile, bannerPhase } from "./Banners";

const SECTIONS: [string, string, string][] = [
  ["/units", "Units", "Stats, skills, abilities, bloom, voices and scenes"],
  ["/events", "Events", "Story, raid and map events: rewards, shops, battles"],
  ["/banners", "Gacha banners", "Limited banners and their featured units"],
  ["/gacha", "Gacha simulator", "Pull on any banner with the game's own odds"],
  ["/story", "Story", "Main and event story, played from the game's files"],
  ["/quests", "Quests", "Arena towers, daily quests, mini events, dispatch"],
  ["/buffs", "Buffs", "Every unit's buffs and debuffs, ranked"],
  ["/statuses", "Statuses", "Ailments, states and markers"],
  ["/items", "Items", "Where items drop and what they are for"],
  ["/runes", "Runes", "Rune sets and their stats"],
  ["/cards", "Arena cards", "Arena card effects"],
  ["/people", "People", "Illustrators and voice actors"],
];

/** What is on now: running events and gacha banners, then the site's sections. */
export default function Home() {
  const { events, loading, error } = useEvents();
  const { data: banners } = useData<GachaBanner[]>("banners");
  const { data: unitList } = useData<UnitIndexEntry[]>("units/index");
  const units = new Map((unitList ?? []).map((u) => [u.id, u]));
  const live = (events ?? []).filter((e) => eventPhase(e) !== "ended")
    .sort((a, b) => (a.g.period?.end ?? "").localeCompare(b.g.period?.end ?? ""));
  const gachas = (banners ?? []).filter((b) => bannerPhase(b) !== "ended")
    .sort((a, b) => (a.end ?? "").localeCompare(b.end ?? ""));

  return (
    <div className="home-page">
      <header className="home-hero">
        <h1>{SITE_NAME}</h1>
        <p className="muted">Units, events, banners and story of Taimanin RPGX, read from the game's own data.</p>
      </header>

      <section>
        <div className="home-section-head"><h2>Events now</h2><Link to="/events">All events ›</Link></div>
        <LoadState loading={loading && !events} error={error} />
        {events && !live.length && <p className="muted">No event is running in the current client.</p>}
        <CardGrid min={280}>{live.map((e, i) => <EventCard key={e.g.id} e={e} highlight={i === 0} />)}</CardGrid>
      </section>

      <section>
        <div className="home-section-head"><h2>Gacha banners now</h2><Link to="/banners">All banners ›</Link></div>
        {banners && !gachas.length && <p className="muted">No limited banner is open.</p>}
        <div className="gacha-list">
          {gachas.map((b) => <BannerTile key={b.id} b={b} units={units} highlight />)}
        </div>
      </section>

      <section>
        <h2>Browse</h2>
        <CardGrid min={240}>
          {SECTIONS.map(([href, title, subtitle]) => (
            <EntityTile key={href} href={`#${href}`} title={title} subtitle={subtitle} />
          ))}
        </CardGrid>
      </section>
    </div>
  );
}
