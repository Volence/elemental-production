// Social-icon glyphs in the full-screen scenes.
//
// Regression cover for the v2.1.3 producer report (DanBuzzBuzz): "social media
// icons are filled (idk if this is by design though)".
//
// Twitch and Discord ARE solid glyphs by design — Simple Icons ships them as
// single filled shapes and that is how they are meant to read. YouTube was
// genuinely broken: its glyph is TWO subpaths — the rounded "screen" plus the
// play triangle that the nonzero fill rule knocks out of it — and only the
// screen had been pasted in. The result on air was a featureless filled
// rounded rectangle, which is what made the whole row look "filled".
//
// These tests assert on the subpath count rather than the exact `d` string, so
// re-drawing or re-minifying an icon doesn't fail the suite, but silently
// dropping a knockout subpath does.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SCENES = ['starting-soon.html', 'end-of-stream.html'];

/** The `d` of every <path> inside the scene's social chips. */
function socialPaths(html) {
  const chips = html.match(/<svg viewBox="0 0 24 24">.*?<\/svg>/g) || [];
  return chips.map(svg => (svg.match(/ d="([^"]+)"/) || [])[1] || '');
}

/** Subpath count — SVG path data starts a new subpath at each moveto, and a
 *  moveto can be absolute (M) or relative (m); Twitch's glyph uses both. */
const subpathCount = (d) => (d.match(/[Mm]/g) || []).length;

describe.each(SCENES)('%s social icons', (file) => {
  const html = readFileSync(join(here, file), 'utf8');
  const paths = socialPaths(html);

  it('renders a social row', () => {
    expect(paths.length).toBeGreaterThanOrEqual(3);
    expect(paths.every(Boolean)).toBe(true);
  });

  it('draws the YouTube play triangle, not just the screen', () => {
    // The chip order is YouTube, Twitch, Discord (+ Twitter on end-of-stream).
    const youtube = paths[0];
    expect(youtube).toMatch(/^M23\.498 6\.186/); // still the YouTube glyph
    // Screen + play triangle. One subpath is the bug: a solid rounded rect.
    expect(subpathCount(youtube)).toBe(2);
    expect(youtube).toContain('M9.545 15.568V8.432L15.818 12l-6.273 3.568z');
  });

  it('keeps Twitch\'s two knockout screens', () => {
    // Twitch is 4 subpaths: two small screens, the body, and the inner cut.
    expect(subpathCount(paths[1])).toBe(4);
  });

  it('leaves the intentionally-solid Discord glyph alone', () => {
    // Discord's face IS one filled shape — this is the "by design" half of
    // the report, pinned so nobody "fixes" it later.
    expect(subpathCount(paths[2])).toBe(1);
  });
});
