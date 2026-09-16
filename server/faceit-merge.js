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
 * Assign each map's hero bans to teams, preferring FACEIT's own attribution
 * and guessing only where it's missing, then layer producer corrections on
 * top. Three tiers, weakest to strongest:
 *
 *   1. HEURISTIC (legacy, now the last-resort fallback): map 1 → team1 picks,
 *      later maps → loser of the previous map picks; the picker is assumed to
 *      have made ban1. ban1 is merely the first banned hero in ENTITY order,
 *      which is NOT chronological — this is roughly a coin flip. It was ALL
 *      we had for a season.
 *   2. API attribution (`bans.api`, from the democracy veto history — see
 *      parseVetoHistory/buildApiAttribution in faceit.js): real picker and
 *      real per-team bans. When only the picker survived (disrupted veto),
 *      it still seeds the ban heuristic. `api` stays on the entry so the
 *      dashboard can show attribution as confirmed rather than guessed.
 *   3. Producer corrections (mapPickers/banSwaps arrays keyed by map index,
 *      kept in state so they survive every auto-sync tick): a human watching
 *      the broadcast outranks everything, including the API.
 */
export function buildPerMapBans(rawBans, maps, banSwaps = [], mapPickers = []) {
  // Tier 1 is a LAST-RESORT GUESS, not a rule: ban1/ban2 are voting.heroes
  // ENTITY order, which is not chronological (see getMatchDetails in
  // faceit.js — Track Hunters vs ELMT Stellar disproved the old "validated
  // across 14+ maps" claim, and the guess disagreed with the veto history on
  // every one of a dozen real maps checked). It is kept only because showing
  // SOME sides beats showing none; the dashboard flags every map it touches.
  return (rawBans || []).map((bans, i) => {
    const api = bans.api || null;
    let picker = api?.picker || 'team1';
    if (!api?.picker && i > 0) {
      const prevWinner = maps[i - 1]?.winner;
      if (prevWinner) picker = prevWinner === 'team1' ? 'team2' : 'team1';
    }
    if (mapPickers[i]) picker = mapPickers[i] === 'none' ? null : mapPickers[i];

    let team1Ban, team2Ban;
    if (api?.team1Ban || api?.team2Ban) {
      team1Ban = api.team1Ban || null;
      team2Ban = api.team2Ban || null;
      // ONE side confirmed but the Data API already shows both bans (history
      // lagging on the second drop, or a one-sided confirmation carried through
      // a failed fetch — see carryForwardApiAttribution): each team bans one
      // hero, so the other slot is the remaining hero, by elimination. Filled
      // only when exactly one raw hero differs from the confirmed one, so this
      // can never show the same hero on both teams or move the confirmed hero.
      // Leaving it null would blank a real ban on air at the reveal.
      if (!team1Ban || !team2Ban) {
        const confirmedName = (team1Ban || team2Ban).name;
        const others = [bans.ban1, bans.ban2].filter(h => h && h.name !== confirmedName);
        if (others.length === 1) {
          if (!team1Ban) team1Ban = others[0];
          else team2Ban = others[0];
        }
      }
    } else {
      // No (trustworthy) API bans: assume ban1 belongs to the map picker.
      // The dashboard's Hero Bans card warns about this and offers ⇄ Bans.
      const banPicker = picker || 'team1';
      team1Ban = banPicker === 'team1' ? bans.ban1 : bans.ban2;
      team2Ban = banPicker === 'team2' ? bans.ban1 : bans.ban2;
    }
    const entry = { ...bans, picker, team1Ban, team2Ban };
    return banSwaps[i]
      ? { ...entry, team1Ban: entry.team2Ban, team2Ban: entry.team1Ban }
      : entry;
  });
}

/** Hero names in a ban-bearing entry's ban1/ban2, as a sorted list (the pair is
 *  unordered — entity order means nothing, see buildPerMapBans). */
function banNameSet(entry) {
  return [entry?.ban1, entry?.ban2]
    .filter(Boolean)
    .map(h => String(h.name))
    .sort();
}

/**
 * Keep FACEIT-CONFIRMED ban attribution through a sync where the veto history
 * didn't deliver it. Runs on the RAW getMatchDetails perMapBans, before
 * buildPerMapBans, so producer corrections (banSwaps/mapPickers) still layer on
 * top exactly as before. Pure; returns a new array (entries it doesn't touch are
 * passed through as-is).
 *
 * PRODUCER BUG (v2.2.0, live, Track Hunters vs ELMT Stellar): map 2's bans were
 * shown on the wrong teams on every overlay because a sync came back without
 * veto-history attribution and buildPerMapBans silently fell back to its guess.
 * The history endpoint is undocumented and sits behind Cloudflare; a single
 * failed 15s tick used to DOWNGRADE an already-confirmed map to the guess —
 * swapping every screen mid-broadcast — and the next good tick swapped it back.
 * Who banned what can't change unless the bans themselves change, so a
 * confirmation, once seen, is carried until FACEIT says something different.
 *
 * `prev` is `{ matchId, perMapBans }` from state; its perMapBans are
 * buildPerMapBans OUTPUT, whose `api` is the untouched raw attribution (banSwaps
 * only swap team1Ban/team2Ban), so carrying it and re-running buildPerMapBans is
 * exact. Per map i, with fresh = rawBans[i] and old = prev.perMapBans[i]:
 *
 *   - Nothing carries unless prev.matchId === matchId (never across matches;
 *     the fresh match-load path doesn't call this at all).
 *   - BANS (team1Ban/team2Ban, as a pair): carried from old.api when the
 *     fresh api has no bans of its own, old.api had some, and the map's banned
 *     heroes are the SAME non-empty set (ban1/ban2 names, order-insensitive —
 *     they come from the Data API, independently of the history endpoint). A
 *     changed set means a genuinely different veto (reset, redo) and the stale
 *     sides must not mask it. Fresh bans always win.
 *   - ONE-SIDED bans (old.api confirmed exactly one team's ban, e.g. Stellar →
 *     Mei while D.Mon wasn't banned yet): the second ban landing grows the set
 *     {Mei} → {Mei, D.Mon}, which is exactly the reveal moment a failed fetch
 *     would otherwise hand to the guess — possibly putting Mei on the wrong
 *     team. So when old's raw set is a STRICT subset of fresh's and the
 *     confirmed hero is still banned, that one side is carried; the other slot
 *     is left null here and filled by elimination in buildPerMapBans (never
 *     the confirmed hero, never a second copy of it).
 *   - PICKER: carried from old.api when the fresh api has none, and old's ban
 *     set is a SUBSET of fresh's. The map is picked before its bans, so bans
 *     arriving (none → one → two) don't invalidate a confirmed picker, but a
 *     ban vanishing or changing hero means the veto was redone.
 *   - Partial results merge field-wise under those rules (e.g. a fresh api with
 *     only a picker — a drop not yet attributed — keeps old's confirmed bans).
 *     A map left with no picker and no bans gets no `api`, as buildApiAttribution
 *     would produce.
 */
export function carryForwardApiAttribution(rawBans, prev, matchId) {
  const fresh = rawBans || [];
  if (!prev || !matchId || prev.matchId !== matchId) return fresh;
  const oldList = Array.isArray(prev.perMapBans) ? prev.perMapBans : [];
  return fresh.map((entry, i) => {
    const oldApi = oldList[i]?.api;
    if (!entry || !oldApi) return entry;
    const freshApi = entry.api || null;
    const freshSet = banNameSet(entry);
    const oldSet = banNameSet(oldList[i]);

    let picker = freshApi?.picker || null;
    if (!picker && oldApi.picker && oldSet.every(n => freshSet.includes(n))) {
      picker = oldApi.picker;
    }

    let team1Ban = freshApi?.team1Ban || null;
    let team2Ban = freshApi?.team2Ban || null;
    const sameSet = freshSet.length > 0
      && freshSet.length === oldSet.length
      && freshSet.every((n, k) => n === oldSet[k]);
    if (!team1Ban && !team2Ban && (oldApi.team1Ban || oldApi.team2Ban)) {
      const oneSided = !oldApi.team1Ban !== !oldApi.team2Ban;
      const confirmedName = String((oldApi.team1Ban || oldApi.team2Ban).name);
      const grewFrom = oldSet.length < freshSet.length && oldSet.every(n => freshSet.includes(n));
      if (sameSet || (oneSided && grewFrom && freshSet.includes(confirmedName))) {
        team1Ban = oldApi.team1Ban || null;
        team2Ban = oldApi.team2Ban || null;
      }
    }

    if (!picker && !team1Ban && !team2Ban) return entry;
    const unchanged = freshApi
      && picker === (freshApi.picker || null)
      && team1Ban === (freshApi.team1Ban || null)
      && team2Ban === (freshApi.team2Ban || null);
    return unchanged ? entry : { ...entry, api: { picker, team1Ban, team2Ban } };
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

/**
 * May FACEIT write into state right now? The ONE rule every FACEIT writer
 * (poll tick, poll start, boot resume, /api/faceit/refresh) must consult.
 *
 * Producer report, third time round ("map picks and bans keep resetting in
 * manual mode"): the auto-sync tick only ever checked faceitMatchId. Switching
 * the dashboard to Manual/Scrim left the previously loaded match id — and the
 * running 15s poll — untouched, and the FACEIT card (with its Auto Sync
 * indicator) is hidden outside FACEIT mode, so the poll kept overwriting
 * maps / perMapBans / heroBans / players / team names with FACEIT's (often
 * still-empty, pre-veto) data with nothing on screen to explain it. Manual
 * mode deliberately takes NO overrides — the dashboard's setOverride calls
 * are all gated on mode === 'faceit' — so merge-side override fixes could
 * never cover it. The only sound rule: FACEIT writes in FACEIT mode only.
 */
export function faceitSyncAllowed(state) {
  const mode = state && state.mode;
  if (mode !== 'faceit') return { allowed: false, reason: `mode is ${mode || 'unset'}, not faceit` };
  if (!state.faceitMatchId) return { allowed: false, reason: 'no match loaded' };
  return { allowed: true };
}

/**
 * After an AWAITED FACEIT fetch, may its result still be written? Only if the
 * match it was fetched for is still the loaded one. A 15s poll (or refresh)
 * for match A can be in flight when the producer loads match B; A's result
 * used to land in B's state (maps, bans, players, team names) until B's own
 * next tick. With carryForwardApiAttribution that race could also turn sticky:
 * A's confirmed ban sides in B's state, then carried by B's failing history.
 */
export function faceitSyncStillCurrent(state, fetchedMatchId) {
  return !!fetchedMatchId && !!state && state.faceitMatchId === fetchedMatchId;
}
