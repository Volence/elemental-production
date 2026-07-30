# Local map images (drop-in pack)

The `/api/maps` route serves Overwatch map data (name, mode, screenshot URL)
from the [OverFast API](https://overfast-api.tekrop.fr/). OverFast's own
screenshots are sometimes low-resolution or blurry for specific maps — this
folder lets producers override individual maps with a higher-res local image
without touching any code.

**How it works:** on every `/api/maps` request, the server normalizes each
map's name (see below) and checks this folder for `<normalized-name>.jpg` or
`<normalized-name>.png`. If found, that map's `screenshot` field points at
the local file (served from `http://localhost:<port>/map-images/<file>`)
instead of the OverFast CDN URL. No local file → OverFast stays the
fallback, exactly like today. The check happens fresh on every request, so
dropping a file in here takes effect on the *next* poll — no server restart
needed.

## Naming the file

Take the map's name, lowercase it, strip accents and apostrophes (straight
`'` and curly `’` both), and replace any remaining run of spaces/punctuation
with a single hyphen. A few examples the loader specifically has to get
right, because the OverFast API returns Unicode punctuation a producer
wouldn't type by hand:

| Map name (as OverFast returns it) | Local filename |
| --- | --- |
| King’s Row *(curly apostrophe, U+2019)* | `kings-row.jpg` or `kings-row.png` |
| Paraíso *(accented í)* | `paraiso.jpg` or `paraiso.png` |
| Watchpoint: Gibraltar *(colon)* | `watchpoint-gibraltar.jpg` or `watchpoint-gibraltar.png` |

This is the same accent/punctuation-insensitive approach the dashboard
already uses for hero-name matching (see `heroNameToKey` in
`server/server.js` and `normHeroName` in `overlays/theme-helpers.js`),
extended to also strip curly apostrophes so King's Row resolves correctly.
The exact resolver lives in `server/map-image-resolver.js`
(`normalizeMapName`) — when in doubt, that function is the source of truth,
not this table.

## Supported extensions

`.jpg`, `.jpeg` and `.png` (lowercase filenames — the check is
case-sensitive on Linux). If more than one exists for the same map, the
first in that order wins. Recommended resolution: **1200px wide or
larger** — these are used full-bleed on stream, so anything smaller will
look soft.

## Priority: producers have flagged these as blurry

**King's Row** and **Antarctic Peninsula** are the maps producers have
specifically reported as blurry via the OverFast screenshot — if you're only
sourcing a handful of images to start, start with `kings-row` and
`antarctic-peninsula`.

## Current map pool (competitive gamemodes)

Maps used in competitive rotation (Control, Hybrid, Escort/Payload, Push,
Flashpoint, Clash). This list mirrors whatever OverFast's `/maps` endpoint
currently returns — if Blizzard adds/removes a map from the pool, this table
may drift; the loader itself always normalizes live data, this table is just
a reference generated from a snapshot of that data.

| OverFast map name | Modes | Filename (drop-in) |
| --- | --- | --- |
| Aatlis | flashpoint | `aatlis.jpg` / `.png` |
| Antarctic Peninsula | control | `antarctic-peninsula.jpg` / `.png` |
| Arena Victoriae | control | `arena-victoriae.jpg` / `.png` |
| Blizzard World | hybrid | `blizzard-world.jpg` / `.png` |
| Busan | control | `busan.jpg` / `.png` |
| Circuit Royal | escort | `circuit-royal.jpg` / `.png` |
| Colosseo | push | `colosseo.jpg` / `.png` |
| Dorado | escort | `dorado.jpg` / `.png` |
| Eichenwalde | hybrid | `eichenwalde.jpg` / `.png` |
| Esperança | push | `esperanca.jpg` / `.png` |
| Gogadoro | control | `gogadoro.jpg` / `.png` |
| Hanaoka | clash | `hanaoka.jpg` / `.png` |
| Havana | escort | `havana.jpg` / `.png` |
| Hollywood | hybrid | `hollywood.jpg` / `.png` |
| Ilios | control | `ilios.jpg` / `.png` |
| Junkertown | escort | `junkertown.jpg` / `.png` |
| King’s Row | hybrid | `kings-row.jpg` / `.png` |
| Lijiang Tower | control | `lijiang-tower.jpg` / `.png` |
| Midtown | hybrid | `midtown.jpg` / `.png` |
| Neon Junction | hybrid | `neon-junction.jpg` / `.png` |
| Nepal | control | `nepal.jpg` / `.png` |
| New Junk City | flashpoint | `new-junk-city.jpg` / `.png` |
| New Queen Street | push | `new-queen-street.jpg` / `.png` |
| Numbani | hybrid | `numbani.jpg` / `.png` |
| Oasis | control | `oasis.jpg` / `.png` |
| Paraíso | hybrid | `paraiso.jpg` / `.png` |
| Place Lacroix | push | `place-lacroix.jpg` / `.png` |
| Redwood Dam | push | `redwood-dam.jpg` / `.png` |
| Rialto | escort | `rialto.jpg` / `.png` |
| Route 66 | escort | `route-66.jpg` / `.png` |
| Runasapi | push | `runasapi.jpg` / `.png` |
| Samoa | control | `samoa.jpg` / `.png` |
| Shambali Monastery | escort | `shambali-monastery.jpg` / `.png` |
| Suravasa | flashpoint | `suravasa.jpg` / `.png` |
| Throne of Anubis | clash | `throne-of-anubis.jpg` / `.png` |
| Watchpoint: Gibraltar | escort | `watchpoint-gibraltar.jpg` / `.png` |
| Wuxing University | control | `wuxing-university.jpg` / `.png` |

## Other maps OverFast returns (non-competitive modes)

`/api/maps` passes through whatever OverFast returns, unfiltered — these
won't come up in a normal match but the loader will still pick up a local
file for them if you have a reason to add one (deathmatch/arcade overlays,
workshop showcases, etc).

| OverFast map name | Modes | Filename (drop-in) |
| --- | --- | --- |
| Ayutthaya | capture-the-flag | `ayutthaya.jpg` / `.png` |
| Black Forest | elimination | `black-forest.jpg` / `.png` |
| Castillo | elimination | `castillo.jpg` / `.png` |
| Château Guillard | deathmatch, team-deathmatch | `chateau-guillard.jpg` / `.png` |
| Ecopoint: Antarctica | elimination | `ecopoint-antarctica.jpg` / `.png` |
| Hanamura | assault | `hanamura.jpg` / `.png` |
| Horizon Lunar Colony | assault | `horizon-lunar-colony.jpg` / `.png` |
| Kanezaka | deathmatch, team-deathmatch | `kanezaka.jpg` / `.png` |
| Malevento | deathmatch, team-deathmatch | `malevento.jpg` / `.png` |
| Necropolis | elimination | `necropolis.jpg` / `.png` |
| Paris | assault | `paris.jpg` / `.png` |
| Petra | deathmatch, team-deathmatch | `petra.jpg` / `.png` |
| Powder Keg Mine | payload-race | `powder-keg-mine.jpg` / `.png` |
| Practice Range | practice-range | `practice-range.jpg` / `.png` |
| Temple of Anubis | assault | `temple-of-anubis.jpg` / `.png` |
| Thames District | payload-race | `thames-district.jpg` / `.png` |
| Volskaya Industries | assault | `volskaya-industries.jpg` / `.png` |
| Workshop Chamber | workshop | `workshop-chamber.jpg` / `.png` |
| Workshop Expanse | workshop | `workshop-expanse.jpg` / `.png` |
| Workshop Green Screen | workshop | `workshop-green-screen.jpg` / `.png` |
| Workshop Island | workshop | `workshop-island.jpg` / `.png` |

## Do not commit images here

This folder is for local drop-ins only. Actual image files
(`*.jpg`/`*.png`) are gitignored — only this README is tracked. Sourcing the
actual images is tracked separately; this loader is just the mechanism.
