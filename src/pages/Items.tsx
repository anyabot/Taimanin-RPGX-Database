import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Breadcrumbs, LoadState, PageHeader, Panel, SearchBox, SegmentedButtons } from "@altterisk/game-hub";
import { textMatch } from "@altterisk/game-hub/filters";
import {
  ITEM_ICONS, iconUrl, tr, useData, useLang, type Item, type ItemIndexEntry, type ItemSource, type UnitIndexEntry,
} from "../data";
import { BundleImage } from "../bundleImage";
import "./items.css";
import { LIST_META, itemMeta } from "../meta";
import { usePageMeta } from "../usePageMeta";

// eItemType -> a readable group (several types share one)
const TYPE_GROUP: Record<string, string> = {
  evolution: "Awakening", expup: "Growth", skillup: "Growth", trustup: "Growth", luckup: "Growth",
  global: "General", battle: "Battle", rune_shard: "Runes", rune_evolution: "Runes", rune_chip: "Runes", rune_wh: "Runes",
  presentboxexchange: "Tickets", raid_ticket: "Tickets", skip: "Tickets",
  event_raid: "Event", event_story: "Event", event_map: "Event", event_map_collect: "Event", event_map_score: "Event", eden: "Event",
  home_custom_parts: "Home", home_custom_skin: "Home", record_title: "Titles", system: "System",
};
const GROUPS = ["Awakening", "Growth", "General", "Battle", "Runes", "Tickets", "Event", "Home", "Titles", "System"];
const EFFECT: Record<string, string> = {
  ap: "Restores AP", bp: "Restores BP", draw_gacha: "Draws a gacha", expup: "Unit EXP", skillup: "Skill level up",
  trustup: "Trust", luckup: "Luck", rune_wh: "Rune storage",
};

/** Every item: icon, name, kind; filter by group, search names. */
export default function ItemList() {
  usePageMeta(LIST_META["/items"]);
  const { data, loading, error } = useData<ItemIndexEntry[]>("items/index");
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const group = params.get("group") || "Awakening";
  const q = params.get("q") || "";
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const items = useMemo(() => (data ?? []).filter((i) =>
    q ? textMatch(q, [i.id, i.name?.ja, i.name?.en]) : (TYPE_GROUP[i.type] ?? "System") === group), [data, group, q]);
  if (!data) return <LoadState loading={loading} error={error} />;
  const count = (g: string) => data.filter((i) => (TYPE_GROUP[i.type] ?? "System") === g).length;
  return (
    <div className="items-page">
      <PageHeader title="Items" subtitle="Every item in the master data: what it does, where it drops or is sold, and what uses it." />
      <SegmentedButtons label="Kind" selected={q ? [] : [group]} onToggle={(v) => { const n = new URLSearchParams(params); n.set("group", v); n.delete("q"); setParams(n, { replace: true }); }}
        options={GROUPS.map((g) => ({ value: g, label: `${g} (${count(g)})` }))} />
      <SearchBox value={q} onChange={(v) => set("q", v || null)} placeholder="Search all items" />
      <ul className="item-grid">
        {items.map((i) => (
          <li key={i.id}>
            <Link to={`/items/${i.id}`} className="item-cell" title={i.id}>
              <BundleImage stem={ITEM_ICONS} name={`${i.icon}_s`} width={40} height={40} className="item-icon" />
              <span lang="ja">{tr(i.name, lang) || i.id}</span>
              {i.sources > 0 && <span className="muted small">{i.sources} source{i.sources === 1 ? "" : "s"}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {!items.length && <p className="muted">No items match.</p>}
    </div>
  );
}

/** One item: description, effect, the units a ticket gives, sources and uses. */
export function ItemDetail() {
  const { id = "" } = useParams();
  const { data: item, loading, error } = useData<Item>(`items/${id}`);
  usePageMeta(item && itemMeta(item));
  const { data: units } = useData<UnitIndexEntry[]>("units/index");
  const lang = useLang();
  const unitName = (u: string) => tr(units?.find((x) => x.id === u)?.name, lang) || u;
  if (!item) return <LoadState loading={loading} error={error} />;
  const name = tr(item.name, lang) || item.id;
  const group = TYPE_GROUP[item.type] ?? "System";
  return (
    <div className="items-page">
      <Breadcrumbs items={[{ label: "Items", href: `/items?group=${group}` }, { label: name }]} />
      <div className="battles-head">
        <BundleImage stem={ITEM_ICONS} name={`${item.icon}_s`} width={72} height={72} className="item-icon" />
        <div>
          <h1 lang="ja">{name}</h1>
          <p className="muted">{group} · {item.id}</p>
        </div>
      </div>
      <Panel title="Item">
        {item.description && <p className="profile-text" lang="ja">{tr(item.description, lang)}</p>}
        <dl className="credits">
          {item.effect && <><dt>Use</dt><dd>{EFFECT[item.effect.category] ?? item.effect.category} {item.effect.value.toLocaleString()}</dd></>}
          {item.statusCost !== undefined && <><dt>Gold per use</dt><dd>{item.statusCost.toLocaleString()}</dd></>}
          {item.battleLimit !== undefined && <><dt>Per battle</dt><dd>up to {item.battleLimit}</dd></>}
          {item.sellGold > 0 && <><dt>Sells for</dt><dd>{item.sellGold.toLocaleString()} gold</dd></>}
        </dl>
      </Panel>
      {item.units && item.units.length > 0 && (
        <Panel title={`Exchanges for (${item.units.length})`}>
          <ul className="item-units">
            {item.units.map((u) => (
              <li key={u}><Link to={`/units/${u}`}><img src={iconUrl(u)} alt="" width={40} height={40} /> <span lang="ja">{unitName(u)}</span></Link></li>
            ))}
          </ul>
        </Panel>
      )}
      {item.uses && <Uses uses={item.uses} unitName={unitName} />}
      {item.sources && item.sources.length > 0 && <Sources list={item.sources} />}
      {!item.sources?.length && <p className="muted small">No drop, reward or shop in the site's data lists this item
        (it may come from gacha, missions, login bonuses or the paid shop, which are not covered).</p>}
    </div>
  );
}

function Uses({ uses, unitName }: { uses: NonNullable<Item["uses"]>; unitName: (u: string) => string }) {
  const lists: [string, string[] | undefined][] = [["Evolves", uses.evolve], ["Bloom of", uses.bloom], ["Unlocks an ability of", uses.ability]];
  return (
    <Panel title="Used for">
      {lists.filter(([, l]) => l?.length).map(([label, l]) => (
        <div key={label} className="item-use">
          <span className="muted">{label} {l!.length} unit{l!.length === 1 ? "" : "s"}:</span>{" "}
          {l!.slice(0, 40).map((u, i) => <span key={u}>{i ? ", " : ""}<Link to={`/units/${u}`} lang="ja">{unitName(u)}</Link></span>)}
          {l!.length > 40 && <span className="muted"> and {l!.length - 40} more</span>}
        </div>
      ))}
      {uses.runeEvolve ? <div className="item-use">Rune evolution ({uses.runeEvolve} pieces)</div> : null}
      {uses.refine && <div className="item-use">Rune refining</div>}
    </Panel>
  );
}

function Sources({ list }: { list: ItemSource[] }) {
  const lang = useLang();
  const { data: items } = useData<ItemIndexEntry[]>("items/index");
  const costName = (id: string) => id === "jewel" ? "Jewels" : tr(items?.find((x) => x.id === id)?.name, lang) || id;
  const battles = list.filter((s) => s.page && !s.kinds.includes("exchange"));
  const shops = list.filter((s) => s.kinds.includes("exchange"));
  return (
    <>
      {battles.length > 0 && (
        <Panel title={`Found in (${battles.length})`}>
          <ul className="item-sources">
            {battles.map((s) => (
              <li key={s.page!}><Link to={`/${s.page}`} lang="ja">{tr(s.title, lang) || s.page}</Link>
                <span className="muted small"> · {s.kinds.join(", ")}</span></li>
            ))}
          </ul>
        </Panel>
      )}
      {shops.length > 0 && (
        <Panel title={`Exchange shops (${shops.length})`}>
          <ul className="item-sources">
            {shops.map((s, i) => (
              <li key={i}>
                {s.page ? <Link to={`/${s.page}`} lang="ja">{tr(s.title, lang) || s.page}</Link> : <span>Exchange</span>}
                <span className="muted small"> · {[s.start && `${s.start} – ${s.end ?? ""}`,
                  s.costs?.map(([c, n]) => `${n.toLocaleString()} × ${costName(c)}`).join(" or ")].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
