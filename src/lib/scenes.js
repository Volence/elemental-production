// Canonical v2 scene order — keep in sync with CANONICAL_SCENE_ORDER in
// scripts/build-scene-collection-v2.mjs (the generator is the source of truth;
// this list mirrors data/obs-scene-collection.json's scene_order).
//
// Used as the scene-switcher fallback while OBS is disconnected, so the strip
// shows the real v2 scenes instead of a stale pre-v2 list.
export const DEFAULT_SCENES = [
  'Starting', 'Casters', 'Map Pool', 'Map Pick', 'Ban Reveal', 'Map Intro',
  'Casters Flythrough', 'Gameplay', 'Casters Lobby', 'Casters Scoreboard',
  'Map Score', 'Between Matches', 'BRB', 'Interview', 'Series Winner', 'Ending',
];

export default DEFAULT_SCENES;
