// Local-first map image resolution.
//
// OverFast API map names carry Unicode punctuation that trips naive
// toLowerCase().replace() chains -- notably King's Row, which OverFast
// returns with a CURLY apostrophe (U+2019), not the straight one a
// producer would type. This mirrors the accent/punctuation-insensitive
// approach already used for hero names (heroNameToKey in server.js,
// normHeroName in overlays/theme-helpers.js: NFD-normalize + strip
// combining marks, lowercase), but strips ALL apostrophe variants (rather
// than just the straight one) and collapses remaining punctuation/
// whitespace into single hyphens so producers get a readable, stable
// filename convention:
//   "King’s Row" / "King's Row" -> "kings-row"
//   "Paraíso" (Paraíso)    -> "paraiso"
//   "Watchpoint: Gibraltar"          -> "watchpoint-gibraltar"
import fs from 'fs';
import path from 'path';

export const SUPPORTED_MAP_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

// Combining diacritical marks left behind by NFD decomposition, e.g.
// "i" + COMBINING ACUTE ACCENT (U+0301) from "í".
const DIACRITIC_RE = /[̀-ͯ]/g;
// Apostrophe variants: RIGHT SINGLE QUOTATION MARK, LEFT SINGLE QUOTATION
// MARK, APOSTROPHE. Stripped entirely (not turned into a hyphen) so
// "King's Row" and "King’s Row" both collapse to "kings-row", not
// "king-s-row".
const APOSTROPHE_RE = /[‘’']/g;

/**
 * Normalize a map (or hero) display name into a filesystem-safe key.
 */
export function normalizeMapName(name) {
  if (!name) return '';
  return name
    .normalize('NFD').replace(DIACRITIC_RE, '')  // strip diacritics (Paraíso -> Paraiso)
    .replace(APOSTROPHE_RE, '')                  // strip apostrophes (see above)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')                 // any other run of punctuation/whitespace -> hyphen
    .replace(/^-+|-+$/g, '');                    // trim leading/trailing hyphens
}

/**
 * Look for a local image for a given map name inside `dir`. Checked live
 * (no caching) so a file dropped in mid-broadcast shows up on the next
 * request. Returns the matched filename (e.g. "kings-row.png") or null.
 */
export function findLocalMapImage(name, dir) {
  const base = normalizeMapName(name);
  if (!base || !dir) return null;
  for (const ext of SUPPORTED_MAP_IMAGE_EXTENSIONS) {
    const filename = `${base}${ext}`;
    try {
      if (fs.existsSync(path.join(dir, filename))) return filename;
    } catch {
      // ignore -- treat unreadable dir as "no local file"
    }
  }
  return null;
}
