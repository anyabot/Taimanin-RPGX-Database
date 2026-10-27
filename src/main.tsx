import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import AgeGate from "./AgeGate";
import UnitList from "./pages/UnitList";
import UnitDetail from "./pages/UnitDetail";
import Runes from "./pages/Runes";
import Buffs from "./pages/Buffs";
import Statuses from "./pages/Statuses";
import StoryList from "./pages/StoryList";
import StoryBattles from "./pages/StoryBattles";
import QuestList, { QuestBattles } from "./pages/Quests";
import CardList, { CardDetail } from "./pages/Cards";
import ItemList, { ItemDetail } from "./pages/Items";
import ScenePlayer from "./pages/ScenePlayer";
import DecoderLab from "./pages/DecoderLab";
import "@altterisk/game-hub/hub.css";
import "@altterisk/game-hub/base.css";
import "@altterisk/game-hub/components.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AgeGate>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="/units" replace />} />
          <Route path="units" element={<UnitList />} />
          <Route path="units/:id" element={<UnitDetail />} />
          <Route path="scenes/:id" element={<ScenePlayer />} />
          <Route path="story" element={<StoryList />} />
          <Route path="story/battles/:id" element={<StoryBattles />} />
          <Route path="story/:id" element={<ScenePlayer source="story" />} />
          <Route path="quests" element={<QuestList />} />
          <Route path="quests/:id" element={<QuestBattles />} />
          <Route path="cards" element={<CardList />} />
          <Route path="cards/:id" element={<CardDetail />} />
          <Route path="items" element={<ItemList />} />
          <Route path="items/:id" element={<ItemDetail />} />
          <Route path="runes" element={<Runes />} />
          <Route path="buffs" element={<Buffs />} />
          <Route path="statuses" element={<Statuses />} />
          {import.meta.env.DEV && <Route path="lab" element={<DecoderLab />} />}
        </Route>
      </Routes>
    </HashRouter>
    </AgeGate>
  </React.StrictMode>
);
