// Pure merge logic for the FACEIT auto-sync tick. Kept out of server.js so it
// can be unit-tested: these rules are exactly what protects producer
// corrections from being clobbered on-air every 15 seconds.

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

/**
 * Maps list for setState(). When the producer has taken the `maps` override
 * (addMap/removeMap), their list is authoritative: keep names/modes/images and
 * extra maps, but still let FACEIT advance per-index progress fields.
 * `faceitMaps` is already forward-only merged vs current state by the caller.
 */
export function buildMapsUpdate({ currentMaps, faceitMaps, perMapBans, mapsOverridden }) {
  if (!mapsOverridden) {
    return faceitMaps.map((m, i) => ({ ...m, picker: perMapBans[i]?.picker || null }));
  }
  return (currentMaps || []).map((m, i) => {
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
  const currentIdx = maps.findIndex(m => m.status === 'current');
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
 * DERIVE heroBans (the {team1:[key],team2:[key]} the HUD wings + Ban Reveal read)
 * from (perMapBans, maps, selectedMapIdx). This is the single source of truth for
 * heroBans — every producer/sync path funnels through it so heroBans can never
 * drift out of sync with perMapBans (which the scoreboard reads directly).
 */
export function computeHeroBans(perMapBans, maps, selectedMapIdx = -1) {
  perMapBans = perMapBans || [];
  const idx = getActiveBanIdx(maps, selectedMapIdx, perMapBans);
  const activeBans = idx >= 0 ? perMapBans[idx] : null;
  return {
    team1: activeBans?.team1Ban ? [heroNameToKey(activeBans.team1Ban.name)] : [],
    team2: activeBans?.team2Ban ? [heroNameToKey(activeBans.team2Ban.name)] : [],
  };
}

function sameHeroBans(a, b) {
  const arrEq = (x = [], y = []) => x.length === y.length && x.every((v, i) => v === y[i]);
  return arrEq(a?.team1, b?.team1) && arrEq(a?.team2, b?.team2);
}

/**
 * DERIVED-CONSISTENCY reconcile for heroBans against a *fully-merged* state
 * object. Returns a fresh heroBans to write, or null to leave state untouched
 * (either the producer holds the heroBans override, or the derived value already
 * matches). Used at server boot (persisted state may carry stale/empty heroBans
 * while perMapBans is populated) and after any PATCH that touches
 * maps/perMapBans/selectedMapIdx/banSwaps. Mirrors the sync paths' override gate
 * exactly — never clobbers a producer heroBans override.
 */
export function deriveHeroBansUpdate(state, isOverridden) {
  if (isOverridden && isOverridden('heroBans')) return null;
  const next = computeHeroBans(state.perMapBans, state.maps, state.selectedMapIdx);
  if (sameHeroBans(next, state.heroBans)) return null;
  return next;
}
