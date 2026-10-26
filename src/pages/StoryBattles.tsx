import { useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Breadcrumbs, LoadState } from "@altterisk/game-hub";
import { tr, useData, useLang, type BattleQuest, type Battles, type StorySection } from "../data";
import { BattleBody } from "../battles";
import { StoryBanner } from "./StoryList";

/** Quests, enemies and raid bosses of one story chapter / event. */
export default function StoryBattles() {
  const { id = "" } = useParams();
  const { data: index } = useData<StorySection[]>("stories/index");
  const { data, loading, error } = useData<Battles>(`stories/battles/${id}`);
  const lang = useLang();
  const found = useMemo(() => {
    for (const sec of index ?? []) for (const g of sec.groups) if (g.id === id) return { sec, g };
    return null;
  }, [index, id]);
  const title = found ? tr(found.g.title, lang) || found.g.id : id;
  const partTitle = useCallback((sid: string) => {
    const p = found?.g.parts.find((x) => x.id === sid);
    return p ? [p.section, p.title].filter(Boolean).join(" · ") : sid;
  }, [found]);
  // stages in the order their story parts come in the chapter; stages without a story last
  const order = useCallback((q: BattleQuest) => {
    const i = found?.g.parts.findIndex((p) => q.scripts.includes(p.id)) ?? -1;
    return i < 0 ? 1e6 : i;
  }, [found]);

  return (
    <div className="battles-page">
      <Breadcrumbs items={[
        { label: "Story", href: `#/story${found ? `?section=${found.sec.key}` : ""}` },
        { label: title, href: found ? `#/story?section=${found.sec.key}&open=${found.g.id}` : undefined },
        { label: "Battles" },
      ]} />
      <div className="battles-head">
        {found?.g.banner && <StoryBanner banner={found.g.banner} large />}
        <div>
          <h1 lang="ja">{title}</h1>
          {data && <p className="muted">{[
            data.quests.length && `${data.quests.length} quests`,
            Object.keys(data.enemies).length && `${Object.keys(data.enemies).length} enemies`,
            data.bosses.length && `${data.bosses.length} raid boss tiers`,
          ].filter(Boolean).join(" · ")}</p>}
        </div>
      </div>
      <LoadState loading={loading && !data} error={error} />
      {data && <BattleBody data={data} partTitle={partTitle} order={order} />}
    </div>
  );
}
