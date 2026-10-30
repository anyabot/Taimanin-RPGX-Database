import { Link } from "react-router-dom";
import { EmptyState } from "@altterisk/game-hub";
import { usePageMeta } from "../usePageMeta";

/** Any path no route matches: the SPA fallback serves it with a 200, so say noindex. */
export default function NotFound() {
  usePageMeta({ title: "Page not found", description: "There is no page at this address.", noindex: true });
  return <EmptyState title="Page not found" hint={<Link to="/">Home</Link>} />;
}
