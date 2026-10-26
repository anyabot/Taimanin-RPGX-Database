import { Link, NavLink, Outlet } from "react-router-dom";
import { setLang, useLang } from "./data";

export const SITE_NAME = "Taimanin RPGX Database";
export const SOURCE_URL = "https://github.com/anyabot/Taimanin-RPGX-Database";

// Uses game-hub's bar/footer styles (hub.css) but not HubBar/HubFooter: the
// site is not registered in game-hub's GAMES yet, so it carries its own name
// and no game switcher. Swap to <HubBar game="taimanin"> once it joins.
export default function App() {
  const lang = useLang();
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
