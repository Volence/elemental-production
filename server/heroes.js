const OVERFAST_API = 'https://overfast-api.tekrop.fr';

let cachedHeroes = null;
let cacheTime = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch all heroes from OverFast API (auto-cached for 24h)
 * Returns heroes grouped by role with portraits from Blizzard CDN
 */
export async function getHeroes() {
  if (cachedHeroes && Date.now() - cacheTime < CACHE_TTL) {
    return cachedHeroes;
  }

  try {
    const res = await fetch(`${OVERFAST_API}/heroes`);
    if (!res.ok) throw new Error(`OverFast API ${res.status}`);
    const heroes = await res.json();

    cachedHeroes = heroes.map(h => ({
      key: h.key,
      name: h.name,
      portrait: h.portrait,
      role: h.role, // 'tank', 'damage', 'support'
    }));
    cacheTime = Date.now();

    console.log(`[Heroes] Loaded ${cachedHeroes.length} heroes from OverFast API`);
    return cachedHeroes;
  } catch (e) {
    console.error('[Heroes] Failed to fetch:', e.message);
    // Return cached data even if stale
    return cachedHeroes || [];
  }
}

/**
 * Get heroes grouped by role
 */
export async function getHeroesByRole() {
  const heroes = await getHeroes();
  return {
    tank: heroes.filter(h => h.role === 'tank'),
    damage: heroes.filter(h => h.role === 'damage'),
    support: heroes.filter(h => h.role === 'support'),
  };
}
