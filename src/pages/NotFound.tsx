import { NotFound as HubNotFound } from "@altterisk/game-hub";
import { renderLink } from "../links";
import { usePageMeta } from "../usePageMeta";

/** Any path no route matches: the SPA fallback serves it with a 200, so say noindex. */
export default function NotFound() {
  usePageMeta({ title: "Page not found", description: "There is no page at this address.", noindex: true });
  return <HubNotFound renderLink={renderLink} />;
}
