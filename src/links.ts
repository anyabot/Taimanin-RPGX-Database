import { Link } from "react-router-dom";
import { routerLinks } from "@altterisk/game-hub";

/** game-hub parts that take `renderLink` link through the router. */
export const renderLink = routerLinks(Link, "to");
