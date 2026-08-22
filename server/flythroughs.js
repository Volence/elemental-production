/**
 * Flythrough video lookup — maps OW map names to local video files.
 * Scans a configurable directory and fuzzy-matches map names to filenames.
 */
import fs from 'fs';

// Canonical map list — one entry per map so the detected list never shows
// duplicates. `aliases` are filename fragments to match against (compressed:
// lowercase, accents stripped, non-alphanumerics removed).
const MAP_DEFS = [
  { display: 'Aatlis', aliases: ['aatlis'] },
  { display: 'Antarctic Peninsula', aliases: ['antarctic'] },
  { display: 'Blizzard World', aliases: ['blizzard world'] },
  { display: 'Busan', aliases: ['busan'] },
  { display: 'Circuit Royal', aliases: ['circuit'] },
  { display: 'Colosseo', aliases: ['colosseo'] },
  { display: 'Dorado', aliases: ['dorado'] },
  { display: 'Eichenwalde', aliases: ['eichenwalde'] },
  { display: 'Esperança', aliases: ['esperanca'] },
  { display: 'Hanaoka', aliases: ['hanaoka'] },
  { display: 'Havana', aliases: ['havana'] },
  { display: 'Hollywood', aliases: ['hollywood'] },
  { display: 'Ilios', aliases: ['ilios'] },
  { display: 'Junkertown', aliases: ['junkertown'] },
  { display: "King's Row", aliases: ['kings row'] },
  { display: 'Lijiang Tower', aliases: ['lilijang', 'lijiang'] },
  { display: 'Midtown', aliases: ['midtown'] },
  // Newly reachable in v2.1.3 — see the same note in server/map-music.js.
  { display: 'Neon Junction', aliases: ['neon junction', 'neon'] },
  { display: 'Nepal', aliases: ['nepal'] },
  { display: 'New Junk City', aliases: ['new junk city'] },
  { display: 'New Queen Street', aliases: ['new queen'] },
  { display: 'Numbani', aliases: ['numbani'] },
  { display: 'Oasis', aliases: ['oasis'] },
  { display: 'Paraíso', aliases: ['paraiso'] },
  { display: 'Rialto', aliases: ['rialto'] },
  { display: 'Route 66', aliases: ['route 66'] },
  { display: 'Runasapi', aliases: ['runasapi'] },
  { display: 'Samoa', aliases: ['samoa'] },
  { display: 'Shambali Monastery', aliases: ['shambali'] },
  { display: 'Suravasa', aliases: ['suravasa'] },
  { display: 'Throne of Anubis', aliases: ['throne of anubis', 'throne'] },
  { display: 'Throne Room', aliases: ['throne'] },
  { display: 'Watchpoint: Gibraltar', aliases: ['gibraltar'] },
];

// Compress a name for fuzzy matching: strip accents/punctuation/spaces.
// "King's Row Fly.mp4" → "kingsrowflymp4", "Esperança" → "esperanca"
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
      // .mov added (owner QA batch 3: the producer's recorder outputs QuickTime;
      // OBS's ffmpeg media source plays it fine). m4v for the same container family.
      .filter(f => /\.(mp4|webm|mov|m4v)$/i.test(f))
      .map(f => ({ filename: f, compressed: compress(f) }));
    return cachedFiles;
  } catch (e) {
    console.warn('[Flythroughs] Failed to scan directory:', e.message);
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
 * Find the flythrough video URL for a given map name.
 * Returns the relative URL path (e.g., /flythroughs/Dorado%20Fly.mp4) or null.
 */
export function getFlythroughUrl(mapName) {
  if (!mapName || cachedFiles.length === 0) return null;

  const def = NAME_LOOKUP[compress(mapName)] || { aliases: [mapName] };
  const match = findFile(def);
  return match ? `/flythroughs/${encodeURIComponent(match.filename)}` : null;
}

/**
 * Get all available flythroughs as a map of mapName → URL.
 */
export function getAllFlythroughs() {
  const result = {};
  for (const def of MAP_DEFS) {
    const match = findFile(def);
    if (match) {
      result[def.display] = `/flythroughs/${encodeURIComponent(match.filename)}`;
    }
  }
  return result;
}

export function getDirectory() {
  return cachedDir;
}
