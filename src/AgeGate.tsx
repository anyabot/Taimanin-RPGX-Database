import { useState, type ReactNode } from "react";

// The site shows R18 art and text; ask once per browser.
const KEY = "taimanin.adult";

export default function AgeGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });
  if (ok) return <>{children}</>;
  return (
    <div className="age-gate">
      <div className="age-gate-card">
        <h1>Taimanin RPGX Database</h1>
        <p><b>Adults only.</b></p>
        <p>This site shows sexually explicit art and text from an R18 game. Continue only if you are 18 or older and this is legal where you are.</p>
        <div className="age-gate-actions">
          <button className="hub-btn" onClick={() => { try { localStorage.setItem(KEY, "1"); } catch { /* private mode */ } setOk(true); }}>
            I am 18 or older
          </button>
          <a className="hub-btn" href="https://www.google.com/">Leave</a>
        </div>
      </div>
    </div>
  );
}
