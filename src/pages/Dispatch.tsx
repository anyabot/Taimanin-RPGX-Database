import { useState } from "react";
import { LoadState, Panel, SegmentedButtons } from "@altterisk/game-hub";
import { tr, useData, useLang, type DispatchMission, type DispatchSection } from "../data";
import { DropLine } from "../battles";

const KINDS = ["Normal", "Awakening", "Equipment", "Bloom"];
const pct = (n: number) => `${(n / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

/** Dispatch missions (派遣), by kind and section; each duration with its rewards. */
export function DispatchView() {
  const { data, loading, error } = useData<DispatchSection[]>("dispatch");
  const [kind, setKind] = useState(KINDS[0]);
  if (!data) return <LoadState loading={loading} error={error} />;
  const kinds = KINDS.filter((k) => data.some((s) => s.kind === k));
  return (
    <div className="dispatch">
      <SegmentedButtons label="Kind" selected={[kind]} onToggle={setKind}
        options={kinds.map((k) => ({ value: k, label: k }))} />
      {data.filter((s) => s.kind === kind).map((s) => <DispatchPanel key={s.section} s={s} />)}
      <p className="muted small">Rates as listed in the client (out of 10,000); the roll happens on the server.
        "Great success" is read from the rows (the same items at higher rates), not from the client code.</p>
    </div>
  );
}

function DispatchPanel({ s }: { s: DispatchSection }) {
  const lang = useLang();
  const [pick, setPick] = useState(String(s.missions[0]?.id));
  const m = s.missions.find((x) => String(x.id) === pick) ?? s.missions[0];
  if (!m) return null;
  return (
    <Panel title={<span lang="ja">{tr(s.title, lang)}</span>} note={s.days ? `Open ${s.days.join(", ")}` : "Open every day"}>
      <SegmentedButtons label="Duration" selected={[String(m.id)]} onToggle={setPick}
        options={s.missions.map((x) => ({ value: String(x.id), label: x.time.replace(/:00$/, "") }))} />
      <Mission m={m} />
    </Panel>
  );
}

const TABLES: [keyof DispatchMission["drops"], string][] = [["base", "Rewards"], ["luck", "Luck bonus"], ["great", "Great success"]];

function Mission({ m }: { m: DispatchMission }) {
  return (
    <div className="stage">
      <div className="stage-rewards">
        <span>Unit EXP <b>{m.unitExp.toLocaleString()}</b></span>
        <span>Gold <b>{m.gold.toLocaleString()}</b></span>
        <span>Trust <b>{m.trust}</b></span>
        <span>Great success <b>{pct(m.great)}</b></span>
      </div>
      <div className="drops">
        {TABLES.filter(([k]) => m.drops[k]?.length).map(([k, title]) => (
          <div key={k}>
            <h4>{title}</h4>
            <ul className="drop-list">{m.drops[k]!.map((d, i) => (
              <DropLine key={i} d={d} showGroup
                note={[d.luck !== undefined && `luck ${d.luck}+`, d.featured && "featured", d.rate !== undefined && pct(d.rate)]
                  .filter(Boolean).join(" · ")} />
            ))}</ul>
          </div>
        ))}
      </div>
    </div>
  );
}
