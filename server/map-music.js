/**
 * Map music lookup — maps OW map names to local audio files.
 * Scans a configurable directory and fuzzy-matches map names to filenames.
 * Same pattern as flythroughs.js but for audio files.
 */
import fs from 'fs';
import path from 'path';

// Canonical map-name → expected filename fragments (lowercase)
// These filenames match the YouTube playlist naming convention
const MAP_ALIASES = {
  'blizzard world': ['blizzard world'],
  'busan': ['busan'],
  'colosseo': ['colosseo'],
  'dorado': ['dorado'],
  'watchpoint: gibraltar': ['watchpoint gibraltar'],
  'gibraltar': ['watchpoint gibraltar'],
  'ilios': ['ilios'],
  "king's row": ['kings row'],
  'kings row': ['kings row'],
  'lijiang tower': ['lijiang tower'],
  'midtown': ['midtown'],
  'nepal': ['nepal'],
  'rialto': ['rialto'],
  'route 66': ['route 66'],
  'esperança': ['esperanca'],
  'esperanca': ['esperanca'],
  'antarctic peninsula': ['antarctic peninsula'],
  'circuit royal': ['circuit royal'],
  'havana': ['havana'],
  'numbani': ['numbani'],
  'oasis': ['oasis'],
  'paraíso': ['paraiso'],
  'paraiso': ['paraiso'],
  'shambali monastery': ['shambali monastery'],
  'hollywood': ['hollywood'],
  'eichenwalde': ['eichenwalde'],
  'new queen street': ['new queen street'],
  'junkertown': ['junkertown'],
  'new junk city': ['new junk city'],
  'samoa': ['samoa'],
  'suravasa': ['suravasa'],
  'runasapi': ['runasapi'],
  'hanaoka': ['hanaoka', 'lijiang tower'],
  'throne room': ['throne', 'eichenwalde'],
};

let cachedDir = null;
let cachedFiles = [];

/**
 * Scan the music directory and cache file list.
 */
export function scanDirectory(dir) {
  cachedDir = dir;
  try {
    if (!fs.existsSync(dir)) {
      cachedFiles = [];
      return [];
    }
    cachedFiles = fs.readdirSync(dir)
      .filter(f => /\.(mp3|ogg|wav|flac|m4a|aac)$/i.test(f))
      .map(f => ({ filename: f, lower: f.toLowerCase() }));
    return cachedFiles;
  } catch (e) {
    console.warn('[MapMusic] Failed to scan directory:', e.message);
    cachedFiles = [];
    return [];
  }
}

/**
 * Find the music file path for a given map name.
 * Returns the absolute file path or null.
 */
export function getMusicPath(mapName) {
  if (!mapName || cachedFiles.length === 0 || !cachedDir) return null;

  const normalizedMap = mapName.toLowerCase().trim();

  // Look up aliases for this map name
  const aliases = MAP_ALIASES[normalizedMap] || [normalizedMap];

  for (const alias of aliases) {
    const match = cachedFiles.find(f => f.lower.includes(alias));
    if (match) {
      return path.join(cachedDir, match.filename);
    }
  }

  return null;
}

/**
 * Get all available map music as a map of mapName → filename.
 */
export function getAllMapMusic() {
  const result = {};
  const seen = new Set();
  for (const [mapName, aliases] of Object.entries(MAP_ALIASES)) {
    for (const alias of aliases) {
      const match = cachedFiles.find(f => f.lower.includes(alias));
      if (match && !seen.has(match.filename)) {
        const displayName = mapName.replace(/\b\w/g, c => c.toUpperCase());
        result[displayName] = match.filename;
        seen.add(match.filename);
        break;
      }
    }
  }
  return result;
}

export function getDirectory() {
  return cachedDir;
}
