import { useEffect } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { setLang, useLang } from "./data";
import { SITE_NAME } from "./meta";

export { SITE_NAME };
export const SOURCE_URL = "https://github.com/anyabot/Taimanin-RPGX-Database";

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

// Uses game-hub's bar/footer styles (hub.css) but not HubBar/HubFooter: the
// site is not registered in game-hub's GAMES yet, so it carries its own name
// and no game switcher. Swap to <HubBar game="taimanin"> once it joins.
export default function App() {
  const lang = useLang();
  useRouterLinks();
  return (
    <div className="app">
      <header className="hub-bar" data-game="taimanin">
        <div className="hub-bar__inner">
          <div className="hub-bar__brand">
            <Link to="/" className="hub-bar__home">
              <img className="site-logo" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={22} height={22} />
              <span className="hub-bar__name">{SITE_NAME}</span>
            </Link>
          </div>
          <nav className="hub-bar__nav" aria-label="Primary">
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
          </nav>
          <div className="hub-bar__actions">
            <button className="hub-btn" onClick={() => setLang(lang === "en" ? "ja" : "en")}
              title="Text language (English where translated)">
              {lang === "en" ? "EN" : "JA"}
            </button>
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="hub-footer" data-game="taimanin">
        <div className="hub-footer__inner">
          <div className="hub-footer__row">
            <span className="hub-footer__name">{SITE_NAME}</span>
            <a href={SOURCE_URL} target="_blank" rel="noreferrer">Source on GitHub</a>
          </div>
          <div className="hub-footer__note">
            Fan-made and unofficial. Game art, audio and text belong to their owners; art and audio load from the game's own servers.
          </div>
        </div>
      </footer>
    </div>
  );
}
