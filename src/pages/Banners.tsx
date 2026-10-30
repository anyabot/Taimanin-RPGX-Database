import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, FilterChip, FilterRow, LoadState, SearchBox } from "@altterisk/game-hub";
import { textMatch } from "@altterisk/game-hub/filters";
import {
  gachaArt, iconUrl, phaseOf, phaseText, tr, unitName, useData, useLang, windowOf,
  type GachaBanner, type UnitIndexEntry,
} from "../data";
import { BundleImage } from "../bundleImage";
import { LIST_META } from "../meta";
import { usePageMeta } from "../usePageMeta";

const TYPES = ["Gosha Festival", "Yomihara Festival", "Yomihara & Gosha Festival", "Collab Festival", "Limited", "Collab", "Pickup", "Kessen"];

export const bannerPhase = (b: GachaBanner) => phaseOf(b.start, b.end);

/** One gacha banner: its key art, name, type, window and featured units. */
export function BannerTile({ b, units, highlight }: { b: GachaBanner; units?: Map<string, UnitIndexEntry>; highlight?: boolean }) {
  const lang = useLang();
  const w = windowOf(b.start, b.end);
  const phase = bannerPhase(b);
  return (
    <article id={`banner-${b.id}`} className={`gacha-banner${highlight ? " highlight" : ""}`}>
      <BundleImage stem={gachaArt(b.image)} className="gacha-art" />
      <div className="gacha-body">
        <h3 lang={b.title?.en && lang === "en" ? "en" : "ja"}><Link to={`/banners?id=${b.id}`}>{tr(b.title, lang)}</Link></h3>
        <p className="gacha-meta">
          <span className={`obtain-type t-${b.type.split(" ")[0]}`}>{b.type}</span>
          {b.pull?.map((p) => <span key={p} className="obtain-pull">{p}</span>)}
          {phase !== "ended" && <span className={`hub-badge event-phase ${phase}`}>{phase === "running" ? "Running" : "Upcoming"}</span>}
        </p>
        <p className="muted small">{w.start ? `${w.start} – ${w.end}` : `until ${w.end}`} · {phaseText(b.start, b.end)}</p>
        <ul className="gacha-units">
          {b.units.map((id) => {
            const u = units?.get(id);
            return (
              <li key={id}>
                <Link to={`/units/${id}`} title={u ? `${tr(u.title, lang)} ${unitName(u, lang)}` : id}>
                  <img src={iconUrl(id)} alt="" width={56} height={56} loading="lazy" />
                  <span lang="ja">{u ? unitName(u, lang) : id}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}

/** Limited gacha banners, newest first; ?type=, ?q=, ?id= (scrolls to one). */
export default function BannerList() {
  usePageMeta(LIST_META["/banners"]);
  const { data: banners, loading, error } = useData<GachaBanner[]>("banners");
  const { data: unitList } = useData<UnitIndexEntry[]>("units/index");
  const units = new Map((unitList ?? []).map((u) => [u.id, u]));
  const [params, setParams] = useSearchParams();
  const type = params.get("type") || "";
  const q = params.get("q") || "";
  const focus = params.get("id");
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    n.delete("id");
    setParams(n, { replace: true });
  };
  useEffect(() => {
    if (focus && banners) document.getElementById(`banner-${focus}`)?.scrollIntoView({ block: "center" });
  }, [focus, banners]);

  const shown = (banners ?? []).filter((b) => (!type || b.type === type)
    && (!q || textMatch(q, [b.title?.ja, b.title?.en, ...b.units.flatMap((id) => {
      const u = units.get(id);
      return u ? [u.name?.ja, u.name?.en, u.title?.ja, u.title?.en] : [id];
    })])));
  return (
    <div className="banners-page">
      <h1>Gacha banners</h1>
      <p className="muted">Limited banners and their featured (rate-up) units, newest first. The permanent pool is on the
        units list (Source: Standard pool).</p>
      <div className="events-tools">
        <SearchBox value={q} onChange={(v) => set("q", v)} placeholder="Banner or unit name" />
        <FilterRow label="Type">
          <FilterChip active={!type} onClick={() => set("type", "")}>All</FilterChip>
          {TYPES.filter((t) => banners?.some((b) => b.type === t)).map((t) => (
            <FilterChip key={t} active={type === t} onClick={() => set("type", type === t ? "" : t)}
              count={banners?.filter((b) => b.type === t).length}>{t}</FilterChip>
          ))}
        </FilterRow>
      </div>
      <LoadState loading={loading && !banners} error={error} />
      <div className="gacha-list">
        {shown.map((b) => <BannerTile key={b.id} b={b} units={units} highlight={String(b.id) === focus || bannerPhase(b) === "running"} />)}
      </div>
      {banners && !shown.length && <EmptyState title="No banners match" hint="Clear the search or the type." />}
    </div>
  );
}
