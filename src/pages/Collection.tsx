import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BackupPanel, CheckboxGroup, EmptyState, FallbackImage, FilterPanel, ListToolbar, LoadState, PageHeader, Panel,
  ProgressBar, SearchBox, SegmentedButtons,
} from "@altterisk/game-hub";
import { listState, searchParamsAdapter, textMatch } from "@altterisk/game-hub/filters";
import { exportFile, readFile } from "@altterisk/game-hub/persist";
import { ElementIcon, RarityIcon } from "../components";
import { useOwned, sanitizeOwned, type Owned } from "../collection";
import { ELEMENTS, RARITY, iconUrl, isUpcoming, loader, tr, unitName, useData, useLang, type UnitIndexEntry } from "../data";
import {
  AUTO_ACCEPT_DIST, HASH_BITS, cropDataUrl, scanScreenshotFile, unpackIconHashes, type IconHashDb, type IconHashJson,
} from "../iconMatch";
import { LIST_META } from "../meta";
import { usePageMeta } from "../usePageMeta";
import "./collection.css";

const MAX_FILES = 10;
const SHOW = [{ value: "all", label: "All" }, { value: "owned", label: "Owned" }, { value: "missing", label: "Missing" }];

/** Backup code: the owned ids without their leading zeros, comma separated. */
const toCode = (ids: Set<string>) => [...ids].map((id) => String(Number(id))).join(",");
const fromCode = (code: string) => sanitizeOwned(code.split(/[\s,]+/).filter((s) => /^\d{1,5}$/.test(s)).map((s) => s.padStart(5, "0")));

export default function Collection() {
  usePageMeta(LIST_META["/collection"]);
  const lang = useLang();
  const { data: index, loading, error } = useData<UnitIndexEntry[]>("units/index");
  const owned = useOwned();
  const [params, setParams] = useSearchParams();
  const url = listState(searchParamsAdapter(params, setParams));
  const q = url.text("q");
  const show = url.text("show") || "all";
  const rarityF = url.list("rarity");
  const elementF = url.list("element");
  const filtersOpen = url.text("f") === "1";

  const units = useMemo(() => (index || []).filter((u) => !isUpcoming(u))
    .sort((a, b) => b.rarity - a.rarity || (b.release || "").localeCompare(a.release || "") || b.id.localeCompare(a.id)), [index]);
  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const shown = useMemo(() => units.filter((u) =>
    (show === "all" || (show === "owned") === owned.has(u.id)) &&
    (!rarityF.length || rarityF.includes(String(u.rarity))) &&
    (!elementF.length || (u.element && elementF.includes(u.element))) &&
    (!q || textMatch(q, [u.id, u.name?.ja, u.name?.en, u.title?.ja, u.title?.en, u.displayName?.ja, u.displayName?.en, ...(u.aliases ?? [])]))),
  [units, owned, show, rarityF.join(), elementF.join(), q]);
  const rarities = [6, 5, 4, 3, 2, 1].filter((r) => units.some((u) => u.rarity === r));
  const active = rarityF.length + elementF.length;
  const ownedCount = units.filter((u) => owned.has(u.id)).length;

  return (
    <div className="collection-page">
      <PageHeader title="Collection"
        subtitle="Mark the units you own, by hand or from screenshots of the in-game unit list. The Team builder can then show only your units." />
      <LoadState loading={loading} error={error} />
      {index && <>
        <Panel title="Progress">
          <ProgressBar value={ownedCount} max={units.length} label="All units" showCount />
          <div className="collection-rarities">
            {rarities.map((r) => {
              const all = units.filter((u) => u.rarity === r);
              return <ProgressBar key={r} value={all.filter((u) => owned.has(u.id)).length} max={all.length}
                label={<RarityIcon rarity={r} height={16} />} showCount />;
            })}
          </div>
        </Panel>
        <ScreenshotImport byId={byId} owned={owned} />
        <ListToolbar
          search={<SearchBox value={q} onChange={(v) => url.setText("q", v)} placeholder="Name, title or id" />}
          count={`${shown.length} / ${units.length}`}
          activeFilters={active}
          onClearFilters={() => { url.setList("rarity", []); url.setList("element", []); }}
          actions={<SegmentedButtons options={SHOW} selected={show} label="Show" onToggle={(v) => url.setText("show", v === "all" ? "" : v)} />}
        />
        <FilterPanel open={filtersOpen} onToggle={() => url.setText("f", filtersOpen ? "" : "1")} activeCount={active}>
          <div className="filter-groups">
            <CheckboxGroup title="Rarity" options={rarities.map((r) => ({ value: String(r), label: <RarityIcon rarity={r} height={16} /> }))}
              selected={rarityF} onToggle={(v) => url.toggle("rarity", v)} />
            <CheckboxGroup title="Element" options={ELEMENTS.map((e) => ({ value: e, label: <span className="chip-icon"><ElementIcon element={e} size={16} />{e}</span> }))}
              selected={elementF} onToggle={(v) => url.toggle("element", v)} />
          </div>
        </FilterPanel>
        <div className="collection-bulk">
          <span className="muted small">Click a unit to mark it owned or not; ↗ opens its page.</span>
          <button type="button" className="hub-btn hub-btn--sm" disabled={!shown.some((u) => !owned.has(u.id))}
            onClick={() => owned.add(shown.map((u) => u.id))}>Mark all {shown.length} shown as owned</button>
          <button type="button" className="hub-btn hub-btn--sm" disabled={!shown.some((u) => owned.has(u.id))}
            onClick={() => { if (window.confirm(`Unmark ${shown.filter((u) => owned.has(u.id)).length} units?`)) owned.remove(shown.map((u) => u.id)); }}>
            Unmark all shown
          </button>
        </div>
        {!shown.length && <EmptyState title="No units match" hint={show === "owned" && !ownedCount ? "Nothing is marked owned yet." : "Clear a filter or the search."} />}
        <div className="collection-grid">
          {shown.map((u) => {
            const on = owned.has(u.id);
            return (
              <div key={u.id} className="collection-cell">
                <button type="button" className={`collection-tile${on ? " is-owned" : ""}`} aria-pressed={on}
                  onClick={() => owned.toggle(u.id)} title={`${unitName(u, lang)} ${tr(u.title, lang) || ""}`.trim()}>
                  <FallbackImage srcs={[iconUrl(u.id)]} alt="" width={72} height={72} loading="lazy" />
                  <span className="collection-tile-name">{unitName(u, lang)}</span>
                  <span className="collection-tile-title muted">{tr(u.title, lang)}</span>
                  <span className="collection-tile-meta"><RarityIcon rarity={u.rarity} height={12} /><ElementIcon element={u.element} size={14} /></span>
                </button>
                <Link className="collection-tile-link" to={`/units/${u.id}`} title="Open the unit page" aria-label={`${unitName(u, lang)}: unit page`}>↗</Link>
              </div>
            );
          })}
        </div>
        <BackupPanel
          code={toCode(owned.ids)}
          onImportCode={(code) => {
            const ids = fromCode(code);
            if (!ids.length) return "No unit ids in that code.";
            owned.replace(ids);
            return null;
          }}
          onExportFile={() => exportFile({ format: "taimanin-collection", version: 1, data: { owned: [...owned.ids] }, fileName: "taimanin-collection.json" })}
          onImportFile={async (file) => {
            const { data } = await readFile(file, "taimanin-collection", 1);
            owned.replace(sanitizeOwned(data.owned));
            return null;
          }}
          labels={{ title: "Backup", code: "Code (the owned unit ids)" }}
        />
        <p className="collection-foot small muted">
          The collection is kept in this browser only. Use the backup code or file to move it to another browser.{" "}
          <button type="button" className="hub-btn hub-btn--sm" disabled={!owned.ids.size}
            onClick={() => { if (window.confirm("Remove every unit from your collection?")) owned.replace([]); }}>Clear collection</button>
        </p>
      </>}
    </div>
  );
}

interface Candidate { unit: UnitIndexEntry; dist: number; cropUrl: string; checked: boolean }

/** Screenshot import: icons are recognized in the browser (src/iconMatch.ts), nothing is uploaded. */
function ScreenshotImport({ byId, owned }: { byId: Map<string, UnitIndexEntry>; owned: Owned }) {
  const lang = useLang();
  const dbRef = useRef<IconHashDb | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [added, setAdded] = useState<UnitIndexEntry[]>([]);
  const [note, setNote] = useState("");

  const scanFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList?.length || scanning) return;
    const all = [...fileList].filter((f) => f.type.startsWith("image/"));
    const files = all.slice(0, MAX_FILES);
    if (!files.length) return;
    setScanning(true);
    setNote("");
    try {
      if (!dbRef.current) {
        setProgress("Loading icon database…");
        dbRef.current = unpackIconHashes(await loader.load<IconHashJson>("icon_hashes"));
      }
      const db = dbRef.current;
      // confident matches are added straight away; uncertain ones wait for a tick
      const autoAdd = new Map<string, UnitIndexEntry>();
      const review = new Map<string, Candidate>();
      let already = 0;
      let unknown = 0;
      for (let fi = 0; fi < files.length; fi += 1) {
        const file = files[fi];
        const label = files.length > 1 ? `${file.name} (${fi + 1}/${files.length})` : file.name;
        const { matches, canvas } = await scanScreenshotFile(file, db, (f) => setProgress(`Scanning ${label}: ${Math.round(f * 100)}%`));
        matches.forEach((m) => {
          const unit = byId.get(m.unitId);
          if (!unit) { unknown += 1; return; }
          if (owned.has(unit.id) || autoAdd.has(unit.id)) { already += 1; return; }
          if (m.dist <= AUTO_ACCEPT_DIST) {
            autoAdd.set(unit.id, unit);
            review.delete(unit.id);
            return;
          }
          const prev = review.get(unit.id);
          if (prev && prev.dist <= m.dist) return;
          review.set(unit.id, { unit, dist: m.dist, cropUrl: cropDataUrl(canvas, m.rect), checked: false });
        });
      }
      if (autoAdd.size) owned.add(autoAdd.keys());
      setAdded([...autoAdd.values()]);
      setCandidates([...review.values()]);
      const parts = [
        autoAdd.size ? `Added ${autoAdd.size} unit${autoAdd.size === 1 ? "" : "s"}.` : "No new confident matches.",
        review.size ? `${review.size} uncertain match${review.size === 1 ? "" : "es"} below: tick the right ones.` : "",
        already ? `${already} already owned.` : "",
        unknown ? `${unknown} matched an unreleased unit.` : "",
        all.length > MAX_FILES ? `Only the first ${MAX_FILES} screenshots were scanned.` : "",
      ].filter(Boolean);
      setNote(autoAdd.size || review.size || already ? parts.join(" ")
        : "No unit icons were recognized. Use a screenshot of the in-game unit list (ユニット一覧).");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not scan the screenshot.");
    } finally {
      setScanning(false);
      setProgress("");
    }
  };

  const selected = candidates.filter((c) => c.checked);
  return (
    <Panel title="Add from screenshots">
      <div className="collection-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void scanFiles(e.dataTransfer.files); }}
        onPaste={(e) => { const f = [...e.clipboardData.files]; if (f.length) { e.preventDefault(); void scanFiles(f); } }}
        tabIndex={0}>
        <p className="small muted">
          Screenshots of the in-game unit list (ユニット一覧), whole screen or cropped, up to {MAX_FILES} at a time.
          Drop them here, paste one with Ctrl+V, or pick files. Icons are recognized in your browser; nothing is uploaded.
          Sure matches are added straight away; unsure ones are listed for you to check.
        </p>
        <input type="file" accept="image/*" multiple disabled={scanning}
          onChange={(e) => { void scanFiles(e.target.files); e.target.value = ""; }} />
      </div>
      {scanning && <p className="collection-message">{progress}</p>}
      {note && !scanning && <p className="collection-message">{note}</p>}
      {added.length > 0 && !scanning && (
        <div className="collection-added">
          {added.map((u) => (
            <Link key={u.id} to={`/units/${u.id}`} title={unitName(u, lang)}>
              <FallbackImage srcs={[iconUrl(u.id)]} alt={unitName(u, lang)} width={40} height={40} />
            </Link>
          ))}
          <button type="button" className="hub-btn hub-btn--sm" title="Take these back out of the collection"
            onClick={() => { owned.remove(added.map((u) => u.id)); setAdded([]); setNote("Undone."); }}>Undo</button>
        </div>
      )}
      {candidates.length > 0 && <>
        <div className="collection-scan-grid">
          {candidates.map((c) => {
            const pct = Math.round(100 * (1 - c.dist / HASH_BITS));
            return (
              <label key={c.unit.id} className={`collection-scan-tile${c.checked ? " on" : ""}`} title={`${pct}% match`}>
                <input type="checkbox" checked={c.checked}
                  onChange={() => setCandidates((cur) => cur.map((x) => (x.unit.id === c.unit.id ? { ...x, checked: !x.checked } : x)))} />
                <img src={c.cropUrl} alt="" width={48} height={48} />
                <span aria-hidden="true">→</span>
                <FallbackImage srcs={[iconUrl(c.unit.id)]} alt="" width={48} height={48} />
                <span className="collection-scan-name">
                  {unitName(c.unit, lang)}
                  <span className="muted small">{RARITY[c.unit.rarity]} · {pct}%</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="collection-bulk">
          <button type="button" className="hub-btn" disabled={!selected.length}
            onClick={() => { owned.add(selected.map((c) => c.unit.id)); setCandidates((cur) => cur.filter((c) => !c.checked)); }}>
            Add {selected.length} ticked
          </button>
          <button type="button" className="hub-btn" onClick={() => { setCandidates([]); setNote(""); }}>Dismiss</button>
        </div>
      </>}
    </Panel>
  );
}
