import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import AgeGate from "./AgeGate";
import UnitList from "./pages/UnitList";
import UnitDetail from "./pages/UnitDetail";
import Runes from "./pages/Runes";
import Buffs from "./pages/Buffs";
import Statuses from "./pages/Statuses";
import PeopleIndex, { PersonPage } from "./pages/People";
import StoryList from "./pages/StoryList";
import Home from "./pages/Home";
import EventList, { EventPage } from "./pages/Events";
import BannerList from "./pages/Banners";
import GachaSim from "./pages/Gacha";
import StoryBattles from "./pages/StoryBattles";
import QuestList, { QuestBattles } from "./pages/Quests";
import CardList, { CardDetail } from "./pages/Cards";
import ItemList, { ItemDetail } from "./pages/Items";
import ScenePlayer from "./pages/ScenePlayer";
import TranscriptPage from "./pages/Transcript";
import DecoderLab from "./pages/DecoderLab";
import NotFound from "./pages/NotFound";
import "@altterisk/game-hub/hub.css";
import "@altterisk/game-hub/base.css";
import "@altterisk/game-hub/components.css";
import "./styles.css";

// Links from when the site used hash routes: /#/units/1?tab=art -> /units/1?tab=art
// (a query outside the hash, the age gate's ?enter=1, is kept).
if (window.location.hash.startsWith("#/")) {
  const url = new URL(window.location.hash.slice(1), window.location.origin);
  new URLSearchParams(window.location.search).forEach((v, k) => url.searchParams.set(k, v));
  window.history.replaceState(null, "", url);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AgeGate>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Home />} />
          <Route path="events" element={<EventList />} />
          <Route path="events/:id" element={<EventPage />} />
          <Route path="banners" element={<BannerList />} />
          <Route path="gacha" element={<GachaSim />} />
          <Route path="units" element={<UnitList />} />
          <Route path="units/:id" element={<UnitDetail />} />
          <Route path="scenes/:id" element={<ScenePlayer />} />
          <Route path="scenes/:id/transcript" element={<TranscriptPage />} />
          <Route path="story" element={<StoryList />} />
          <Route path="story/battles/:id" element={<StoryBattles />} />
          <Route path="story/:id" element={<ScenePlayer source="story" />} />
          <Route path="story/:id/transcript" element={<TranscriptPage source="story" />} />
          <Route path="quests" element={<QuestList />} />
          <Route path="quests/:id" element={<QuestBattles />} />
          <Route path="cards" element={<CardList />} />
          <Route path="cards/:id" element={<CardDetail />} />
          <Route path="items" element={<ItemList />} />
          <Route path="items/:id" element={<ItemDetail />} />
          <Route path="runes" element={<Runes />} />
          <Route path="buffs" element={<Buffs />} />
          <Route path="statuses" element={<Statuses />} />
          <Route path="people" element={<PeopleIndex />} />
          <Route path="people/:role/:name" element={<PersonPage />} />
          {import.meta.env.DEV && <Route path="lab" element={<DecoderLab />} />}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </AgeGate>
  </React.StrictMode>
);
