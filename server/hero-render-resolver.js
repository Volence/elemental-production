// Local-first hero render (full-body art) resolution.
//
// Unlike map names (see server/map-image-resolver.js), heroes already have
// canonical machine-safe keys from the OverFast API ("dva", "soldier-76",
// "lucio", "junker-queen", ...) -- no accent/punctuation normalization
// needed. The filename IS the hero key.
import fs from 'fs';
import path from 'path';

// .png first (transparent cutouts, the ideal source), then .jpg, then .webp.
// .webp is LAST deliberately: the render pack shipped with the app is all
// WebP, and the pack's contract is that a producer's own drop-in overrides
// the shipped art — which only holds if their file's extension outranks
// .webp. Same rationale as SUPPORTED_MAP_IMAGE_EXTENSIONS.
export const SUPPORTED_HERO_RENDER_EXTENSIONS = ['.png', '.jpg', '.webp'];

/**
 * Look for a local full-body render for a given hero key inside `dir`.
 * Checked live (no caching) so a file dropped in mid-broadcast shows up on
 * the next request. Returns the matched filename (e.g. "dva.png") or null.
 *
 * Rejects empty/non-string/nullish keys, and keys that look like path
 * traversal (contain '/', '\\', or '..') -- defense in depth even though
 * hero keys come from the trusted OverFast API, not user input.
 */
export function findLocalHeroRender(heroKey, dir) {
  if (typeof heroKey !== 'string' || !heroKey) return null;
  if (!dir) return null;
  if (heroKey.includes('/') || heroKey.includes('\\') || heroKey.includes('..')) return null;

  for (const ext of SUPPORTED_HERO_RENDER_EXTENSIONS) {
    const filename = `${heroKey}${ext}`;
    try {
      if (fs.existsSync(path.join(dir, filename))) return filename;
    } catch {
      // ignore -- treat unreadable dir as "no local file"
    }
  }
  return null;
}
