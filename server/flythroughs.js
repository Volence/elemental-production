/**
 * Flythrough video lookup — maps OW map names to local video files.
 * Scans a configurable directory and fuzzy-matches map names to filenames.
 */
import fs from 'fs';
import path from 'path';

// Canonical map-name → expected filename fragments (lowercase)
const MAP_ALIASES = {
  'blizzard world': ['blizzard world'],
  'busan': ['busan'],
  'colosseo': ['colosseo'],
  'dorado': ['dorado'],
  'watchpoint: gibraltar': ['gibraltar'],
  'gibraltar': ['gibraltar'],
  'ilios': ['ilios'],
  "king's row": ['kings row'],
  'kings row': ['kings row'],
  'lijiang tower': ['lilijang', 'lijiang'],
  'midtown': ['midtown'],
  'nepal': ['nepal'],
  'new junk city': ['new junk city'],
  'rialto': ['rialto'],
  'route 66': ['route 66'],
  'runasapi': ['runasapi'],
  'samoa': ['samoa'],
  'suravasa': ['suravasa'],
  'esperança': ['esperanca', 'esperança'],
  'esperanca': ['esperanca', 'esperança'],
  'antarctic peninsula': ['antarctic'],
  'circuit royal': ['circuit'],
  'havana': ['havana'],
  'numbani': ['numbani'],
  'oasis': ['oasis'],
  'paraíso': ['paraiso', 'paraíso'],
  'shambali monastery': ['shambali'],
  'hollywood': ['hollywood'],
  'eichenwalde': ['eichenwalde'],
  'new queen street': ['new queen'],
  'hanaoka': ['hanaoka'],
  'thrown room': ['throne'],
};

let cachedDir = null;
let cachedFiles = [];

/**
 * Scan the flythroughs directory and cache file list.
 */
export function scanDirectory(dir) {
  cachedDir = dir;
  try {
    if (!fs.existsSync(dir)) {
      cachedFiles = [];
      return [];
    }
    cachedFiles = fs.readdirSync(dir)
      .filter(f => /\.(mp4|webm)$/i.test(f))
      .map(f => ({ filename: f, lower: f.toLowerCase() }));
    return cachedFiles;
  } catch (e) {
    console.warn('[Flythroughs] Failed to scan directory:', e.message);
    cachedFiles = [];
    return [];
  }
}

/**
 * Find the flythrough video URL for a given map name.
 * Returns the relative URL path (e.g., /flythroughs/Dorado%20Fly.mp4) or null.
 */
export function getFlythroughUrl(mapName) {
  if (!mapName || cachedFiles.length === 0) return null;

  const normalizedMap = mapName.toLowerCase().trim();

  // Look up aliases for this map name
  const aliases = MAP_ALIASES[normalizedMap] || [normalizedMap];

  for (const alias of aliases) {
    const match = cachedFiles.find(f => f.lower.includes(alias));
    if (match) {
      return `/flythroughs/${encodeURIComponent(match.filename)}`;
    }
  }

  return null;
}

/**
 * Get all available flythroughs as a map of mapName → URL.
 */
export function getAllFlythroughs() {
  const result = {};
  for (const [mapName, aliases] of Object.entries(MAP_ALIASES)) {
    for (const alias of aliases) {
      const match = cachedFiles.find(f => f.lower.includes(alias));
      if (match) {
        // Use a clean display name (capitalize first letter of each word)
        const displayName = mapName.replace(/\b\w/g, c => c.toUpperCase());
        result[displayName] = `/flythroughs/${encodeURIComponent(match.filename)}`;
        break;
      }
    }
  }
  return result;
}

export function getDirectory() {
  return cachedDir;
}
