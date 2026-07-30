# Local hero renders (drop-in pack)

The `/api/heroes` route (and the `__HERO_DATA__` bootstrap injected into
every overlay page) serves Overwatch hero data from the
[OverFast API](https://overfast-api.tekrop.fr/): key, name, role, and a
square portrait. Portraits are fine for roster/picker UI, but scenes like
Ban Reveal and Map Intro want a full-body hero render instead. OverFast
doesn't provide one — this folder is where producers drop full-body art in
for the heroes that need it, without touching any code.

**How it works:** on every request that returns hero data, the server
checks this folder for `<hero-key>.png`, `<hero-key>.webp`, or
`<hero-key>.jpg`. If found, that hero's `render` field points at the local
file (served from `http://localhost:<port>/hero-renders/<file>`). No local
file → `render` is `null`, and the consuming overlay falls back to the
portrait (or whatever fallback that scene defines). The check happens fresh
on every request, so dropping a file in here takes effect on the *next*
request — no server restart needed.

## Naming the file

Unlike map images, hero keys need **no normalization**. Overwatch heroes
already have a stable, machine-safe key from OverFast (lowercase,
hyphenated where the display name has a space or punctuation) — the
filename is that key, exactly, plus an extension. Check
`http://localhost:3001/api/heroes` (or whatever port the server is running
on) for the live, authoritative key list — new heroes get added to OverFast
over time and this table can drift.

A few examples, including the ones that aren't obvious from the display
name alone:

| Hero (display name) | OverFast key | Local filename |
| --- | --- | --- |
| D.Va | `dva` | `dva.png` |
| Soldier: 76 | `soldier-76` | `soldier-76.png` |
| Lúcio | `lucio` | `lucio.png` |
| Junker Queen | `junker-queen` | `junker-queen.png` |
| Wrecking Ball | `wrecking-ball` | `wrecking-ball.png` |
| Torbjörn | `torbjorn` | `torbjorn.png` |

Note the key strips accents (`Lúcio` -> `lucio`, `Torbjörn` -> `torbjorn`)
and punctuation (`Soldier: 76` -> `soldier-76`) — this is done upstream by
OverFast itself, not by any resolver code here, so when in doubt trust
`/api/heroes` over this table.

## Supported extensions and priority

`.png`, `.webp`, and `.jpg` (lowercase filenames — the check is
case-sensitive on Linux). If more than one exists for the same hero, `.png`
wins over `.webp`, which wins over `.jpg` — full-body renders are usually
sourced as transparent cutouts, and PNG/WebP preserve that; a `.jpg` will
render with an opaque background.

**Recommended:** transparent full-body PNG or WebP, at least **900px
tall**. These are composited over scene backgrounds on stream, so a short
or low-res source will look cramped or soft next to the rest of the frame.

## Do not commit images here

This folder is for local drop-ins only. Actual image files
(`*.png`/`*.webp`/`*.jpg`) are gitignored — only this README is tracked.
Sourcing the actual renders is tracked separately; this loader is just the
mechanism. The exact resolver lives in `server/hero-render-resolver.js`
(`findLocalHeroRender`) — when in doubt, that function is the source of
truth, not this README.
