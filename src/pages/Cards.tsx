import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Breadcrumbs, EntityTile, FallbackImage, LoadState, PageHeader, Panel, SearchBox, SegmentedButtons, StatRow, StatRows,
} from "@altterisk/game-hub";
import { listState, searchParamsAdapter, textMatch } from "@altterisk/game-hub/filters";
import { RARITY, cardIconUrl, tr, useAssets, useData, useLang, type ArenaCard } from "../data";
import { CreditLinks, RarityIcon } from "../components";
import { ArtGallery, SceneStills } from "../art";
import type { SceneDoc } from "../adv";
import "../battles.css";
import { LIST_META, cardMeta } from "../meta";
import { renderLink } from "../links";
import { usePageMeta } from "../usePageMeta";

const UNIONS = ["Taimanin", "UFS", "Demon"];

/** Arena cards (BattleArenas): the 決戦アリーナ cards, with art and scenes. */
export default function CardList() {
  usePageMeta(LIST_META["/cards"]);
  const { data, loading, error } = useData<ArenaCard[]>("cards");
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const url = listState(searchParamsAdapter(params, setParams));
  const union = url.text("union");
  const rarity = url.text("rarity");
  const q = url.text("q");
  const cards = useMemo(() => (data ?? []).filter((c) =>
    (!union || c.union === union) && (!rarity || String(c.rarity) === rarity) &&
    (!q || textMatch(q, [c.id, c.name?.ja, c.name?.en, c.title?.ja, c.title?.en, c.illustrator, c.voiceActor]))),
  [data, union, rarity, q]);
  if (!data) return <LoadState loading={loading} error={error} />;
  const rarities = [...new Set(data.map((c) => c.rarity))].sort((a, b) => b - a);
  return (
    <div className="story-page">
      <PageHeader title="Arena cards" subtitle="The 決戦アリーナ cards in RPGX: art and scenes from the game's own files." />
      <div className="filter-row">
      <SegmentedButtons label="Union" selected={[union]} onToggle={(v) => url.setText("union", v === union ? "" : v)}
        options={UNIONS.map((u) => ({ value: u, label: u }))} />
      <SegmentedButtons label="Rarity" selected={[rarity]} onToggle={(v) => url.setText("rarity", v === rarity ? "" : v)}
        options={rarities.map((r) => ({ value: String(r), label: RARITY[r] ?? String(r) }))} />
      <SearchBox value={q} onChange={(v) => url.setText("q", v)} placeholder="Search names, illustrators, voices" />
      </div>
      <p className="muted small">{cards.length} / {data.length}</p>
      <div className="quest-groups">
        {cards.map((c) => (
          <CardTile key={c.id} card={c} detail={[c.union, c.scenes.length && `${c.scenes.length} scene${c.scenes.length === 1 ? "" : "s"}`, c.illustrator]
            .filter(Boolean).join(" · ")} />
        ))}
      </div>
    </div>
  );
}

/** A card in a list: its face, name, title and one line of detail. */
export function CardTile({ card: c, detail }: { card: ArenaCard; detail?: string }) {
  const lang = useLang();
  return (
    <EntityTile href={`/cards/${c.id}`} renderLink={renderLink}
      icon={<FallbackImage srcs={[cardIconUrl(c.id)]} alt="" loading="lazy" width={56} height={56} missingClassName="card-tile-noicon" />}
      title={<span lang="ja"><RarityIcon rarity={c.rarity} height={14} /> {tr(c.name, lang) || c.id}</span>}
      subtitle={c.title && <span lang="ja">{tr(c.title, lang)}</span>}
      badges={detail && <span className="muted small">{detail}</span>} />
  );
}

/** One card: credits, both pictures, its scenes. */
export function CardDetail() {
  const { id = "" } = useParams();
  const { data, loading, error } = useData<ArenaCard[]>("cards");
  const lang = useLang();
  const card = data?.find((c) => c.id === id);
  usePageMeta(card && cardMeta(card));
  const { assets } = useAssets();
  const stems = useMemo(() => {
    if (!assets) return [];
    const re = new RegExp(`^r18_image_kar_l_assets_image_kar_r18_l_kar_${id}_r18_l_([0-9]+)[.]png$`);
    return assets.catalog.allStems().filter((s) => re.test(s)).sort();
  }, [assets, id]);
  if (!data) return <LoadState loading={loading} error={error} />;
  if (!card) return <p className="muted">No card {id}.</p>;
  const name = tr(card.name, lang) || card.id;
  return (
    <div className="battles-page">
      <Breadcrumbs items={[{ label: "Arena cards", href: "/cards" }, { label: name }]} />
      <div className="battles-head">
        <div>
          <h1 lang="ja" className="card-head"><img src={cardIconUrl(card.id)} alt="" width={64} height={64} />
            <RarityIcon rarity={card.rarity} height={18} /> {name}</h1>
          {card.title && <p className="muted" lang="ja">{tr(card.title, lang)}</p>}
        </div>
      </div>
      <Panel title="Card">
        <StatRows columns={1}>
          {card.union && <StatRow label="Union" value={card.union} />}
          {card.illustrator && <StatRow label="Illustrator" value={<CreditLinks raw={card.illustrator} role="artist" />} />}
          {card.voiceActor && <StatRow label="Voice" value={<CreditLinks raw={card.voiceActor} role="cv" />} />}
          {card.sale && <StatRow label="On sale from" value={card.sale} />}
        </StatRows>
      </Panel>
      {card.scenes.length > 0 && (
        <Panel title="Scenes" note="Played in the browser from the game's own files; each scene loads when opened.">
          <ol className="scene-list">
            {card.scenes.map((sid, i) => (
              <li key={sid}><span className="scene-unlock muted">Scene {i + 1}</span> <SceneLink sid={sid} />
                <SceneStills names={card.stills?.[i]} /></li>
            ))}
          </ol>
        </Panel>
      )}
      <Panel title="Art">
        {assets && !stems.length && <p className="muted">No art bundles found for this card.</p>}
        <ArtGallery stems={stems} alt={`${card.id} art`} fileName={(s) => `kar_${card.id}_${s.match(/_l_(\d+)\.png$/)?.[1] ?? ""}.png`} />
      </Panel>
    </div>
  );
}

function SceneLink({ sid }: { sid: string }) {
  const { data, error } = useData<SceneDoc>(`scenes/${sid}`);
  if (error) return <span className="muted">{sid} (not available)</span>;
  return <Link to={`/scenes/${sid}`} lang="ja">{data?.title || sid}</Link>;
}
