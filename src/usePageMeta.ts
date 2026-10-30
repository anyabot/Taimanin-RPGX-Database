import { useLocation } from "react-router-dom";
import { useHead } from "@altterisk/game-hub/meta/dom";
import { DEFAULT_META, site, type PageMeta } from "./meta";

/** Title, description, canonical and Open Graph tags for the current page.
 *  Every routed page calls it; null (still loading) shows the site defaults. */
export function usePageMeta(page: PageMeta | null | undefined) {
  const { pathname } = useLocation();
  const meta = page ?? DEFAULT_META;
  useHead(site.headTags(meta, meta.noindex ? null : site.canonicalUrl(pathname)));
}
