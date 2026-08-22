/**
 * The OW2 competitive map pool, as the dashboard needs it.
 *
 * WHY THIS FILE EXISTS (producer report, v2.1.3: "no neon junction selection
 * in match hub maps"): the Match Hub's manual map picker used its own
 * hardcoded `OW2_MAPS` array, which was a THIRD copy of the pool — alongside
 * `FACEIT_MAP_IDS` in server/faceit.js and OverFast's live catalog behind
 * /api/maps. It had drifted: no Neon Junction, and no Clash maps at all
 * (Hanaoka, Throne of Anubis), so a producer whose series featured one simply
 * could not add it by hand. Settings' Season Map Pool editor, which reads the
 * live catalog, listed them fine — which is exactly the inconsistency the
 * report describes.
 *
 * The fix is to make the live catalog the source for BOTH dashboard surfaces,
 * with this module owning the one thing the catalog can't tell us (see
 * STADIUM_ONLY_MAPS) plus an offline fallback. `ow2-maps.test.js` asserts that
 * fallback still covers every map the server's FACEIT id table knows, so this
 * particular drift can't silently come back.
 */

/**
 * Gamemodes that appear in competitive OW2 series, in the order the map
 * picker should present them. OverFast's catalog also carries arcade and
 * legacy modes (assault, deathmatch, elimination, workshop, …) which must
 * never reach the picker.
 */
export const COMPETITIVE_MODES = ['Control', 'Escort', 'Hybrid', 'Push', 'Flashpoint', 'Clash'];

/** OverFast gamemode slug -> the display label used above and in state.maps. */
const MODE_BY_SLUG = {
  control: 'Control',
  escort: 'Escort',
  hybrid: 'Hybrid',
  push: 'Push',
  flashpoint: 'Flashpoint',
  clash: 'Clash',
};

/**
 * Stadium-only maps. They carry normal competitive gamemodes in the OverFast
 * catalog with no distinguishing field, so they'd otherwise leak into both the
 * picker and the Season Map Pool editor. Curated by hand against the OW wiki /
 * OWCS 2026 usage — Aatlis and Neon Junction ARE real competitive maps and
 * deliberately stay listed.
 *
 * Previously duplicated inside Settings.jsx; both dashboard surfaces now share
 * this one copy.
 */
export const STADIUM_ONLY_MAPS = new Set([
  'Arena Victoriae', 'Gogadoro', 'Wuxing University', 'Place Lacroix', 'Redwood Dam',
]);

/**
 * Offline fallback used only when /api/maps hasn't answered (first paint, or
 * OverFast unreachable with a cold cache). Names use the OverFast catalog
 * spelling, which is what the rest of the app keys on — see the vocabulary
 * note atop server/faceit.js.
 *
 * Kept in sync with server/faceit.js's FACEIT_MAP_IDS by ow2-maps.test.js.
 */
export const OW2_MAPS_FALLBACK = [
  { name: 'Busan', mode: 'Control' }, { name: 'Ilios', mode: 'Control' },
  { name: 'Lijiang Tower', mode: 'Control' }, { name: 'Nepal', mode: 'Control' },
  { name: 'Oasis', mode: 'Control' }, { name: 'Antarctic Peninsula', mode: 'Control' },
  { name: 'Samoa', mode: 'Control' },
  { name: 'Circuit Royal', mode: 'Escort' }, { name: 'Dorado', mode: 'Escort' },
  { name: 'Havana', mode: 'Escort' }, { name: 'Junkertown', mode: 'Escort' },
  { name: 'Rialto', mode: 'Escort' }, { name: 'Route 66', mode: 'Escort' },
  { name: 'Shambali Monastery', mode: 'Escort' }, { name: 'Watchpoint: Gibraltar', mode: 'Escort' },
  { name: 'Blizzard World', mode: 'Hybrid' }, { name: 'Eichenwalde', mode: 'Hybrid' },
  { name: 'Hollywood', mode: 'Hybrid' }, { name: 'King’s Row', mode: 'Hybrid' },
  { name: 'Midtown', mode: 'Hybrid' }, { name: 'Neon Junction', mode: 'Hybrid' },
  { name: 'Numbani', mode: 'Hybrid' }, { name: 'Paraíso', mode: 'Hybrid' },
  { name: 'Colosseo', mode: 'Push' }, { name: 'Esperança', mode: 'Push' },
  { name: 'New Queen Street', mode: 'Push' }, { name: 'Runasapi', mode: 'Push' },
  { name: 'New Junk City', mode: 'Flashpoint' }, { name: 'Suravasa', mode: 'Flashpoint' },
  { name: 'Aatlis', mode: 'Flashpoint' },
  { name: 'Hanaoka', mode: 'Clash' }, { name: 'Throne of Anubis', mode: 'Clash' },
];

/**
 * Reduce an /api/maps catalog response to the competitive pool as
 * `[{ name, mode }]`, ordered by COMPETITIVE_MODES then by catalog order.
 * Returns null when the catalog yields nothing usable, so callers can fall
 * back to OW2_MAPS_FALLBACK rather than render an empty picker.
 *
 * A catalog map can list several gamemodes; the first competitive one wins,
 * matching how the pool is presented everywhere else (one mode per map).
 */
export function competitiveMapsFromCatalog(catalog) {
  if (!Array.isArray(catalog) || catalog.length === 0) return null;
  const byMode = new Map(COMPETITIVE_MODES.map(m => [m, []]));
  const seen = new Set();

  for (const entry of catalog) {
    const name = entry && entry.name;
    if (!name || seen.has(name) || STADIUM_ONLY_MAPS.has(name)) continue;
    const modes = Array.isArray(entry.gamemodes) ? entry.gamemodes : [];
    const label = modes.map(slug => MODE_BY_SLUG[String(slug).toLowerCase()]).find(Boolean);
    if (!label) continue;
    seen.add(name);
    byMode.get(label).push({ name, mode: label });
  }

  const out = COMPETITIVE_MODES.flatMap(m => byMode.get(m));
  return out.length ? out : null;
}
