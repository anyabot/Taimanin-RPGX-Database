import { useState, type CSSProperties, type ReactNode } from "react";

// The site shows R18 art and text; ask once per browser.
const KEY = "taimanin.adult";
const ENTER = "enter";

// Accepting is a plain link to ?enter=1 rather than only a click handler, and
// the gate carries its own inline styles: either keeps it usable when a tap
// never reaches React or the stylesheets fail (a report from Firefox mobile of
// a gate that blocked the page with no way to accept).
function acceptedFromUrl(): boolean {
  const url = new URL(window.location.href);
  if (url.searchParams.get(ENTER) !== "1") return false;
  url.searchParams.delete(ENTER);
  window.history.replaceState(null, "", url.toString());
  return true;
}

function remember() {
  try { localStorage.setItem(KEY, "1"); } catch { /* private mode: this visit only */ }
}

const S: Record<string, CSSProperties> = {
  gate: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    boxSizing: "border-box", background: "#0b0e14", color: "#e6e8ef" },
  card: { maxWidth: 440, width: "100%", padding: 24, borderRadius: 12, border: "1px solid #2a2e3b", background: "#1a1d27",
    boxSizing: "border-box" },
  actions: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 },
  button: { display: "inline-block", padding: "10px 18px", borderRadius: 999, border: "1px solid #3a3f50",
    background: "#262a37", color: "#fff", font: "600 15px/1.2 system-ui, sans-serif", textDecoration: "none", cursor: "pointer" },
};

export default function AgeGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(() => {
    if (acceptedFromUrl()) { remember(); return true; }
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });
  if (ok) return <>{children}</>;
  const enterHref = (() => {
    const url = new URL(window.location.href);
    url.searchParams.set(ENTER, "1");
    return url.toString();
  })();
  return (
    <div className="age-gate" style={S.gate}>
      <div className="age-gate-card" style={S.card}>
        <h1 style={{ marginTop: 0 }}>Taimanin RPGX Database</h1>
        <p><b>Adults only.</b></p>
        <p>This site shows sexually explicit art and text from an R18 game. Continue only if you are 18 or older and this is legal where you are.</p>
        <div className="age-gate-actions" style={S.actions}>
          <a className="hub-btn" style={S.button} href={enterHref}
            onClick={(e) => { e.preventDefault(); remember(); setOk(true); }}>
            I am 18 or older
          </a>
          <a className="hub-btn" style={S.button} href="https://www.google.com/">Leave</a>
        </div>
      </div>
    </div>
  );
}
