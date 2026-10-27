import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Breadcrumbs, LoadState, PageHeader, Panel, SearchBox, SegmentedButtons } from "@altterisk/game-hub";
import { textMatch } from "@altterisk/game-hub/filters";
import { RARITY, tr, useAssets, useData, useLang, type ArenaCard } from "../data";
import { CreditLinks, RarityIcon } from "../components";
import { ArtGallery, SceneStills } from "../art";
import type { SceneDoc } from "../adv";

const UNIONS = ["Taimanin", "UFS", "Demon"];

/** Arena cards (BattleArenas): the 決戦アリーナ cards, with art and scenes. */
export default function CardList() {
  const { data, loading, error } = useData<ArenaCard[]>("cards");
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const union = params.get("union") || "";
  const rarity = params.get("rarity") || "";
  const q = params.get("q") || "";
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
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
      <SegmentedButtons label="Union" selected={[union]} onToggle={(v) => set("union", v === union ? null : v)}
        options={UNIONS.map((u) => ({ value: u, label: u }))} />
      <SegmentedButtons label="Rarity" selected={[rarity]} onToggle={(v) => set("rarity", v === rarity ? null : v)}
        options={rarities.map((r) => ({ value: String(r), label: RARITY[r] ?? String(r) }))} />
      <SearchBox value={q} onChange={(v) => set("q", v || null)} placeholder="Search names, illustrators, voices" />
      </div>
      <p className="muted small">{cards.length} / {data.length}</p>
      <div className="quest-groups">
        {cards.map((c) => (
          <Link key={c.id} className="quest-card" to={`/cards/${c.id}`}>
            <span className="quest-card-title" lang="ja"><RarityIcon rarity={c.rarity} height={14} /> {tr(c.name, lang) || c.id}</span>
            {c.title && <span className="muted" lang="ja">{tr(c.title, lang)}</span>}
            <span className="muted">{[c.union, c.scenes.length && `${c.scenes.length} scene${c.scenes.length === 1 ? "" : "s"}`, c.illustrator]
              .filter(Boolean).join(" · ")}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** One card: credits, both pictures, its scenes. */
export function CardDetail() {
  const { id = "" } = useParams();
  const { data, loading, error } = useData<ArenaCard[]>("cards");
  const lang = useLang();
  const card = data?.find((c) => c.id === id);
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
      <Breadcrumbs items={[{ label: "Arena cards", href: "#/cards" }, { label: name }]} />
      <div className="battles-head">
        <div>
          <h1 lang="ja"><RarityIcon rarity={card.rarity} height={18} /> {name}</h1>
          {card.title && <p className="muted" lang="ja">{tr(card.title, lang)}</p>}
        </div>
      </div>
      <Panel title="Card">
        <dl className="credits">
          {card.union && <><dt>Union</dt><dd>{card.union}</dd></>}
          {card.illustrator && <><dt>Illustrator</dt><dd><CreditLinks raw={card.illustrator} role="artist" /></dd></>}
          {card.voiceActor && <><dt>Voice</dt><dd><CreditLinks raw={card.voiceActor} role="cv" /></dd></>}
          {card.sale && <><dt>On sale from</dt><dd>{card.sale}</dd></>}
        </dl>
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
