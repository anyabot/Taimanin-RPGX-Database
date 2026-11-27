// Suggested team from the units a player owns, by the community's simple
// team-building rules (agreed with the Discord mods). The rules are kept in
// RULES below so the page shows exactly what the code does.
//
// Effect values come from public/data/buffs.json: each unit's top form, max
// skill level ("assume highest level"). Unit ATK/SPD are the index stats (top
// form, max level).

/** One row of public/data/buffs.json (tools/web_export/buffs.py). */
export interface BuffRow {
  u: string;
  c: string;
  k: string;
  v: number;
  p: 0 | 1;
  sc: "self" | "all" | "some" | "element" | "trait" | "enemies" | "enemy";
  el?: string;
  tr?: string;
  t: number;
  s: "attack" | "skill1" | "skill2" | "ultimate" | "leader";
  n?: string;
  x: string;
}

export interface Candidate {
  id: string; element: string | null; traits: string[]; atk: number; spd: number; def?: number;
  /** not owned but free to get (the free Yukikaze): only used as the buffer, and an owned unit wins a tie */
  free?: boolean;
}

/** The only truly free unit: Yukikaze 【Lightning Taimanin】, all allies ATK/DEF +60% (rule 3's fallback). */
export const FREE_BUFFER = "00068";

/** AP content's support: Bride Rinko 【花嫁御寮】, leader skill Rank EXP +35% (the highest), Superhuman */
export const AP_SUPPORT = "01051";
/** BP content's support: the first Ragnarok, usually on the support list */
export const BP_SUPPORT = "00745";

export type Role = "sp" | "spot" | "buffer" | "healer" | "dps" | "exp";

export interface Member {
  id: string;
  role: Role;
  /** the effects that earned the unit its place */
  why: BuffRow[];
  /** extra buffs/debuffs this unit should also cast (rule 6) */
  extra: BuffRow[];
  /** SP units 2 and 3: cast only this skill (rule 6) */
  only?: BuffRow;
  /** rule 6: the SP unit that moves first */
  firstSp?: boolean;
  /** rule 5: the team leader */
  leader?: boolean;
}

/** One team for one kind of content (rule 5). Members are leader first. */
export interface Plan {
  members: Member[];
  atk: BuffRow; def: BuffRow; heal: BuffRow;
  /** the leader-skill effects that made the leader */
  leaderWhy: BuffRow[];
  support: string;
  supportWhy: BuffRow[];
  /** AP: the BP team's member the Rank EXP leader took the place of */
  replaced?: Member;
  /** why the leader isn't picked by the usual rule */
  note?: string;
}

export type Suggestion =
  | { ok: true; ap: Plan; bp: Plan }
  | { ok: false; reason: string };

export const RULES = `1. SP: pick up to 3 units that each restore 70+ SP (or 20%+ SP) to the WHOLE team
   - any skill counts (S1/S2/ougi make no difference)
   - restores under 70 SP don't count
   - more SP units is better: 3, then 2, then 1
   - an element-only restore (e.g. "All Devilish allies") or one needing "4+ Taimanin allies" counts
     only if it completes a 3-SP team and every member is of that element/trait (so it reaches everyone)
   - "back row only" restores don't count
   - no SP unit at all -> 1 unit with team SP over time (SPoT) instead

2. HP: the team needs a whole-team heal
   - 3 SP units and one of them heals the team -> done
   - otherwise add a unit with team HP over time (HPoT) of 20%+/turn
     (3 SP + HPoT, 2 SP + HPoT, 1 SP + HPoT, or SPoT + HPoT)
   - with 3 SP units the HPoT unit is the buffer or the DPS (no extra slot)

3. BUFFS: the team needs 1 ATK buff + 1 DEF buff
   - SP units already give one -> add the unit with the highest value for the other
   - SP units give neither -> add 1 unit that gives both (fallback: free Yukikaze)
   - only count buffs that apply to this team (skip element/trait-limited buffs that don't match)
   - a 3-4 turn buff always beats a 1-turn buff

4. DPS: the free slots go to the highest-ATK units left (max level)

5. LEADER and SUPPORT: two teams, one for each kind of content
   AP content (costs AP: story, quests):
   - the only content that gives Rank EXP, and the support unit fights with all her skills
   - support: Bride Rinko 【Bride's Residence】 (Rank EXP +35%; filter the support list by Superhuman)
   - leader: your unit with the highest Rank EXP leader skill. Not in the team -> she takes the
     place of the lowest-ATK DPS (or the buffer), as long as the team keeps its buffs, heal and SP
   BP content (costs BP: raids):
   - no Rank EXP, and only the support unit's leader skill works
   - support: Ragnarok (the first one, often on the support list)
   - leader: the member whose leader skill gives the team the most Max HP + DEF (else ATK)
   - leader skills don't count for rules 1-4

6. SCRIPT:
   - SP units 2 and 3: only cast their SP skill
   - DPS, buffer and SP unit 1: also cast any extra buff/debuff the team doesn't already have

If the box can't meet a rule -> "Not enough units yet."`;

const TEAM = 5;
/** at most this many SP units are tried in combination (best first) */
const SP_POOL = 16;

/** Conditions that don't stop an effect from working in any team. Everything
 *  else (random chance, a named unit in the party, HP thresholds, stacks, a
 *  mode, a party row, element counts...) is not counted on. */
const SAFE_NOTE = [/^Before attacking$/, /^\(trait buff\)$/, /^for \d+ turns?$/, /^Extra action \(end of turn\)$/,
  /^all allies \+[\d.]+%$/, /^with 1 \w+ ally, \+[\d.]+% for each more/, /^Without [^;]+$/];
const reliable = (r: BuffRow) => !r.n || r.n.split("; ").every((part) => SAFE_NOTE.some((re) => re.test(part)));
/** Skill effects only (leader skills don't count for rules 1-4) that always work */
const isSkill = (r: BuffRow) => r.s !== "leader" && reliable(r);
/** "4+ Taimanin allies": a team-make-up condition on a whole-team SP restore */
const teamCond = (r: BuffRow) => { const m = /^(\d+)\+ (.+) allies$/.exec(r.n ?? ""); return m ? { n: Number(m[1]), of: m[2] } : null; };
const bigSp = (r: BuffRow) => r.s !== "leader" && r.c === "recovery" && r.k === "SP restore" && (r.p ? r.v >= 20 : r.v >= 70);
/** whole-team SP restore that works in any team */
const spRestore = (r: BuffRow) => bigSp(r) && r.sc === "all" && reliable(r);
/** SP restore that only reaches the whole team in some teams: element/trait-only,
 *  or "4+ Taimanin allies". Used only when it makes a 3-SP team whose members all fit. */
const spRestricted = (r: BuffRow) => bigSp(r) && (((r.sc === "element" || r.sc === "trait") && reliable(r)) || (r.sc === "all" && !!teamCond(r)));
const anySp = (r: BuffRow) => spRestore(r) || spRestricted(r);
const isOf = (u: Candidate, x: string) => u.element === x || u.traits.includes(x);
/** may this member join a team that relies on the restricted restore r? */
const fitsSp = (r: BuffRow, u: Candidate) =>
  r.sc === "element" ? u.element === r.el : r.sc === "trait" ? !!r.tr && u.traits.includes(r.tr) : (c => !c || isOf(u, c.of))(teamCond(r));
/** does the restricted restore r reach the whole final team? */
const spWorks = (r: BuffRow, team: Candidate[]) => {
  if (r.sc === "element" || r.sc === "trait") return applies(r, team);
  const c = teamCond(r);
  return !c || team.filter((u) => isOf(u, c.of)).length >= c.n;
};
const teamHeal = (r: BuffRow) => isSkill(r) && r.c === "recovery" && (r.k === "HP restore" || r.k === "HP regen") && r.sc === "all";
const hpot = (r: BuffRow) => isSkill(r) && r.c === "recovery" && r.k === "HP regen" && r.sc === "all" && r.p === 1 && r.v >= 20;
const statBuff = (k: "ATK" | "DEF") => (r: BuffRow) => isSkill(r) && r.c === "stat" && r.k === k && r.p === 1 && (r.sc === "all" || r.sc === "element" || r.sc === "trait");
const atkBuff = statBuff("ATK");
const defBuff = statBuff("DEF");
const leaderFx = (r: BuffRow) => r.s === "leader" && reliable(r);
const expRow = (r: BuffRow) => leaderFx(r) && r.c === "utility" && r.k === "Player EXP" && r.sc === "all";
const leaderStat = (k: string) => (r: BuffRow) => leaderFx(r) && r.c === "stat" && r.k === k && r.p === 1;
const spot = (r: BuffRow) => isSkill(r) && r.c === "recovery" && r.k === "SP regen" && r.sc === "all";
/** a 3-4 turn (or rest-of-battle) effect beats a 1-turn one, whatever the values */
const rank = (r: BuffRow) => (r.t >= 3 || r.t < 0 ? 10_000 : 0) + r.v;
/** % SP restore compared with flat: 20% ~ 70 SP */
const spValue = (r: BuffRow) => (r.p ? r.v * 3.5 : r.v);

/** A skill effect as the unit files have it (src/data.ts Effect). */
interface SkillFx { slot: BuffRow["s"]; effects: { text: string; tag?: string }[] }

/**
 * Whole-team SP restores raised by the "Healing +…" modifier listed right
 * after them in the skill's effects (e.g. "+100% per 100 of the allies'
 * average SPD"), as extra SP-restore rows with the raised value. Only
 * modifiers that hold in any team are counted:
 * - allies' average SPD: estimated with the unit's own SPD
 * - own DEF: the unit's max-level DEF
 * - "with 1 X ally": counted (at the 1-ally value) when the unit itself is X
 * Others (HP missing, stacks) are left out.
 */
export function boostedSpRows(id: string, skills: SkillFx[], u: { element: string | null; spd: number; def: number }): BuffRow[] {
  const out: BuffRow[] = [];
  for (const sk of skills) {
    sk.effects.forEach((e, i) => {
      const m = /^All allies: restore (\d+) SP$/.exec(e.text);
      if (!m) return;
      // the skill's modifiers follow its effects as a block ("Power +…", "Healing +…"): take the Healing one
      let j = i + 1;
      while (j < sk.effects.length && sk.effects[j].tag !== "modifier") j++;
      let mod: { text: string } | undefined;
      for (; j < sk.effects.length && sk.effects[j].tag === "modifier"; j++) if (sk.effects[j].text.startsWith("Healing")) { mod = sk.effects[j]; break; }
      if (!mod) return;
      let pct = 0;
      let how = "";
      let x: RegExpExecArray | null;
      if ((x = /^Healing \+([\d.]+)% per (\d+) of the allies' average SPD/.exec(mod.text))) {
        pct = (Number(x[1]) * u.spd) / Number(x[2]); how = `with ${u.spd} average SPD`;
      } else if ((x = /^Healing \+([\d.]+)% per (\d+) of own DEF/.exec(mod.text))) {
        pct = (Number(x[1]) * u.def) / Number(x[2]); how = `with ${u.def} DEF`;
      } else if ((x = /^Healing \+([\d.]+)% with 1 (\w+) ally/.exec(mod.text)) && x[2] === u.element) {
        pct = Number(x[1]); how = `with 1 ${x[2]} ally`;
      }
      if (pct <= 0) return;
      const v = Math.floor(Number(m[1]) * (1 + pct / 100));
      out.push({ u: id, c: "recovery", k: "SP restore", v, p: 0, sc: "all", t: 0, s: sk.slot,
        x: `All allies: restore ${m[1]} SP, about ${v} ${how} (${mod.text.replace(/^Healing/, "SP restored")})` });
    });
  }
  return out;
}

/** Does an ally buff land on every member? */
function applies(r: BuffRow, team: Candidate[]) {
  if (r.sc === "all") return true;
  if (r.sc === "element") return team.every((u) => u.element === r.el);
  if (r.sc === "trait") return team.every((u) => !!r.tr && u.traits.includes(r.tr));
  return false;
}

function best(rows: BuffRow[], team: Candidate[]) {
  let top: BuffRow | undefined;
  for (const r of rows) if (applies(r, team) && (!top || rank(r) > rank(top))) top = r;
  return top;
}

function combos<T>(list: T[], k: number): T[][] {
  if (k === 0) return [[]];
  const out: T[][] = [];
  list.forEach((x, i) => { for (const rest of combos(list.slice(i + 1), k - 1)) out.push([x, ...rest]); });
  return out;
}

interface Built { team: Candidate[]; roles: Map<string, Role>; atk: BuffRow; def: BuffRow; heal: BuffRow; score: number[] }

export function suggestTeam(owned: Candidate[], rows: BuffRow[]): Suggestion {
  const by = new Map<string, BuffRow[]>();
  for (const r of rows) by.set(r.u, [...(by.get(r.u) || []), r]);
  const fx = (id: string) => by.get(id) || [];
  const units = owned.filter((u) => fx(u.id).length || u.atk);
  const mine = units.filter((u) => !u.free);

  // 1. SP units, best restore first
  // a restore that works in any team first, then the strongest
  const spRow = (u: Candidate) => fx(u.id).filter(anySp).sort((a, b) => Number(spRestricted(a)) - Number(spRestricted(b)) || spValue(b) - spValue(a))[0];
  const sp = mine.filter((u) => spRow(u)).sort((a, b) => spValue(spRow(b)) - spValue(spRow(a)) || b.atk - a.atk).slice(0, SP_POOL);
  // no SP unit: one SP-over-time unit, best first
  const spotRow = (u: Candidate) => fx(u.id).filter(spot).sort((a, b) => rank(b) - rank(a))[0];
  const spots = mine.filter((u) => spotRow(u)).sort((a, b) => rank(spotRow(b)) - rank(spotRow(a)) || b.atk - a.atk).slice(0, SP_POOL);
  // 3 SP units if a team can be made with them, else 3 with a restricted
  // restore (element/trait-only, "4+ Taimanin allies"), else 2, else 1, else SPoT
  const plain = sp.filter((u) => !spRestricted(spRow(u)));
  const tries: { sets: Candidate[][]; spot: boolean }[] = [];
  if (plain.length >= 3) tries.push({ sets: combos(plain, 3), spot: false });
  if (sp.length >= 3 && sp.length > plain.length) tries.push({ sets: combos(sp, 3).filter((s) => s.some((u) => spRestricted(spRow(u)))), spot: false });
  for (const k of [2, 1]) if (plain.length >= k) tries.push({ sets: combos(plain, k), spot: false });
  if (!plain.length) tries.push({ sets: spots.map((u) => [u]), spot: true });
  if (!tries.length) return { ok: false, reason: "Not enough units yet: no unit restores 70+ SP (or 20%+) to the whole team, and none gives team SP over time (rule 1)." };

  let top: Built | undefined;
  let lastFail = "";
  for (const { sets, spot: isSpot } of tries) {
    for (const set of sets) {
      const r = build(set, units, fx, isSpot, isSpot ? [] : set.map(spRow).filter(spRestricted));
      if (typeof r === "string") { lastFail = r; continue; }
      if (!top || compare(r.score, top.score) > 0) top = r;
    }
    if (top) break;
  }
  if (!top) return { ok: false, reason: `Not enough units yet: ${lastFail}` };

  const { team, roles } = top;
  const leaderRows = (id: string) => fx(id).filter((r) => r.s === "leader");

  /** a finished team: its buffs, heal and SP still hold, plus the script (rule 6) */
  const make = (team: Candidate[], roles: Map<string, Role>, leader: string) => {
    const spUnits = team.filter((u) => roles.get(u.id) === "sp").sort((a, b) => b.spd - a.spd);
    if (!spUnits.map(spRow).filter(spRestricted).every((r) => spWorks(r, team))) return null;
    const rowsOf = (pred: (r: BuffRow) => boolean) => team.flatMap((u) => fx(u.id).filter(pred));
    const atk = best(rowsOf(atkBuff), team);
    const def = best(rowsOf(defBuff), team);
    const heal = (spUnits.length >= 3 ? spUnits.flatMap((u) => fx(u.id).filter(teamHeal))[0] : undefined) ?? best(rowsOf(hpot), team);
    if (!atk || !def || !heal) return null;
    const first = spUnits[0]?.id;
    const have = new Set(["stat|ATK", "stat|DEF"]);
    const members: Member[] = team.map((u) => {
      const role = roles.get(u.id)!;
      const why = role === "sp" ? [spRow(u), ...fx(u.id).filter((r) => teamHeal(r))].filter(Boolean) as BuffRow[]
        : role === "spot" ? [spotRow(u)]
        : role === "healer" ? fx(u.id).filter(hpot)
        : role === "buffer" ? fx(u.id).filter((r) => ((atkBuff(r) || defBuff(r)) && applies(r, team)) || hpot(r))
        : [];
      return { id: u.id, role, why: dedupe(why), extra: [], only: role === "sp" && u.id !== first ? spRow(u) : undefined,
        firstSp: u.id === first || undefined, leader: u.id === leader || undefined };
    });
    // the units that can cast more than one skill: DPS, buffer(s), the Rank EXP leader, the first SP unit
    for (const m of members) {
      if (m.only) continue;
      const extra: BuffRow[] = [];
      for (const r of fx(m.id).filter(isSkill).sort((a, b) => b.v - a.v)) {
        const ally = r.c === "stat" && applies(r, team);
        const foe = r.c === "debuff" && (r.sc === "enemies" || r.sc === "enemy");
        const key = `${r.c}|${r.k}`;
        if ((ally || foe) && !have.has(key)) { have.add(key); extra.push(r); }
      }
      m.extra = extra;
    }
    const order: Role[] = ["sp", "spot", "buffer", "healer", "exp", "dps"];
    members.sort((a, b) => Number(!!b.leader) - Number(!!a.leader) || order.indexOf(a.role) - order.indexOf(b.role) || Number(!!b.firstSp) - Number(!!a.firstSp));
    return { members, atk, def, heal };
  };

  // BP: the member whose leader skill gives the team the most Max HP + DEF, else the most ATK
  const lead = (u: Candidate, keys: string[]) => keys.map((k) => best(fx(u.id).filter(leaderStat(k)), team)).filter(Boolean) as BuffRow[];
  const sum = (l: BuffRow[]) => l.reduce((s, r) => s + r.v, 0);
  const survive = (u: Candidate) => sum(lead(u, ["Max HP", "DEF"]));
  const output = (u: Candidate) => sum(lead(u, ["ATK"]));
  const tough = [...team].sort((a, b) => survive(b) - survive(a) || output(b) - output(a))[0];
  const toughWhy = survive(tough) > 0 ? lead(tough, ["Max HP", "DEF"]) : lead(tough, ["ATK"]);
  // nobody's leader skill helps: the first SP unit leads, as before
  const bpLeader = toughWhy.length ? tough.id : (team.find((u) => roles.get(u.id) === "sp" || roles.get(u.id) === "spot") ?? team[0]).id;
  const bpTeam = make(team, roles, bpLeader)!;
  const bp: Plan = { ...bpTeam, leaderWhy: toughWhy, support: BP_SUPPORT, supportWhy: leaderRows(BP_SUPPORT),
    note: !toughWhy.length ? "No member's leader skill raises the team's Max HP, DEF or ATK."
      : survive(tough) > 0 ? undefined : "No member's leader skill raises the team's Max HP or DEF: the best ATK one leads." };

  // AP: the owned unit with the highest Rank EXP leader skill (a member first on a tie)
  const exp = (u: Candidate) => Math.max(0, ...fx(u.id).filter(expRow).map((r) => r.v));
  const inTeam = (u: Candidate) => team.some((m) => m.id === u.id);
  const expUnits = mine.filter((u) => exp(u) > 0).sort((a, b) => exp(b) - exp(a) || Number(inTeam(b)) - Number(inTeam(a)) || b.atk - a.atk);
  const apBase = { support: AP_SUPPORT, supportWhy: leaderRows(AP_SUPPORT).filter(expRow) };
  let ap: Plan | undefined;
  for (const e of expUnits) {
    const leaderWhy = fx(e.id).filter(expRow);
    if (inTeam(e)) { ap = { ...make(team, roles, e.id)!, leaderWhy, ...apBase }; break; }
    // take the place of the weakest DPS, then of the buffer
    const out = [...team.filter((u) => roles.get(u.id) === "dps").sort((a, b) => a.atk - b.atk), ...team.filter((u) => roles.get(u.id) === "buffer")];
    for (const o of out) {
      const t2 = team.map((u) => (u.id === o.id ? e : u));
      const r2 = new Map(roles); r2.delete(o.id); r2.set(e.id, "exp");
      const made = make(t2, r2, e.id);
      if (made) { ap = { ...made, leaderWhy, ...apBase, replaced: bpTeam.members.find((m) => m.id === o.id) }; break; }
    }
    if (ap) break;
  }
  if (!ap) ap = { ...bpTeam, leaderWhy: bp.leaderWhy, ...apBase,
    note: expUnits.length ? "Your Rank EXP leaders can't join without the team losing its buffs, heal or SP: same leader as the BP team."
      : "None of your units has a Rank EXP leader skill: same leader as the BP team." };
  return { ok: true, ap, bp };
}

/** One row per effect kind: the strongest. */
function dedupe(rows: BuffRow[]) {
  const top = new Map<string, BuffRow>();
  for (const r of rows) { const k = `${r.c}|${r.k}`; const t = top.get(k); if (!t || r.v > t.v) top.set(k, r); }
  return [...top.values()];
}

const compare = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

/** Rules 2-4 for one SP set. Returns the team or why it can't be made. */
function build(set: Candidate[], units: Candidate[], fx: (id: string) => BuffRow[], isSpot = false, restricted: BuffRow[] = []): Built | string {
  const roles = new Map<string, Role>(set.map((u) => [u.id, isSpot ? "spot" : "sp"]));
  const team = [...set];
  // a restricted SP restore only counts with 3 SP units and members it reaches
  if (restricted.length && set.length < 3) return "an element-only SP restore needs a 3-SP team (rule 1).";
  // element/trait-only: every member must fit; "4+ X allies": non-X members only while there's room
  const fits = (u: Candidate) => restricted.every((r) => {
    const c = r.sc === "all" ? teamCond(r) : null;
    if (!c) return fitsSp(r, u);
    return isOf(u, c.of) || team.filter((m) => !isOf(m, c.of)).length + 1 <= TEAM - c.n;
  });
  if (!set.every((u) => restricted.every((r) => r.sc === "all" || fitsSp(r, u)))) return "the SP units' element-only restores don't reach each other (rule 1).";
  // a free (not owned) unit can only fill the buffer slot
  const rest = () => units.filter((u) => !roles.has(u.id) && !u.free && fits(u));
  const all = (u: Candidate) => fx(u.id);
  const healsInSp = !isSpot && set.length >= 3 && set.some((u) => all(u).some(teamHeal));
  // rule 2: fewer than 3 SP units, or none of them heals -> an HP-over-time unit
  let needHeal = !healsInSp;
  const has = (pred: (r: BuffRow) => boolean, members: Candidate[]) => !!best(members.flatMap((u) => all(u).filter(pred)), members);
  // only "All allies" buffs from the SP units count as covered here: an
  // element/trait buff can stop applying once the other members join
  const allAllies = (pred: (r: BuffRow) => boolean) => (r: BuffRow) => pred(r) && r.sc === "all";
  const needAtk = !has(allAllies(atkBuff), team);
  const needDef = !has(allAllies(defBuff), team);

  // rule 3: the buffer. When a heal is still needed and only one free slot
  // would be left for it, the healer requirement wins: try healers first.
  if (needAtk || needDef) {
    const value = (u: Candidate) => {
      const with_ = [...team, u];
      const a = needAtk ? best(all(u).filter(atkBuff), with_) : undefined;
      const d = needDef ? best(all(u).filter(defBuff), with_) : undefined;
      if ((needAtk && !a) || (needDef && !d)) return -1;
      return (a ? rank(a) : 0) + (d ? rank(d) : 0);
    };
    const pool = units.filter((u) => !roles.has(u.id) && fits(u) && value(u) >= 0);
    if (!pool.length) return needAtk && needDef ? "no unit gives both an ATK and a DEF buff to the team (rule 3)." : `no unit gives the team a ${needAtk ? "ATK" : "DEF"} buff (rule 3).`;
    const healers = needHeal ? pool.filter((u) => all(u).some(hpot)) : [];
    const vals = new Map((healers.length ? healers : pool).map((u) => [u, value(u)]));
    const pick = [...vals.keys()].sort((a, b) => vals.get(b)! - vals.get(a)! || Number(!!a.free) - Number(!!b.free) || b.atk - a.atk)[0];
    roles.set(pick.id, "buffer");
    if (healers.length) needHeal = false;
    team.push(pick);
  }
  // rule 2: the healer, the highest-ATK one (it doubles as the DPS when slots are short)
  if (needHeal) {
    const long = (u: Candidate) => Number(all(u).some((r) => hpot(r) && (r.t >= 3 || r.t < 0)));
    const h = rest().filter((u) => all(u).some(hpot)).sort((a, b) => long(b) - long(a) || b.atk - a.atk)[0];
    if (!h) return "no unit has a 20%+/turn team HP over time, which this team needs (rule 2).";
    if (team.length >= TEAM) return "no room for a healer (rule 2).";
    roles.set(h.id, "healer");
    team.push(h);
  }
  if (team.length > TEAM) return "the SP, buff and heal rules need more than 5 units.";
  // rule 4: the rest by ATK, keeping element/trait buffs valid where possible
  while (team.length < TEAM) {
    // only the strongest few by ATK can win; check buff validity for those
    const byAtk = rest().sort((a, b) => b.atk - a.atk);
    let d: Candidate | undefined;
    let dKept = -1;
    for (const u of byAtk) {
      const w = [...team, u];
      const k = Number(has(atkBuff, w)) + Number(has(defBuff, w));
      if (k > dKept) { d = u; dKept = k; }
      if (k === 2) break;
    }
    if (!d) return "fewer than 5 units in the box.";
    roles.set(d.id, "dps");
    team.push(d);
  }
  const rowsOf = (pred: (r: BuffRow) => boolean) => team.flatMap((u) => all(u).filter(pred));
  const atk = best(rowsOf(atkBuff), team);
  const def = best(rowsOf(defBuff), team);
  const heal = healsInSp ? set.flatMap((u) => all(u).filter(teamHeal))[0] : best(rowsOf(hpot), team);
  if (!atk || !def) return "the team's ATK/DEF buffs don't apply to every member (rule 3).";
  if (!restricted.every((r) => spWorks(r, team))) return "not enough members of the right element/trait for the SP units' restores (rule 1).";
  if (!heal) return "no whole-team heal (rule 2).";
  const dpsAtk = team.filter((u) => roles.get(u.id) === "dps").reduce((s, u) => s + u.atk, 0);
  const spSum = set.reduce((s, u) => s + Math.max(0, ...all(u).filter(isSpot ? spot : anySp).map(isSpot ? rank : spValue)), 0);
  // prefer: heal from an SP unit, longer then stronger buffs, stronger DPS, more SP
  return { team, roles, atk, def, heal, score: [Number(healsInSp), rank(atk) + rank(def), dpsAtk, spSum] };
}
