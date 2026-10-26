import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import AgeGate from "./AgeGate";
import UnitList from "./pages/UnitList";
import UnitDetail from "./pages/UnitDetail";
import Runes from "./pages/Runes";
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
          <Route path="runes" element={<Runes />} />
          {import.meta.env.DEV && <Route path="lab" element={<DecoderLab />} />}
        </Route>
      </Routes>
    </HashRouter>
    </AgeGate>
  </React.StrictMode>
);
