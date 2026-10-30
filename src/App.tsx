import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { NavMenu, SiteShell, homeLink, rightsText } from "@altterisk/game-hub";
import { setLang, useLang } from "./data";
import { renderLink } from "./links";

/** The less used pages, under "Etc" in the bar. */
const MORE: [href: string, label: string][] = [
  ["/statuses", "Statuses"],
  ["/people", "People"],
  ["/items", "Items"],
  ["/runes", "Runes"],
  ...(import.meta.env.DEV ? [["/lab", "Decoder lab"] as [string, string]] : []),
];

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
  const { pathname } = useLocation();
  useRouterLinks();
  return (
    <SiteShell
      game="taimanin"
      renderHomeLink={homeLink(Link, "to")}
      nav={<>
        <NavLink to="/units">Units</NavLink>
        <NavLink to="/events">Events</NavLink>
        <NavLink to="/banners">Banners</NavLink>
        <NavLink to="/gacha">Gacha sim</NavLink>
        <NavLink to="/buffs">Buffs</NavLink>
        <NavLink to="/story">Story</NavLink>
        <NavLink to="/quests">Quests</NavLink>
        <NavLink to="/cards">Cards</NavLink>
        <NavMenu label="Etc" showActiveLabel renderLink={renderLink}
          items={MORE.map(([href, label]) => ({ href, label, active: pathname === href || pathname.startsWith(`${href}/`) }))} />
      </>}
      actions={
        <button className="hub-btn" onClick={() => setLang(lang === "en" ? "ja" : "en")}
          title="Text language (English where translated)">
          {lang === "en" ? "EN" : "JA"}
        </button>
      }
      footer={{ note: "Art and audio load from the game's own servers.", links: [], legal: rightsText("taimanin") }}
      resetKey={pathname}
      contentWidth="1280px"
    >
      <Outlet />
    </SiteShell>
  );
}
