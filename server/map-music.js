/**
 * Map music lookup — maps OW map names to local audio files.
 * Scans a configurable directory and fuzzy-matches map names to filenames.
 * Same pattern as flythroughs.js but for audio files.
 */
import fs from 'fs';
import path from 'path';

// Canonical map list — one entry per map so the detected list never shows
// duplicates. `aliases` are filename fragments (matching the YouTube playlist
// naming convention); later aliases act as fallbacks (e.g. Hanaoka → Lijiang).
const MAP_DEFS = [
  { display: 'Aatlis', aliases: ['aatlis'] },
  { display: 'Antarctic Peninsula', aliases: ['antarctic peninsula'] },
  { display: 'Blizzard World', aliases: ['blizzard world'] },
  { display: 'Busan', aliases: ['busan'] },
  { display: 'Circuit Royal', aliases: ['circuit royal'] },
  { display: 'Colosseo', aliases: ['colosseo'] },
  { display: 'Dorado', aliases: ['dorado'] },
  { display: 'Eichenwalde', aliases: ['eichenwalde'] },
  { display: 'Esperança', aliases: ['esperanca'] },
  { display: 'Hanaoka', aliases: ['hanaoka', 'lijiang tower'] },
  { display: 'Havana', aliases: ['havana'] },
  { display: 'Hollywood', aliases: ['hollywood'] },
  { display: 'Ilios', aliases: ['ilios'] },
  { display: 'Junkertown', aliases: ['junkertown'] },
  { display: "King's Row", aliases: ['kings row'] },
  { display: 'Lijiang Tower', aliases: ['lijiang tower'] },
  { display: 'Midtown', aliases: ['midtown'] },
  { display: 'Nepal', aliases: ['nepal'] },
  { display: 'New Junk City', aliases: ['new junk city'] },
  { display: 'New Queen Street', aliases: ['new queen street'] },
  { display: 'Numbani', aliases: ['numbani'] },
  { display: 'Oasis', aliases: ['oasis'] },
  { display: 'Paraíso', aliases: ['paraiso'] },
  { display: 'Rialto', aliases: ['rialto'] },
  { display: 'Route 66', aliases: ['route 66'] },
  { display: 'Runasapi', aliases: ['runasapi'] },
  { display: 'Samoa', aliases: ['samoa'] },
  { display: 'Shambali Monastery', aliases: ['shambali monastery'] },
  { display: 'Suravasa', aliases: ['suravasa'] },
  { display: 'Throne Room', aliases: ['throne', 'eichenwalde'] },
  { display: 'Watchpoint: Gibraltar', aliases: ['watchpoint gibraltar'] },
];

// Compress a name for fuzzy matching: strip accents/punctuation/spaces.
// "King's Row Theme.mp3" → "kingsrowthememp3", "Esperança" → "esperanca"
function compress(s) {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Lookup from compressed map name (display + aliases) → map definition
const NAME_LOOKUP = {};
for (const def of MAP_DEFS) {
  NAME_LOOKUP[compress(def.display)] = def;
  for (const a of def.aliases) NAME_LOOKUP[compress(a)] = def;
}

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
      .map(f => ({ filename: f, compressed: compress(f) }));
    return cachedFiles;
  } catch (e) {
    console.warn('[MapMusic] Failed to scan directory:', e.message);
    cachedFiles = [];
    return [];
  }
}

function findFile(def) {
  for (const alias of def.aliases) {
    const needle = compress(alias);
    const match = cachedFiles.find(f => f.compressed.includes(needle));
    if (match) return match;
  }
  return null;
}

/**
 * Find the music file path for a given map name.
 * Returns the absolute file path or null.
 */
export function getMusicPath(mapName) {
  if (!mapName || cachedFiles.length === 0 || !cachedDir) return null;

  const def = NAME_LOOKUP[compress(mapName)] || { aliases: [mapName] };
  const match = findFile(def);
  return match ? path.join(cachedDir, match.filename) : null;
}

/**
 * Get all available map music as a map of mapName → filename.
 */
export function getAllMapMusic() {
  const result = {};
  for (const def of MAP_DEFS) {
    const match = findFile(def);
    if (match) {
      result[def.display] = match.filename;
    }
  }
  return result;
}

export function getDirectory() {
  return cachedDir;
}
