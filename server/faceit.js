import { normalizeMapName } from './map-image-resolver.js';

const DATA_API_BASE = 'https://open.faceit.com/data/v4';
const TEAM_LEAGUES_BASE = 'https://www.faceit.com/api/team-leagues/v2';
const INTERNAL_API_BASE = 'https://api.faceit.com';
// api.faceit.com sits behind Cloudflare bot protection that blocks default
// non-browser UAs (curl/node-fetch get a challenge page). A desktop UA passes.
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

let apiKey = '';

/**
 * FACEIT speaks a slightly different OW2 map vocabulary than the rest of this
 * app. Everything else — /api/maps (OverFast), Settings' Season Map Pool,
 * data/map-images/'s filenames, map-music.js, flythroughs.js, MatchHub's manual
 * pool — is keyed on the OverFast display name. FACEIT's voting entities are
 * keyed on Blizzard's internal name, and across the whole 32-map OW2 entity list
 * exactly ONE differs after normalizeMapName folding:
 *
 *   FACEIT "Antarctica"  vs  catalog "Antarctic Peninsula"
 *
 * (Everything else folds clean: "Watchpoint Gibraltar" -> "Watchpoint:
 * Gibraltar", "Paraiso" -> "Paraíso", "King's Row" apostrophes, etc.)
 *
 * PRODUCER BUG (v2.1.0, S9 SA Master Central playoffs Bo7, ELMT x Team Missing
 * vs Agave Garfo): map 6 was Antarctic Peninsula, picked mid-series. It DID
 * reach state.maps — FACEIT's voting.map.pick carried all six picks — but under
 * the name "Antarctica". The Map Pool board cross-references its pool cards to
 * state.maps BY NORMALIZED NAME (seriesIndex), so the "Antarctic Peninsula"
 * card found no series entry, and since Ilios had already claimed the Control
 * column it rendered as an out-of-contention sibling: fully grayed, no badge.
 * The map art, map music and flythrough lookups missed for the same reason.
 *
 * Folding at THIS boundary (the only place FACEIT map names enter the system)
 * fixes every downstream consumer at once, and keeps the alias list one line
 * long instead of one copy per overlay. Keys are normalizeMapName() output, so
 * the table is insensitive to FACEIT's own punctuation/casing drift.
 *
 * NOTE "Ecopoint: Antarctica" is a DIFFERENT (arcade/elimination) map and folds
 * to "ecopoint-antarctica", so it can never collide with this entry.
 */
const FACEIT_MAP_NAME_ALIASES = {
  'antarctica': 'Antarctic Peninsula',
};

/** FACEIT map name -> the catalog display name the rest of the app uses. */
export function canonicalMapName(name) {
  if (!name) return name;
  return FACEIT_MAP_NAME_ALIASES[normalizeMapName(String(name))] || name;
}

/**
 * FACEIT's internal OW2 map ids (`voting.map.entities[].game_map_id`, and the
 * SAME vocabulary as each stats round's `round_stats.Map`) -> canonical name and
 * mode. Harvested from the live Data API across several matches; the full pool
 * is 32 maps.
 *
 * This is a FALLBACK, never the primary source: `voting.map.entities` is always
 * preferred when it carries the id. It exists because a match's entity list is
 * the VETO pool, not the game's pool — competitions routinely ship a reduced one
 * (the producers' Bo7 above had 13 entities, not 32). A pick id outside that
 * reduced list used to fall through to `{ id, name: id }`, putting the raw
 * 18-character hex string into `state.maps[n].name`, which then failed every
 * name match in the app (board, art, music, flythrough) AND rendered as
 * "0X0800000000000CF2" on air. Resolving the id here means such a pick still
 * gets a real name; a genuinely unknown id at least gets a short, obviously
 * placeholder label rather than the hex blob.
 */
export const FACEIT_MAP_IDS = {
  '0x0800000000001157': { name: 'Hanaoka', mode: 'Clash' },
  '0x0800000000001160': { name: 'Throne of Anubis', mode: 'Clash' },
  '0x0800000000000CF2': { name: 'Antarctic Peninsula', mode: 'Control' },
  '0x08000000000007E2': { name: 'Busan', mode: 'Control' },
  '0x080000000000066D': { name: 'Ilios', mode: 'Control' },
  '0x0800000000000662': { name: 'Lijiang Tower', mode: 'Control' },
  '0x08000000000004B7': { name: 'Nepal', mode: 'Control' },
  '0x080000000000069E': { name: 'Oasis', mode: 'Control' },
  '0x0800000000000EC0': { name: 'Samoa', mode: 'Control' },
  '0x0800000000000827': { name: 'Circuit Royal', mode: 'Escort' },
  '0x08000000000002C3': { name: 'Dorado', mode: 'Escort' },
  '0x0800000000000A44': { name: 'Havana', mode: 'Escort' },
  '0x0800000000000756': { name: 'Junkertown', mode: 'Escort' },
  '0x0800000000000871': { name: 'Rialto', mode: 'Escort' },
  '0x08000000000005BB': { name: 'Route 66', mode: 'Escort' },
  '0x0800000000000C85': { name: 'Shambali Monastery', mode: 'Escort' },
  '0x0800000000000184': { name: 'Watchpoint Gibraltar', mode: 'Escort' },
  '0x0800000000000F35': { name: 'Aatlis', mode: 'Flashpoint' },
  '0x0800000000000E13': { name: 'New Junk City', mode: 'Flashpoint' },
  '0x0800000000000D3E': { name: 'Suravasa', mode: 'Flashpoint' },
  '0x080000000000075E': { name: 'Blizzard World', mode: 'Hybrid' },
  '0x080000000000068D': { name: 'Eichenwalde', mode: 'Hybrid' },
  '0x08000000000002AF': { name: 'Hollywood', mode: 'Hybrid' },
  '0x08000000000000D4': { name: "King's Row", mode: 'Hybrid' },
  '0x0800000000000B4C': { name: 'Midtown', mode: 'Hybrid' },
  '0x080000000000102C': { name: 'Neon Junction', mode: 'Hybrid' },
  '0x08000000000001D4': { name: 'Numbani', mode: 'Hybrid' },
  '0x0800000000000938': { name: 'Paraiso', mode: 'Hybrid' },
  '0x0800000000000B34': { name: 'Colosseo', mode: 'Push' },
  '0x0800000000000D53': { name: 'Esperança', mode: 'Push' },
  '0x0800000000000AEB': { name: 'New Queen Street', mode: 'Push' },
  '0x0800000000000EB2': { name: 'Runasapi', mode: 'Push' },
};
// Case-insensitive id lookup — FACEIT has shipped both "0x...CF2" and lowercase
// variants of these ids across endpoints.
const FACEIT_MAP_IDS_BY_KEY = new Map(
  Object.entries(FACEIT_MAP_IDS).map(([id, v]) => [id.toLowerCase(), v])
);

/**
 * Resolve a FACEIT map id to `{ id, name, mode }`, preferring this match's own
 * voting entities, then the static id table, then a readable placeholder.
 * NEVER returns a raw hex id as the display name — a map we can't identify must
 * still render as something a producer can see and correct.
 */
export function resolveMapId(id, entities) {
  // Case-insensitive: FACEIT has shipped both upper and lowercase hex variants
  // of these ids across endpoints (same reason the table lookup lowercases).
  const idKey = String(id).toLowerCase();
  const fromEntities = (entities || []).find(m => m && String(m.id).toLowerCase() === idKey);
  if (fromEntities) return fromEntities;
  const known = FACEIT_MAP_IDS_BY_KEY.get(String(id).toLowerCase());
  if (known) return { id, name: known.name, mode: known.mode };
  // Last resort: short, obviously-a-placeholder label. The full hex is kept on
  // `id` so a producer (or a bug report) can still trace it back.
  return { id, name: `Map ${String(id).slice(-4).toUpperCase()}`, mode: 'Unknown' };
}

/**
 * The `voting.map` payload -> `{ mapPool, pickedMaps }`, both carrying catalog
 * names. Pure and exported so the entity/alias/fallback rules above are
 * unit-testable without hitting the network.
 */
export function buildPickedMaps(mapVoting) {
  const mapPool = ((mapVoting && mapVoting.entities) || []).map(m => ({
    id: m.game_map_id || m.guid,
    name: canonicalMapName(m.name),
    mode: (m.filters?.voting_tags?.[0] || '').replace('cat:', ''),
    imageLg: m.image_lg,
    imageSm: m.image_sm,
  }));
  const pickedMaps = ((mapVoting && mapVoting.pick) || []).map(id => resolveMapId(id, mapPool));
  return { mapPool, pickedMaps };
}

/**
 * Democracy history tickets -> per-game veto facts. Input is
 * `payload.tickets` from api.faceit.com/democracy/v1/match/{id}/history —
 * the ONLY place FACEIT durably reports WHO picked each map and WHO banned
 * each hero (`selected_by`); the Data API's voting object never carries
 * attribution, which is why buildPerMapBans had to guess for a season.
 *
 * Tickets arrive as per-game (map, attacking_first, heroes) triplets in game
 * order. Rather than trusting the triplet interleave, same-type tickets are
 * paired by index: the i-th heroes ticket is game i's bans, and map PICK
 * entities flattened across map tickets in order give game i's picker (this
 * also survives a single map ticket carrying the whole series' picks).
 * Unplayed trailing games (a Bo5 ending 3-1 still ships 5 empty-ish triplets)
 * are trimmed; a disrupted middle game stays, as `{mapPickedBy, bans: []}`.
 */
export function parseVetoHistory(tickets) {
  if (!Array.isArray(tickets)) return [];
  const mapPicks = [];
  const heroGames = [];
  for (const t of tickets) {
    const entities = Array.isArray(t?.entities) ? t.entities : [];
    if (t?.entity_type === 'map') {
      for (const e of entities) {
        if (e?.status === 'pick') mapPicks.push(e.selected_by || null);
      }
    } else if (t?.entity_type === 'heroes') {
      const drops = entities.filter(e => e?.status === 'drop');
      // `round` is chronological when FACEIT sets it; a stable sort keeps
      // entity order for the (common) all-round-0 tickets.
      drops.sort((a, b) => (a.round || 0) - (b.round || 0));
      heroGames.push(drops.map(e => ({ heroId: e.guid, faction: e.selected_by || null })));
    }
  }
  const games = [];
  for (let i = 0; i < Math.max(mapPicks.length, heroGames.length); i++) {
    games.push({ mapPickedBy: mapPicks[i] || null, bans: heroGames[i] || [] });
  }
  while (games.length && !games[games.length - 1].mapPickedBy && !games[games.length - 1].bans.length) {
    games.pop();
  }
  return games;
}

/**
 * Per-game veto facts -> the app's team vocabulary (faction1 = team1, the
 * same equivalence buildTeamsUpdate and the poll tick already rely on).
 * Returns one `{ picker, team1Ban, team2Ban } | null` per game:
 *   - picker: which team picked the map (null when FACEIT didn't say)
 *   - teamNBan: resolved hero object, via the same heroMap getMatchDetails
 *     builds from voting.heroes.entities (guids are one vocabulary)
 * Any unattributed drop poisons that game's BAN attribution (halves can't be
 * trusted — the other ban is then ambiguous), but the picker survives. A game
 * with no facts at all collapses to null so callers can fall back wholesale.
 */
export function buildApiAttribution(vetoGames, heroMap) {
  return (vetoGames || []).map(game => {
    const picker = game.mapPickedBy === 'faction1' ? 'team1'
      : game.mapPickedBy === 'faction2' ? 'team2' : null;
    const attributed = (game.bans || []).every(b => b.faction);
    let team1Ban = null;
    let team2Ban = null;
    if (attributed) {
      const resolve = (id) => heroMap?.[id] || { name: id, role: 'Unknown', image: '' };
      for (const b of game.bans || []) {
        if (b.faction === 'faction1' && !team1Ban) team1Ban = resolve(b.heroId);
        if (b.faction === 'faction2' && !team2Ban) team2Ban = resolve(b.heroId);
      }
    }
    if (!picker && !team1Ban && !team2Ban) return null;
    return { picker, team1Ban, team2Ban };
  });
}

/**
 * Fetch the durable veto history for a match — WHO picked each map and WHO
 * banned each hero, which the Data API never reports. UNDOCUMENTED internal
 * endpoint (no auth): the same one FACEIT's own match room UI replays vetos
 * from, and unlike `democracy/v1/match/{id}` (no /history) it survives match
 * finish instead of 404ing. Because it's unofficial, EVERY failure — HTTP
 * error, Cloudflare challenge, shape drift, network — collapses to null so
 * callers fall back to the picker heuristic instead of breaking the import.
 */
export async function getVetoHistory(matchId) {
  try {
    const res = await fetch(`${INTERNAL_API_BASE}/democracy/v1/match/${matchId}/history`, {
      headers: { 'User-Agent': BROWSER_UA },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const games = parseVetoHistory(data?.payload?.tickets);
    return games.length ? games : null;
  } catch {
    return null;
  }
}

export function setApiKey(key) {
  apiKey = key;
}

function authHeaders() {
  // Read lazily — dotenv may not have loaded yet at import time (ESM hoisting)
  const key = apiKey || process.env.FACEIT_API_KEY || '';
  return key ? { 'Authorization': `Bearer ${key}` } : {};
}

/**
 * Parse a FACEIT room URL to extract match ID
 * e.g., https://www.faceit.com/en/ow2/room/1-ff076311-f203-4239-809e-b83f9d989448
 */
export function parseMatchUrl(url) {
  const match = url.match(/room\/([\w-]+)/i);
  return match ? match[1] : url; // if not a URL, assume it's a raw ID
}

/**
 * Get full match details (teams, rosters, map voting, results, bestOf)
 */
export async function getMatchDetails(matchId) {
  try {
    // Veto history rides along on every fetch (import + 15s poll tick) so a
    // ban made mid-series gets real attribution on the next tick. It can
    // never fail the match load — getVetoHistory resolves null on any error.
    const [res, vetoGames] = await Promise.all([
      fetch(`${DATA_API_BASE}/matches/${matchId}`, {
        headers: authHeaders(),
      }),
      getVetoHistory(matchId),
    ]);
    if (!res.ok) throw new Error(`FACEIT API ${res.status}`);
    const data = await res.json();

    const teams = {};
    for (const [factionKey, faction] of Object.entries(data.teams || {})) {
      teams[factionKey] = {
        id: faction.faction_id,
        name: faction.name,
        avatar: faction.avatar,
        roster: (faction.roster || []).map(p => ({
          playerId: p.player_id,
          nickname: p.nickname,
          avatar: p.avatar,
          gamePlayerName: p.game_player_name,
          skillLevel: p.game_skill_level,
        })),
      };
    }

    // Parse map voting data. Names are folded to the app's catalog vocabulary
    // and unknown pick ids are resolved rather than leaked as hex — see
    // buildPickedMaps / canonicalMapName / resolveMapId above.
    //
    // voting.map.pick DOES include mid-series picks: verified against the
    // producers' Bo7 (S9 SA Master Central playoffs), whose 6th map was picked
    // after map 5 and was present in `pick` as the sixth id. So this list is the
    // whole series, not just the pre-match veto.
    const voting = data.voting || {};
    const { mapPool: mapEntities, pickedMaps } = buildPickedMaps(voting.map || {});

    // Parse hero voting data to extract per-map bans
    // Entity order = ban chronological order (validated across 14+ maps)
    const heroVoting = voting.heroes || {};
    const heroEntities = heroVoting.entities || [];
    const heroEntityIds = heroEntities.map(h => h.game_heroes_id);
    const heroMap = {};
    for (const h of heroEntities) {
      heroMap[h.game_heroes_id] = {
        name: h.name,
        role: (h.filters?.voting_tags?.[0] || '').replace('role:', ''),
        image: h.image_sm || h.image_lg || '',
      };
    }
    const heroPicks = heroVoting.pick || [];

    // Real attribution from the veto history, when FACEIT kept it. Democracy
    // guids and voting.heroes game_heroes_id are one vocabulary, so heroMap
    // resolves both.
    const apiAttribution = buildApiAttribution(vetoGames || [], heroMap);

    // For each map, find banned heroes (missing from pick list) in entity order
    const perMapBans = heroPicks.map((pickList, i) => {
      const available = new Set(pickList);
      // Entity order gives us ban chronological order: ban1 first, ban2 second
      const bannedInOrder = heroEntityIds
        .filter(id => !available.has(id))
        .map(id => heroMap[id] || { name: id, role: 'Unknown', image: '' });
      const entry = {
        ban1: bannedInOrder[0] || null,  // First ban, chronological (fallback pairing)
        ban2: bannedInOrder[1] || null,  // Second ban
      };
      // Attach who-banned-what / who-picked when the history covered game i;
      // buildPerMapBans (faceit-merge.js) prefers this over its heuristic.
      if (apiAttribution[i]) entry.api = apiAttribution[i];
      return entry;
    });

    return {
      matchId: data.match_id,
      status: data.status,
      bestOf: data.best_of,
      competitionName: data.competition_name,
      teams,
      mapPool: mapEntities,
      pickedMaps,
      perMapBans,
      results: data.results || {},
      startedAt: data.started_at,
      finishedAt: data.finished_at,
    };
  } catch (e) {
    console.error('[FACEIT] getMatchDetails error:', e.message);
    throw e;
  }
}

/**
 * Get per-player match statistics (per round)
 */
export async function getMatchStats(matchId) {
  try {
    const res = await fetch(`${DATA_API_BASE}/matches/${matchId}/stats`, {
      headers: authHeaders(),
    });
    // 404 = stats not available yet (match not started, round in progress, etc.)
    // This is expected and happens constantly during polling — don't log it
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`FACEIT Stats API ${res.status}`);
    const data = await res.json();

    return (data.rounds || []).map(round => ({
      matchRound: round.match_round,
      bestOf: round.best_of,
      map: round.round_stats?.Map,
      mapMode: round.round_stats?.['OW2 Mode'],
      scoreSummary: round.round_stats?.['Score Summary'],
      winner: round.round_stats?.Winner,
      teams: (round.teams || []).map(team => ({
        teamId: team.team_id,
        name: team.team_stats?.Team,
        stats: {
          totalEliminations: Number(team.team_stats?.['Team Total Eliminations'] || 0),
          totalDeaths: Number(team.team_stats?.['Team Total Deaths'] || 0),
          avgEliminations: Number(team.team_stats?.['Team Avg Eliminations'] || 0),
          avgDeaths: Number(team.team_stats?.['Team Avg Deaths'] || 0),
          totalFinalBlows: Number(team.team_stats?.['Total Team Final Blows'] || 0),
          totalObjectiveTime: Number(team.team_stats?.['Total Team Objective Time'] || 0),
          totalMultiKills: Number(team.team_stats?.['Total Team Multi Kills'] || 0),
          teamScore: Number(team.team_stats?.['Team Score'] || 0),
          teamWin: team.team_stats?.['Team Win'] === '1',
        },
        players: (team.players || []).map(p => ({
          playerId: p.player_id,
          nickname: p.nickname,
          role: p.player_stats?.Role || 'Unknown',
          kills: Number(p.player_stats?.Eliminations || 0),
          deaths: Number(p.player_stats?.Deaths || 0),
          finalBlows: Number(p.player_stats?.['Final Blows'] || 0),
          assists: Number(p.player_stats?.Assists || 0),
          damageDealt: Number(p.player_stats?.['Damage Dealt'] || 0),
          damageMitigated: Number(p.player_stats?.['Damage Mitigated'] || 0),
          healingDone: Number(p.player_stats?.['Healing Done'] || 0),
          objectiveTime: Number(p.player_stats?.['Objective Time'] || 0),
          kdRatio: Number(p.player_stats?.['K/D Ratio'] || 0),
          multiKills: Number(p.player_stats?.['Multi Kills'] || 0),
          soloKills: Number(p.player_stats?.['Solo Kills'] || 0),
          environmentalKills: Number(p.player_stats?.['Environmental Kills'] || 0),
          timePlayed: Number(p.player_stats?.['Time Played'] || 0),
        })),
      })),
    }));
  } catch (e) {
    console.error('[FACEIT] getMatchStats error:', e.message);
    throw e;
  }
}

/**
 * Get standings for a stage
 */
export async function getStandings(stageId) {
  try {
    const res = await fetch(
      `${TEAM_LEAGUES_BASE}/standings?entityId=${stageId}&entityType=stage&offset=0&limit=100`
    );
    if (!res.ok) throw new Error(`Standings API ${res.status}`);
    const data = await res.json();
    return data.payload?.standings || [];
  } catch (e) {
    console.error('[FACEIT] getStandings error:', e.message);
    return [];
  }
}
