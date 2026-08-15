// Known OBS browser sources and the overlay page each one should point at.
//
// Used to SEED stable URLs on a freshly imported (or hand-built) scene
// collection. The refresh pass does NOT use this list — it enumerates browser
// sources from OBS by URL instead, so renamed/producer-added sources still
// heal. Input names are case-sensitive and must match
// data/obs-scene-collection.json exactly (server/browser-sources.test.js
// enforces that).
export const BROWSER_SOURCES = [
  ['Gameplay HUD', 'gameplay-hud.html'],
  ['Casters BS', 'casters.html'],
  ['Casters Lobby BS', 'casters-lobby.html'],
  ['Casters Scoreboard BS', 'casters-scoreboard.html'],
  ['Casters Map Score BS', 'casters-map-score.html'],
  ['Final Stats BS', 'final-stats.html'],
  ['Series Winner BS', 'series-winner.html'],
  ['Between Matches BS', 'between-matches.html'],
  ['Starting Soon BS', 'starting-soon.html'],
  ['BRB BS', 'brb.html'],
  ['Interview BS', 'interview.html'],
  ['End Stream BS', 'end-of-stream.html'],
  ['Map Intro BS', 'map-intro.html'],
  ['Map Pick BS', 'map-pick.html'],
  ['Map Pool BS', 'map-pool.html'],
  ['Ban Reveal BS', 'hero-bans.html'],
  ['Casters Flythrough Hud', 'casters-flythrough-hud.html'],
];

export default BROWSER_SOURCES;
