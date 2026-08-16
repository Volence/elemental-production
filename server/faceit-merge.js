// Pure merge logic for the FACEIT auto-sync tick. Kept out of server.js so it
// can be unit-tested: these rules are exactly what protects producer
// corrections from being clobbered on-air every 15 seconds.

// Same normalizer the map art resolver uses ("King’s Row"/"King's Row" ->
// "kings-row", "Paraíso" -> "paraiso"), so map-name EQUALITY means the same
// thing on both sides of the server. Imported rather than re-implemented —
// this file used to carry its own fourth copy of the fold.
import { normalizeMapName } from './map-image-resolver.js';

/**
 * Team fields for setState(). Omitting a field = "leave state as-is"
 * (setState deep-merges), which is how overrides are honored.
 * Colors are NEVER sourced from FACEIT — always preserve current state.
 */
export function buildTeamsUpdate({ currentTeams, faction1, faction2, score1, score2, isOverridden }) {
  const t1 = { faceitId: faction1.id, color: currentTeams?.team1?.color || '#3b82f6' };
  if (!isOverridden('teams.team1.name')) t1.name = faction1.name;
  if (!isOverridden('teams.team1.logo')) t1.logo = faction1.avatar;
  if (!isOverridden('teams.team1.score')) t1.score = score1;

  const t2 = { faceitId: faction2.id, color: currentTeams?.team2?.color || '#ef4444' };
  if (!isOverridden('teams.team2.name')) t2.name = faction2.name;
  if (!isOverridden('teams.team2.logo')) t2.logo = faction2.avatar;
  if (!isOverridden('teams.team2.score')) t2.score = score2;

  return { team1: t1, team2: t2 };
}

/** normalizeMapName over anything state might hold in `name` (undefined, a
 *  number from a hand-edited state.json) without throwing on .normalize. */
function mapNameKey(name) {
  return normalizeMapName(name == null ? '' : String(name));
}

/**
 * Maps list for setState(). When the producer has taken the `maps` override
 * (addMap/removeMap), their list is authoritative: keep names/modes/images and
 * extra maps, but still let FACEIT advance per-index progress fields.
 * `faceitMaps` is already forward-only merged vs current state by the caller.
 *
 * REGRESSION (v2.1.0, producer report — BO7 late pick vanished): the overridden
 * branch used to map ONLY over currentMaps, so any map FACEIT revealed LATER
 * (index >= currentMaps.length — e.g. a Bo7's 6th/7th pick, made long after the
 * producer touched the map list and took the 🔒) was dropped on every poll tick
 * and never reached state.maps. Downstream that read as "the board did nothing":
 * map-pool grayed the card (no series entry, but its mode column already taken
 * by an earlier map of the same mode) and map-pick showed an empty column. The
 * override protects the producer's EDITS; it can't sensibly mean "never learn
 * about a map that didn't exist yet", so unseen tail entries are appended.
 *
 * REMOVAL is undecidable from currentMaps alone, which is why `removedMapKeys`
 * exists (state.removedMapKeys, written by MatchHub's removeMap — same
 * producer-correction pattern as banSwaps/mapPickers). The in-list name guard
 * below is DEDUP ONLY: it can tell "already present", never "deliberately
 * gone". A map deleted off the END of the list is past merged.length AND
 * absent from `known`, so without the record the tail loop re-appended it on
 * every 15s tick — and removeMap takes the maps 🔒, so the ping-pong never
 * ended. Keys are normalizeMapName(name); MatchHub writes them with a copy of
 * that exact algorithm.
 *
 * KNOWN LIMITATION (pre-existing, not fixed here): the merge is INDEX-aligned,
 * so FACEIT's progress fields (status/winner/roundScore — and, at the call
 * site, the FACEIT-indexed perMapBans/playerStats) are misattributed once the
 * producer removes a map from the MIDDLE of the list: every later map reads
 * the previous slot's progress. The same misalignment reaches appended tail
 * entries, whose perMapBans live at their FACEIT index rather than the merged
 * one. Trigger: a mid-list add/remove while FACEIT is still reporting. A
 * name-based (rather than positional) merge is the real fix — future hygiene.
 */
export function buildMapsUpdate({ currentMaps, faceitMaps, perMapBans, mapsOverridden, removedMapKeys }) {
  if (!mapsOverridden) {
    return faceitMaps.map((m, i) => ({ ...m, picker: perMapBans[i]?.picker || null }));
  }
  const merged = (currentMaps || []).map((m, i) => {
    const f = faceitMaps[i];
    if (!f) return m;
    return {
      ...m,
      status: f.status,
      winner: f.winner != null ? f.winner : m.winner,
      roundScore: f.roundScore || m.roundScore || null,
      picker: m.picker || perMapBans[i]?.picker || null,
    };
  });
  const known = new Set(merged.map(m => mapNameKey(m && m.name)));
  const removed = new Set((removedMapKeys || []).map(k => mapNameKey(k)));
  for (let i = merged.length; i < (faceitMaps || []).length; i++) {
    const f = faceitMaps[i];
    if (!f) continue;
    const k = mapNameKey(f.name);
    if (known.has(k) || removed.has(k)) continue;
    known.add(k);
    merged.push({ ...f, picker: perMapBans[i]?.picker || null });
  }
  return merged;
}

/**
 * Series score = maps won. Scores are STORED in state, not derived, so every
 * writer recomputes them here from the maps that actually land in state —
 * never from the FACEIT-index list, whose length stops at details.pickedMaps
 * and would drop a producer-appended decider's winner.
 */
export function deriveScores(maps) {
  const list = Array.isArray(maps) ? maps : [];
  return {
    team1: list.filter(m => m && m.winner === 'team1').length,
    team2: list.filter(m => m && m.winner === 'team2').length,
  };
}

/**
 * Which map's bans should populate heroBans (what the overlays display):
 *   1. producer-selected map (explicit override), else
 *   2. the live ('current') map, else
 *   3. the next 'upcoming' map — but ONLY if its bans are actually revealed
 *      yet (the map-intro / Ban Reveal window between maps), else
 *   4. the LAST PLAYED (completed) map — so a finished series still exposes
 *      its final map's bans.
 *
 * Step 3's bans-revealed guard is the fix for the owner-reported bug: a series
 * decided early (e.g. 3-0 in a Bo5) leaves trailing 'upcoming' maps that were
 * never played and carry no bans. The old "first upcoming, unconditionally"
 * rule resolved to one of those phantom maps and returned EMPTY heroBans; now
 * those fall through to the last completed map instead.
 */
export function getActiveBanIdx(maps, selectedMapIdx = -1, perMapBans = []) {
  maps = maps || [];
  if (Number.isInteger(selectedMapIdx) && selectedMapIdx >= 0 && selectedMapIdx < maps.length) {
    return selectedMapIdx;
  }
  // LAST current, matching findCurrentMapIndex/normalizeSingleCurrent: if bad
  // state ever carries two live maps, server and overlays must pick the same one.
  const currentIdx = maps.reduce((acc, m, i) => (m && m.status === 'current' ? i : acc), -1);
  if (currentIdx >= 0) return currentIdx;
  const hasBans = (b) => !!b && (b.team1Ban || b.team2Ban);
  const upcomingIdx = maps.findIndex(m => m.status === 'upcoming');
  if (upcomingIdx >= 0 && hasBans(perMapBans[upcomingIdx])) return upcomingIdx;
  for (let i = maps.length - 1; i >= 0; i--) {
    if (maps[i].status === 'completed') return i;
  }
  return maps.length - 1;
}

// FACEIT uses names like "DVa", "Lucio", "Soldier 76", "Torbjorn"
// Dashboard keys are lowercase: "dva", "lucio", "soldier-76", "torbjorn"
const FACEIT_HERO_KEY_OVERRIDES = {
  'DVa': 'dva',
  'Lucio': 'lucio',
  'Soldier 76': 'soldier-76',
  'Torbjorn': 'torbjorn',
};
export function heroNameToKey(name) {
  if (!name) return '';
  if (FACEIT_HERO_KEY_OVERRIDES[name]) return FACEIT_HERO_KEY_OVERRIDES[name];
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, '-').replace(/[.']/g, '');
}

/**
 * DERIVE the active-ban view — BOTH the resolved map index and the heroBans
 * ({team1:[key],team2:[key]}) — from (perMapBans, maps, selectedMapIdx). Single
 * source of truth: every producer/sync path funnels through this so the map
 * index (which map's bans are "active"), heroBans (HUD wings + Ban Reveal), and
 * perMapBans (scoreboard) can never drift apart. `idx` is getActiveBanIdx's
 * answer (-1 when there's no resolvable map) — exposed as derived state so the
 * overlays can label the active map without re-deriving the resolver client-side.
 */
export function computeActiveBan(perMapBans, maps, selectedMapIdx = -1) {
  perMapBans = perMapBans || [];
  const idx = getActiveBanIdx(maps, selectedMapIdx, perMapBans);
  const activeBans = idx >= 0 ? perMapBans[idx] : null;
  return {
    idx,
    heroBans: {
      team1: activeBans?.team1Ban ? [heroNameToKey(activeBans.team1Ban.name)] : [],
      team2: activeBans?.team2Ban ? [heroNameToKey(activeBans.team2Ban.name)] : [],
    },
  };
}

/** heroBans-only convenience wrapper over computeActiveBan (same single derive). */
export function computeHeroBans(perMapBans, maps, selectedMapIdx = -1) {
  return computeActiveBan(perMapBans, maps, selectedMapIdx).heroBans;
}

function sameHeroBans(a, b) {
  const arrEq = (x = [], y = []) => x.length === y.length && x.every((v, i) => v === y[i]);
  return arrEq(a?.team1, b?.team1) && arrEq(a?.team2, b?.team2);
}

/**
 * DERIVED-CONSISTENCY reconcile for the active-ban view against a *fully-merged*
 * state object. Returns a partial update ({heroBans?, activeBanMapIdx}) to write,
 * or null to leave state untouched (producer holds the heroBans override, or the
 * derived view already matches). Used at server boot (persisted state may carry
 * stale/empty heroBans + no activeBanMapIdx while perMapBans is populated) and
 * after any PATCH that touches maps/perMapBans/selectedMapIdx/banSwaps.
 *
 * activeBanMapIdx is COUPLED to the heroBans override on purpose: heroBans and
 * the index it was resolved from are one fact. If a producer pins heroBans
 * manually, freezing the index too keeps the overlay's "MAP n" label matching
 * the pinned bans instead of silently tracking a different map. So the same
 * isOverridden('heroBans') gate freezes both.
 */
export function deriveActiveBanState(state, isOverridden) {
  if (isOverridden && isOverridden('heroBans')) return null;
  const { idx, heroBans } = computeActiveBan(state.perMapBans, state.maps, state.selectedMapIdx);
  const curIdx = Number.isInteger(state.activeBanMapIdx) ? state.activeBanMapIdx : -1;
  const bansChanged = !sameHeroBans(heroBans, state.heroBans);
  const idxChanged = idx !== curIdx;
  if (!bansChanged && !idxChanged) return null;
  const update = { activeBanMapIdx: idx };
  if (bansChanged) update.heroBans = heroBans;
  return update;
}
