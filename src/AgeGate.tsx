import type { ReactNode } from "react";
import { Gate } from "@altterisk/game-hub";

// The site shows R18 art and text; ask once per browser. The gate covers the
// page rather than replacing it, so the page underneath is still there for
// search engines. Accepting is also a plain ?enter=1 link (a report from
// Firefox mobile of a gate that blocked the page with no way to accept).
export default function AgeGate({ children }: { children: ReactNode }) {
  return (
    <Gate storageKey="taimanin.adult" param="enter" title="Taimanin RPGX Database"
      acceptLabel="I am 18 or older" leaveLabel="Leave" page={children}>
      <p><b>Adults only.</b></p>
      <p>This site shows sexually explicit art and text from an R18 game. Continue only if you are 18 or older and this is legal where you are.</p>
    </Gate>
  );
}
