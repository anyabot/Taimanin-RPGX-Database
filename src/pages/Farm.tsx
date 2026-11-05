import { Fragment, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LoadState, PageHeader, Panel, SearchBox, SegmentedButtons } from "@altterisk/game-hub";
import { listState, searchParamsAdapter, textMatch } from "@altterisk/game-hub/filters";
import { ITEM_ICONS, iconUrl, isHidden, tr, unitName, useData, useLang, type ItemIndexEntry, type Text, type UnitIndexEntry } from "../data";
import { BundleImage } from "../bundleImage";
import { LIST_META, chapterLabel } from "../meta";
import { usePageMeta } from "../usePageMeta";

/** public/data/farm.json (tools/web_export/items.py): a unit an open exchange
 *  shop sells for an item, and where that item comes from. */
interface FarmRow {
  unit: string; item: string; name: Text | null; icon: string; need: number;
  drops: { page: string; title: Text | null; kinds: string[] }[];
  trades: { page: string | null; title: Text | null; costs?: [string, number][]; end?: string | null }[];
}

/** Units farmed through their Unique Memory: the battles that drop it, or the trades for it. */
export default function FarmPage() {
  usePageMeta(LIST_META["/farm"]);
  const { data, loading, error } = useData<FarmRow[]>("farm");
  const { data: units } = useData<UnitIndexEntry[]>("units/index");
  const { data: items } = useData<ItemIndexEntry[]>("items/index");
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const url = listState(searchParamsAdapter(params, setParams));
  const view = url.text("view") || "drops";
  const q = url.text("q");
  const unitOf = useMemo(() => new Map((units ?? []).map((u) => [u.id, u])), [units]);
  const rows = useMemo(() => (data ?? []).filter((r) => {
    const u = unitOf.get(r.unit);
    if (!r.item.startsWith("ubl") || !u || isHidden(u)) return false;
    return !q || textMatch(q, [r.unit, u.name?.ja, u.name?.en, u.displayName?.ja, u.displayName?.en]);
  }), [data, unitOf, q]);
  // battle -> the units whose memory drops there
  const byPlace = useMemo(() => {
    const m = new Map<string, { title: Text | null; rows: [FarmRow, string[]][] }>();
    for (const r of rows) for (const d of r.drops) {
      const g = m.get(d.page) ?? { title: d.title, rows: [] };
      g.rows.push([r, d.kinds]);
      m.set(d.page, g);
    }
    return [...m].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }));
  }, [rows]);
  const tradeOnly = rows.filter((r) => !r.drops.length);
  if (!data || !units) return <LoadState loading={loading} error={error} />;

  const unitCell = (r: FarmRow, note?: string) => {
    const u = unitOf.get(r.unit)!;
    return (
      <li key={`${r.unit}-${note ?? ""}`}>
        <Link to={`/units/${r.unit}?tab=obtain`} className="farm-unit">
          <img src={iconUrl(r.unit)} alt="" width={48} height={48} loading="lazy" />
          <span lang="ja">{tr(u.displayName ?? null, lang) || unitName(u, lang)}</span>
          <span className="muted small">{r.need.toLocaleString()} × {tr(r.name, lang) || r.item}{note ? ` · ${note}` : ""}</span>
        </Link>
      </li>
    );
  };
  const itemName = (id: string) => tr(items?.find((x) => x.id === id)?.name ?? null, lang) || id;

  return (
    <div className="farm-page">
      <PageHeader title="Farm" subtitle="Units the exchange shop sells for their Unique Memory: where each memory drops, or what it trades for." />
      <SegmentedButtons label="Show" selected={[view]} onToggle={(v) => url.setText("view", v === "drops" ? "" : v)}
        options={[
          { value: "drops", label: `Battle drops (${rows.length - tradeOnly.length})` },
          { value: "trades", label: `Trades only (${tradeOnly.length})` },
        ]} />
      <SearchBox value={q} onChange={(v) => url.setText("q", v)} placeholder="Search units" />
      {view === "drops" ? (
        <>
          {byPlace.map(([page, g]) => (
            <Panel key={page} title={<><span className="farm-ch muted">{chapterLabel(page.split("/").pop()!)}</span>{" "}
              <Link to={`/${page}`} lang="ja">{tr(g.title, lang) || page}</Link></>} note={`${g.rows.length}`}>
              <ul className="farm-units">{g.rows.map(([r, kinds]) => unitCell(r, kinds.join(", ")))}</ul>
            </Panel>
          ))}
          {!byPlace.length && <p className="muted">No units match.</p>}
        </>
      ) : (
        <Panel title="No battle in the site's data drops these memories" note="the shop trades for them">
          <ul className="farm-units">
            {tradeOnly.map((r) => (
              <Fragment key={r.unit}>
                {unitCell(r, r.trades.map((t) => t.costs?.map(([c, n]) => `${n} × ${itemName(c)}`).join(" or ")).filter(Boolean).join("; ") || "no shop listed")}
              </Fragment>
            ))}
          </ul>
          {!tradeOnly.length && <p className="muted">No units match.</p>}
        </Panel>
      )}
    </div>
  );
}
