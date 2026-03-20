const DATA_API_BASE = 'https://open.faceit.com/data/v4';
const TEAM_LEAGUES_BASE = 'https://www.faceit.com/api/team-leagues/v2';

let apiKey = process.env.FACEIT_API_KEY || '';

export function setApiKey(key) {
  apiKey = key;
}

function authHeaders() {
  return apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {};
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
    const res = await fetch(`${DATA_API_BASE}/matches/${matchId}`, {
      headers: authHeaders(),
    });
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

    // Parse map voting data
    const voting = data.voting || {};
    const mapVoting = voting.map || {};
    const mapEntities = (mapVoting.entities || []).map(m => ({
      id: m.game_map_id || m.guid,
      name: m.name,
      mode: (m.filters?.voting_tags?.[0] || '').replace('cat:', ''),
      imageLg: m.image_lg,
      imageSm: m.image_sm,
    }));
    const mapPicks = mapVoting.pick || [];

    // Build ordered picked maps
    const pickedMaps = mapPicks.map(id =>
      mapEntities.find(m => m.id === id) || { id, name: id, mode: 'Unknown' }
    );

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
    const allHeroIds = new Set(heroEntityIds);
    const heroPicks = heroVoting.pick || [];

    // For each map, find banned heroes (missing from pick list) in entity order
    const perMapBans = heroPicks.map(pickList => {
      const available = new Set(pickList);
      // Entity order gives us ban chronological order: ban1 first, ban2 second
      const bannedInOrder = heroEntityIds
        .filter(id => !available.has(id))
        .map(id => heroMap[id] || { name: id, role: 'Unknown', image: '' });
      return {
        ban1: bannedInOrder[0] || null,  // First ban (map picker's ban)
        ban2: bannedInOrder[1] || null,  // Second ban (other team's ban)
      };
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
