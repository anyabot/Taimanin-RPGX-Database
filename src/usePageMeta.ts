import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { DEFAULT_META, SITE_URL, canonicalUrl, fullTitle, type PageMeta } from "./meta";

function setHead(selector: string, make: () => HTMLElement, attr: string, value: string | null) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (value === null) { el?.remove(); return; }
  if (!el) document.head.appendChild((el = make()));
  el.setAttribute(attr, value);
}

const meta = (key: "name" | "property", name: string) => () => {
  const el = document.createElement("meta");
  el.setAttribute(key, name);
  return el;
};

/** Title, description, canonical and Open Graph tags for the current page.
 *  Every routed page calls it; null (still loading) shows the site defaults. */
export function usePageMeta(page: PageMeta | null | undefined) {
  const { pathname } = useLocation();
  const { title, description, image, noindex } = page ?? DEFAULT_META;
  useEffect(() => {
    const url = canonicalUrl(pathname);
    document.title = fullTitle(title);
    setHead('meta[name="description"]', meta("name", "description"), "content", description);
    setHead('link[rel="canonical"]', () => Object.assign(document.createElement("link"), { rel: "canonical" }), "href", url);
    setHead('meta[property="og:title"]', meta("property", "og:title"), "content", fullTitle(title));
    setHead('meta[property="og:description"]', meta("property", "og:description"), "content", description);
    setHead('meta[property="og:url"]', meta("property", "og:url"), "content", url);
    setHead('meta[property="og:image"]', meta("property", "og:image"), "content", image ? SITE_URL + image : null);
    setHead('meta[name="robots"]', meta("name", "robots"), "content", noindex ? "noindex" : null);
  }, [pathname, title, description, image, noindex]);
}
