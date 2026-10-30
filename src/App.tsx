import { useEffect } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { HubBar, HubFooter } from "@altterisk/game-hub";
import { setLang, useLang } from "./data";

/** Files served as they are, never routes. */
const STATIC = /^\/(assets|data|icons|ui|vendor)\/|\.[a-z0-9]+$/i;

/** game-hub's components (breadcrumbs, chips, tiles) render plain <a href>:
 *  same-site clicks on those go through the router instead of reloading. */
function useRouterLinks() {
  const navigate = useNavigate();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || STATIC.test(url.pathname)) return;
      e.preventDefault();
      navigate(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [navigate]);
}

export default function App() {
  const lang = useLang();
  useRouterLinks();
  return (
    <div className="app">
      <HubBar
        game="taimanin"
        renderHomeLink={({ className, children }) => <Link to="/" className={className}>{children}</Link>}
        nav={<>
          <NavLink to="/units">Units</NavLink>
          <NavLink to="/events">Events</NavLink>
          <NavLink to="/banners">Banners</NavLink>
          <NavLink to="/gacha">Gacha sim</NavLink>
          <NavLink to="/buffs">Buffs</NavLink>
          <NavLink to="/statuses">Statuses</NavLink>
          <NavLink to="/story">Story</NavLink>
          <NavLink to="/quests">Quests</NavLink>
          <NavLink to="/cards">Cards</NavLink>
          <NavLink to="/people">People</NavLink>
          <NavLink to="/items">Items</NavLink>
          <NavLink to="/runes">Runes</NavLink>
          {import.meta.env.DEV && <NavLink to="/lab">Decoder lab</NavLink>}
        </>}
        actions={
          <button className="hub-btn" onClick={() => setLang(lang === "en" ? "ja" : "en")}
            title="Text language (English where translated)">
            {lang === "en" ? "EN" : "JA"}
          </button>
        }
      />
      <main>
        <Outlet />
      </main>
      <HubFooter
        game="taimanin"
        note="Fan-made and unofficial. Game art, audio and text belong to their owners; art and audio load from the game's own servers."
      />
    </div>
  );
}
