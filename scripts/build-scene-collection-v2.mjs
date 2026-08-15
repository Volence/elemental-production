#!/usr/bin/env node
// Scene collection v2 generator (Broadcast Package v2, Plan 3, Task 9).
//
// Offline tool. Bakes the caster/interview cam browser-sources in the OBS scene
// collections so they sit EXACTLY behind the overlay cutout windows defined once
// in overlays/cam-layout.js (CAM_LAYOUTS). Each mapped scene's cam scene-item is
// given a bounds box (OBS_BOUNDS_SCALE_OUTER) whose top-left = rect x/y and whose
// size = rect w/h, so the 1920x1080 browser source FILLS the cutout edge-to-edge.
//
// Why SCALE_OUTER (3) and not SCALE_INNER (2): the cams are 16:9 but the desk
// cutouts are ~16:10, so inner-fit would letterbox ~18px of visible bands INSIDE
// the transparent window. The opaque overlay covers everything OUTSIDE the
// cutout, so SCALE_OUTER's overflow is harmlessly masked behind the overlay and
// the cam fills the window full-bleed (a slight side-crop of the 16:9 feed is
// expected and intentional).
//
// Design choices (see docs/scene-collection-v2-migration.md):
//   * The DUAL layout is baked as the default for every desk/flythrough scene.
//     Single-cam runtime states (casterLayout) live in the overlays, not here —
//     we do NOT bake multiple layout variants into one scene collection.
//   * Transitions are LEFT UNTOUCHED (Fade stays current; stinger WebM deferred).
//   * Scenes that carry cams but are NOT caster desks (Map Pick, Map Intro,
//     Gameplay, Series Winner) are intentionally left alone.
//
// Idempotent: running twice produces byte-identical output.
// Faithful: untouched bytes are preserved exactly (float literals like "1.0"
// are kept verbatim via a source-preserving parse), so the git diff shows ONLY
// the intended transform edits.
//
// REQUIRES Node >= 21 (Node 24 recommended): the faithful float-preserving parse
// relies on the JSON.parse reviver's `context.source` (added in Node 21). On
// older Node the script aborts early (see assertReviverSourceSupport) rather
// than emit noisy 1.0 -> 1 float diffs across untouched values.
//
// Usage: node scripts/build-scene-collection-v2.mjs [--check]
//   --check  Report what WOULD change and exit non-zero if the files are stale,
//            without writing (useful for CI / verifying idempotency).

import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

// overlays/cam-layout.js is ES5 with a CommonJS export guard. This repo is
// "type": "module", so under plain Node a `.js` file is ESM and createRequire
// would load it WITHOUT running the CJS guard (it works under vitest only
// because Vite transforms CJS interop). We instead execute the file in a vm
// sandbox that supplies a real `module`, so the guard runs and exports the
// canonical rects — the single source of truth shared with the overlay frames.
function loadCamLayouts() {
  const path = fileURLToPath(new URL('../overlays/cam-layout.js', import.meta.url));
  const src = fs.readFileSync(path, 'utf8');
  const mod = { exports: {} };
  vm.runInNewContext(src, { module: mod, exports: mod.exports }, { filename: path });
  return mod.exports.CAM_LAYOUTS;
}

const CAM_LAYOUTS = loadCamLayouts();

const COLLECTION_NAME_V2 = 'Elemental Production v2';

// OBS scene-item bounds type. OBS_BOUNDS_SCALE_OUTER (3) scales the source to
// COVER the box preserving aspect — the source fills the window edge-to-edge and
// any overflow (the 16:9-into-16:10 side spill) is masked by the opaque overlay
// outside the cutout. bounds_alignment 0 = centered in the box; item alignment
// 5 = top-left, so pos is the box's top-left corner.
const OBS_BOUNDS_SCALE_OUTER = 3;
const OBS_ALIGN_TOP_LEFT = 5;
const OBS_ALIGN_CENTER = 0;

// Scene name -> which CAM_LAYOUTS group/variant, and which cam source maps to
// which rect index within that variant's rect array. Assignment is by SOURCE
// NAME (never JSON item order). Only these scenes are touched.
//
// An assign value is EITHER a bare rect index (uses the entry's group/variant)
// OR a spec object { variant, idx, ensure } that overrides the variant within
// the entry's group and, when ensure:true, has the generator CREATE the cam
// scene-item if the scene doesn't already contain it (used for the Interview
// caster corner slots, which don't exist in the v1 collection). See
// normalizeAssign() below.
const SCENE_MAP = {
  'Casters':            { group: 'desk',       variant: 'dual',   assign: { 'Caster 1': 0, 'Caster 2': 1 } },
  'Casters Lobby':      { group: 'desk',       variant: 'dual',   assign: { 'Caster 1': 0, 'Caster 2': 1 } },
  'Casters Scoreboard': { group: 'desk',       variant: 'dual',   assign: { 'Caster 1': 0, 'Caster 2': 1 } },
  'Map Score':          { group: 'desk',       variant: 'dual',   assign: { 'Caster 1': 0, 'Caster 2': 1 } },
  // Final Stats is a caster DESK scene (final-stats.html paints the same
  // CAM_LAYOUTS.desk cutouts as the scoreboard), so its cams are baked onto
  // the desk rects — unlike Ban Reveal / Map Pool, whose copied cam items stay
  // offscreen-audio-only.
  'Final Stats':        { group: 'desk',       variant: 'dual',   assign: { 'Caster 1': 0, 'Caster 2': 1 } },
  'Casters Flythrough': { group: 'flythrough', variant: 'dual',   assign: { 'Caster 1': 0, 'Caster 2': 1 } },
  'Between Matches':    { group: 'wide',       variant: 'single', assign: { 'Caster 1': 0 } },
  'Interview':          { group: 'interview',  variant: 'single', assign: {
    'Interviewee': 0,
    'Caster 1': { variant: 'casters', idx: 0, ensure: true },
    'Caster 2': { variant: 'casters', idx: 1, ensure: true },
  } },
};

// Normalize an entry's `assign` map into a flat list of resolved cam mappings:
// { cam, group, variant, idx, ensure }. A bare-number value inherits the
// entry's group/variant and never ensures; a spec object may override variant
// (within the same group) and request ensure-create.
function normalizeAssign(cfg) {
  const out = [];
  for (const [cam, spec] of Object.entries(cfg.assign)) {
    if (typeof spec === 'number') {
      out.push({ cam, group: cfg.group, variant: cfg.variant, idx: spec, ensure: false });
    } else {
      out.push({
        cam,
        group: spec.group || cfg.group,
        variant: spec.variant || cfg.variant,
        idx: spec.idx,
        ensure: !!spec.ensure,
      });
    }
  }
  return out;
}

// ---- Ban Reveal scene (owner QA batch 1) --------------------------------
// The generator ensures a "Ban Reveal" scene exists (idempotently): a scene
// source holding one full-frame "Ban Reveal BS" browser_source pointed at the
// hero-bans overlay, plus a scene_order entry immediately after "Map Pick".
// UUIDs are FIXED literals (next in each family's series: browser sources
// a0000001-000X, scenes e0000005-000X) so re-running never mints new ids and
// the ensure step stays a no-op once present.
const BAN_REVEAL = {
  sceneName: 'Ban Reveal',
  sceneUuid: 'e0000005-000f-4000-8000-00000000000f',
  bsName: 'Ban Reveal BS',
  bsUuid: 'a0000001-000f-4000-8000-00000000000f',
  url: 'http://localhost:3001/overlays/hero-bans.html',
  afterScene: 'Map Pick',
  afterBs: 'Map Pick BS',
};

// ---- Map Pool scene (owner QA batch 3) ----------------------------------
// Season pool board (map-pool.html + state.mapPool from Settings). Sits
// between Map Pick and Ban Reveal in the scene order — the producer shows it
// during pick/ban comms. Same fixed-UUID idempotent ensure as Ban Reveal
// (next literals in each family's series: 0x10).
const MAP_POOL = {
  sceneName: 'Map Pool',
  sceneUuid: 'e0000005-0010-4000-8000-000000000010',
  bsName: 'Map Pool BS',
  bsUuid: 'a0000001-0010-4000-8000-000000000010',
  url: 'http://localhost:3001/overlays/map-pool.html',
  afterScene: 'Map Pick',
  afterBs: 'Map Pick BS',
};

// ---- Final Stats scene (v2.1.0 item 15) ---------------------------------
// Series totals across every played map (final-stats.html). A caster DESK
// scene like Map Score — the casters talk the numbers through — so it sits
// immediately after 'Map Score' in the show flow and carries the same
// pick/ban audio items via ensureSceneAudio. Same fixed-UUID idempotent
// ensure as Ban Reveal / Map Pool (next literals in each family: 0x11).
const FINAL_STATS = {
  sceneName: 'Final Stats',
  sceneUuid: 'e0000005-0011-4000-8000-000000000011',
  bsName: 'Final Stats BS',
  bsUuid: 'a0000001-0011-4000-8000-000000000011',
  url: 'http://localhost:3001/overlays/final-stats.html',
  afterScene: 'Map Score',
  afterBs: 'Casters Map Score BS',
};

// ---- Settings carryover (owner QA batch 1) ------------------------------
// `--carry-from <path>` reads another OBS scene-collection JSON (e.g. the
// producer's live collection under ~/.config/obs-studio/basic/scenes/) and
// copies the producer's own settings BY SOURCE NAME into both v2 files, so a
// re-import doesn't wipe their camera URLs / media paths. Only NON-EMPTY carry
// values are copied — an empty value in the carry file never clobbers a
// non-empty value already in v2.
const CARRY_SOURCES = {
  'Caster 1':                 ['url'],
  'Caster 2':                 ['url'],
  'Interviewee':              ['url'],
  'Background Music':         ['local_file', 'playlist', 'is_local_file'],
  'Casters Background Music': ['local_file', 'playlist', 'is_local_file'],
  'Map Flythrough':           ['local_file', 'playlist', 'is_local_file'],
  'Map Music':                ['local_file', 'playlist', 'is_local_file'],
  'Replay':                   ['local_file', 'playlist', 'is_local_file'],
};

const FILES = [
  fileURLToPath(new URL('../data/obs-scene-collection.json', import.meta.url)),
  fileURLToPath(new URL('../data/obs-scene-collection-windows.json', import.meta.url)),
];

// ---- Lossless JSON: preserve the exact source literal of every number so
// untouched values (e.g. "1.0") round-trip byte-for-byte. -------------------
class RawNum {
  constructor(raw) { this.raw = raw; }
}

// The float-preserving parse depends on the reviver's `context.source` (Node
// >= 21). If it is unavailable, parseLossless silently collapses "1.0" -> "1"
// and would rewrite many untouched values, so abort loudly instead.
function assertReviverSourceSupport() {
  let ok = false;
  JSON.parse('1.0', (k, v, ctx) => {
    if (ctx && typeof ctx.source === 'string') ok = true;
    return v;
  });
  if (!ok) {
    console.error(
      'ERROR: this Node runtime lacks JSON.parse reviver context.source ' +
      '(need Node >= 21; Node 24 recommended). Current: ' + process.version + '.\n' +
      'Refusing to run: without it the generator would emit noisy 1.0 -> 1 ' +
      'float diffs across untouched scene-collection values.'
    );
    process.exit(2);
  }
}

function parseLossless(text) {
  return JSON.parse(text, function (key, value, ctx) {
    if (typeof value === 'number' && ctx && typeof ctx.source === 'string') {
      return new RawNum(ctx.source);
    }
    return value;
  });
}

// Faithful reproduction of JSON.stringify(x, null, 2) formatting, except a
// RawNum emits its preserved literal verbatim. String/number/boolean escaping
// is delegated to JSON.stringify so it matches exactly.
function stringifyLossless(value, indent) {
  indent = indent || '';
  const child = indent + '  ';
  if (value instanceof RawNum) return value.raw;
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number' || t === 'boolean' || t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return '[\n' + value.map((v) => child + stringifyLossless(v, child)).join(',\n') + '\n' + indent + ']';
  }
  if (t === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    return '{\n' + keys.map((k) => child + JSON.stringify(k) + ': ' + stringifyLossless(value[k], child)).join(',\n') + '\n' + indent + '}';
  }
  return JSON.stringify(value);
}

// Apply the canonical transform for `rect` onto an OBS scene-item in place.
function applyTransform(item, rect) {
  item.pos = { x: rect.x, y: rect.y };
  item.bounds = { x: rect.w, y: rect.h };
  item.bounds_type = OBS_BOUNDS_SCALE_OUTER;
  item.bounds_alignment = OBS_ALIGN_CENTER;
  item.alignment = OBS_ALIGN_TOP_LEFT;
  // Scale is ignored by OBS once bounds are set; reset to a neutral 1.0 so a
  // producer inspecting the item is not misled by a stale fit-scale. Kept as a
  // float literal to match this file's scale-is-always-float convention.
  item.scale = { x: new RawNum('1.0'), y: new RawNum('1.0') };
  item.locked = true;
}

// Build a fresh OBS scene-item in the collection's house key-order (mirrors an
// existing cam item). Transform fields are placeholders; applyTransform() then
// overwrites pos/bounds/bounds_type/alignment/scale/locked in place, preserving
// key order.
function makeSceneItem(name, sourceUuid, id) {
  return {
    name: name,
    source_uuid: sourceUuid,
    pos: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rot: 0,
    alignment: OBS_ALIGN_TOP_LEFT,
    bounds_type: 0,
    bounds_alignment: OBS_ALIGN_CENTER,
    bounds: { x: 0, y: 0 },
    crop_left: 0,
    crop_top: 0,
    crop_right: 0,
    crop_bottom: 0,
    id: id,
    group_item_backup: false,
    scale_filter: 'disable',
    blend_type: 'normal',
    visible: true,
    locked: false,
  };
}

// A full-frame (1920x1080, "Scale to inner bounds" type 2) scene-item — the
// shape every "...BS" overlay browser-source uses inside its scene.
function makeOverlayItem(name, sourceUuid, id) {
  const it = makeSceneItem(name, sourceUuid, id);
  it.bounds_type = 2;
  it.bounds = { x: 1920, y: 1080 };
  it.locked = true;
  return it;
}

// Ensure an overlay scene + its browser-source exist (idempotent) — used for
// Ban Reveal and Map Pool. Adds the browser_source right after spec.afterBs,
// the scene right after spec.afterScene in `sources`, and a scene_order entry
// right after spec.afterScene. Returns a change record (created | present).
function ensureOverlayScene(obj, spec) {
  const sources = obj.sources || (obj.sources = []);
  const hasScene = sources.some((s) => s && s.id === 'scene' && s.name === spec.sceneName);
  if (hasScene) return { status: spec.sceneName.toLowerCase().replace(' ', '-') + '-present' };

  // Browser source — mirror the "Map Pick BS" shape exactly.
  const bs = {
    prev_ver: 29,
    name: spec.bsName,
    uuid: spec.bsUuid,
    versioned_id: 'browser_source',
    id: 'browser_source',
    settings: {
      url: spec.url,
      width: 1920,
      height: 1080,
      css: '',
      reroute_audio: false,
    },
    mixers: 0,
    sync: 0,
    flags: 0,
    volume: 1,
    deinterlace_mode: 0,
    deinterlace_field_order: 0,
    monitoring_type: 0,
    private_settings: {},
  };

  // Scene source — mirror the "Map Pick" scene shape (one full-frame BS item).
  const scene = {
    prev_ver: 29,
    name: spec.sceneName,
    uuid: spec.sceneUuid,
    versioned_id: 'scene',
    id: 'scene',
    settings: {
      items: [makeOverlayItem(spec.bsName, spec.bsUuid, 1)],
      custom_size: false,
      id_counter: 1,
    },
    mixers: 0,
    sync: 0,
    flags: 0,
    volume: 1,
    deinterlace_mode: 0,
    deinterlace_field_order: 0,
    monitoring_type: 0,
    private_settings: {},
  };

  const insertAfter = (arr, pred, item) => {
    const i = arr.findIndex(pred);
    if (i === -1) arr.push(item); else arr.splice(i + 1, 0, item);
  };
  insertAfter(sources, (s) => s && s.name === spec.afterBs, bs);
  insertAfter(sources, (s) => s && s.id === 'scene' && s.name === spec.afterScene, scene);

  const order = obj.scene_order || (obj.scene_order = []);
  if (!order.some((o) => o && o.name === spec.sceneName)) {
    insertAfter(order, (o) => o && o.name === spec.afterScene, { name: spec.sceneName });
  }

  return { status: spec.sceneName.toLowerCase().replace(' ', '-') + '-created' };
}

// Ensure the Ban Reveal scene carries caster audio (owner QA batch 3): the
// producer calls the pick/ban phase live, so the scene needs 'Caster 1',
// 'Caster 2' and 'Casters Background Music' just like Map Pick has. Items are
// DEEP-COPIED from the Map Pick scene's own items (same source_uuid, same
// transform) — Map Pick's caster items use the negative-tiny-scale trick that
// renders the cam offscreen while keeping its audio active, and copying the
// exact transform preserves that behaviour without re-deriving it. Idempotent:
// an item already present (by name) is never duplicated.
const BAN_REVEAL_AUDIO_ITEMS = ['Caster 1', 'Caster 2', 'Casters Background Music'];

function ensureSceneAudio(obj, sceneName) {
  const sources = obj.sources || [];
  const banScene = sources.find((s) => s && s.id === 'scene' && s.name === sceneName);
  const pickScene = sources.find((s) => s && s.id === 'scene' && s.name === 'Map Pick');
  if (!banScene || !pickScene) return { status: sceneName + '-audio-scenes-missing' };

  const banItems = banScene.settings.items || (banScene.settings.items = []);
  const pickItems = pickScene.settings.items || [];

  // Both helpers must respect the lossless-JSON RawNum wrappers: a naive
  // JSON round-trip deep copy would flatten RawNum instances into plain
  // {"raw": "..."} objects, and arithmetic on a wrapped counter would
  // string-concatenate. (Both happened; hence the explicit handling.)
  const deepCopyLossless = (v) => {
    if (v instanceof RawNum) return new RawNum(v.raw);
    if (Array.isArray(v)) return v.map(deepCopyLossless);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v)) out[k] = deepCopyLossless(v[k]);
      return out;
    }
    return v;
  };
  const numOf = (v) => (v instanceof RawNum ? parseInt(v.raw, 10) : (typeof v === 'number' ? v : 0));

  let counter = numOf(banScene.settings.id_counter);
  const added = [];
  for (const name of BAN_REVEAL_AUDIO_ITEMS) {
    if (banItems.some((it) => it && it.name === name)) continue;
    const src = pickItems.find((it) => it && it.name === name);
    if (!src) { added.push(`${name}: absent-in-map-pick`); continue; }
    const copy = deepCopyLossless(src);
    counter += 1;
    copy.id = new RawNum(String(counter));
    banItems.push(copy);
    added.push(name);
  }
  banScene.settings.id_counter = new RawNum(String(counter));
  return { status: added.length ? `${sceneName} audio added: ${added.join(', ')}` : sceneName + '-audio-present' };
}

// ---- Scene-item z-order policy (owner QA batch 3 release sweep) ----------
// OBS renders a scene's `items` array bottom -> top. The v2 design rule is:
// video FEEDS sit at the bottom (game capture, flythrough video, replay,
// caster/interview cams — the overlay frames them through its transparent
// cutouts), the overlay BROWSER SOURCE sits above them, and audio-only
// sources ride on top (they draw nothing). This pass STABLE-sorts every
// scene's items by that class rank, which fixes the long-standing Between
// Matches defect (its overlay sat BELOW the Replay, so the replay's
// SCALE_OUTER overspill wasn't masked) and pins the convention for every
// future scene. Stable = relative order within a class is preserved, so
// re-running is a byte-identical no-op.
const FEED_SOURCES = new Set([
  'Overwatch', 'Map Flythrough', 'Replay', 'Interviewee', 'Caster 1', 'Caster 2',
]);
const OVERLAY_SOURCES = new Set([
  'Starting Soon BS', 'Map Pick BS', 'Map Pool BS', 'Ban Reveal BS',
  'Map Intro BS', 'Casters Flythrough Hud', 'Gameplay HUD', 'Casters BS',
  'Casters Lobby BS', 'Casters Scoreboard BS', 'Casters Map Score BS',
  'Final Stats BS', 'Between Matches BS', 'BRB BS', 'Interview BS',
  'Series Winner BS', 'End Stream BS',
]);

function itemRank(name) {
  if (FEED_SOURCES.has(name)) return 0;
  if (OVERLAY_SOURCES.has(name)) return 1;
  return 2; // audio-only / anything else — draws nothing, rides on top
}

// ---- Canonical scene order (owner QA batch 3 release sweep) ---------------
// The owner's preferred show-flow order for the OBS scene list. Any scene not
// listed here (a producer's custom scene) keeps its relative position at the
// END of the list. Idempotent: reordering an already-ordered list is a no-op.
const CANONICAL_SCENE_ORDER = [
  'Starting', 'Casters', 'Map Pool', 'Map Pick', 'Ban Reveal', 'Map Intro',
  'Casters Flythrough', 'Gameplay', 'Casters Lobby', 'Casters Scoreboard',
  'Map Score', 'Final Stats', 'Between Matches', 'BRB', 'Interview',
  'Series Winner', 'Ending',
];

function enforceSceneOrder(obj) {
  const order = obj.scene_order || [];
  const rank = new Map(CANONICAL_SCENE_ORDER.map((n, i) => [n, i]));
  const before = order.map((o) => o.name).join('|');
  // Stable sort: known scenes by canonical rank, unknown scenes after them
  // (Infinity) preserving their relative order.
  order.sort((a, b) =>
    (rank.has(a.name) ? rank.get(a.name) : Infinity) -
    (rank.has(b.name) ? rank.get(b.name) : Infinity));
  const after = order.map((o) => o.name).join('|');
  return { status: before === after ? 'scene-order ok' : 'scene-order fixed' };
}

function enforceItemOrder(obj) {
  const changed = [];
  for (const s of obj.sources || []) {
    if (!s || s.id !== 'scene' || !s.settings || !Array.isArray(s.settings.items)) continue;
    const before = s.settings.items.map((it) => it.name).join('|');
    // Array.prototype.sort is stable in modern V8; rank ties keep file order.
    s.settings.items.sort((a, b) => itemRank(a.name) - itemRank(b.name));
    const after = s.settings.items.map((it) => it.name).join('|');
    if (before !== after) changed.push(s.name);
  }
  return { status: changed.length ? `item-order fixed: ${changed.join(', ')}` : 'item-order ok' };
}

// True if a carry value is worth copying. Strings must be non-blank; arrays
// (playlist) must be non-empty; booleans (is_local_file) always count as
// present. Anything else (null/undefined) is skipped.
function isNonEmptyCarry(v) {
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'boolean') return true;
  return false;
}

// Copy the producer's own source settings (by name) from a foreign collection
// into `obj`. Only non-empty carry values are written; an empty carry value
// never clobbers an existing v2 value. `carryByName` is Map<name, settings>.
// Returns per-(source,key) records: carried | skipped-empty | absent.
function applyCarryover(obj, carryByName) {
  const records = [];
  const byName = new Map((obj.sources || []).filter((s) => s && s.name).map((s) => [s.name, s]));
  for (const [name, keys] of Object.entries(CARRY_SOURCES)) {
    const target = byName.get(name);
    const src = carryByName.get(name);
    if (!target) { records.push({ name, key: null, status: 'target-absent' }); continue; }
    const targetSettings = target.settings || (target.settings = {});
    const srcSettings = (src && src.settings) || null;
    for (const key of keys) {
      if (!srcSettings || !(key in srcSettings)) { records.push({ name, key, status: 'absent' }); continue; }
      const val = srcSettings[key];
      if (!isNonEmptyCarry(val)) { records.push({ name, key, status: 'skipped-empty' }); continue; }
      targetSettings[key] = val;
      records.push({ name, key, status: 'carried' });
    }
  }
  return records;
}

function processCollection(obj) {
  const changes = [];
  obj.name = COLLECTION_NAME_V2;

  // Ensure the Ban Reveal scene exists BEFORE the cam-bake pass (so the pass
  // sees a complete collection). Idempotent.
  const banReveal = ensureOverlayScene(obj, BAN_REVEAL);
  changes.push({ scene: BAN_REVEAL.sceneName, cam: null, status: banReveal.status });
  // Map Pool inserts after Map Pick too — ensured AFTER Ban Reveal so the
  // final scene order reads Map Pick -> Map Pool -> Ban Reveal.
  const mapPool = ensureOverlayScene(obj, MAP_POOL);
  changes.push({ scene: MAP_POOL.sceneName, cam: null, status: mapPool.status });
  // Final Stats (v2.1.0 item 15) inserts after Map Score. Its caster items are
  // copied by ensureSceneAudio below and then re-baked onto the desk cutout
  // rects by the SCENE_MAP pass (it IS a desk scene), so the casters are both
  // audible and visible.
  const finalStats = ensureOverlayScene(obj, FINAL_STATS);
  changes.push({ scene: FINAL_STATS.sceneName, cam: null, status: finalStats.status });
  for (const audioScene of [BAN_REVEAL.sceneName, MAP_POOL.sceneName, FINAL_STATS.sceneName]) {
    const audio = ensureSceneAudio(obj, audioScene);
    changes.push({ scene: audioScene, cam: null, status: audio.status });
  }

  // Enforce the feeds < overlay < audio z-order convention on every scene
  // (AFTER the ensure steps so newly added items are covered too).
  const itemOrder = enforceItemOrder(obj);
  changes.push({ scene: '(all)', cam: null, status: itemOrder.status });

  // Enforce the owner's canonical scene-list order (after the ensure steps'
  // positional inserts — this pass is the final authority on ordering).
  const sceneOrder = enforceSceneOrder(obj);
  changes.push({ scene: '(all)', cam: null, status: sceneOrder.status });

  const scenes = (obj.sources || []).filter((s) => s && s.id === 'scene');
  const byName = new Map(scenes.map((s) => [s.name, s]));
  // Global source lookup for ensure-create (a scene-item's source_uuid must
  // equal the global source's uuid).
  const globalByName = new Map((obj.sources || []).filter((s) => s && s.name).map((s) => [s.name, s]));

  for (const [sceneName, cfg] of Object.entries(SCENE_MAP)) {
    const scene = byName.get(sceneName);
    if (!scene) {
      changes.push({ scene: sceneName, cam: null, status: 'scene-missing' });
      continue;
    }
    const settings = scene.settings || (scene.settings = {});
    const items = settings.items || (settings.items = []);
    for (const m of normalizeAssign(cfg)) {
      const rects = ((CAM_LAYOUTS[m.group] || {})[m.variant]) || [];
      const rect = rects[m.idx];
      let item = items.find((it) => it && it.name === m.cam);
      if (!rect) {
        changes.push({ scene: sceneName, cam: m.cam, status: 'rect-missing' });
        continue;
      }
      if (!item && m.ensure) {
        // Create the missing cam scene-item, wiring it to the global source of
        // the same name and inserting it just after the last cam already in
        // the scene (cams sit BELOW the overlay "...BS" in z-order — earlier
        // array index = further back — so they show THROUGH the cutout).
        const globalSrc = globalByName.get(m.cam);
        if (!globalSrc) {
          changes.push({ scene: sceneName, cam: m.cam, status: 'global-source-absent' });
          continue;
        }
        const raw = settings.id_counter;
        const prevId = (raw instanceof RawNum) ? Number(raw.raw) : (typeof raw === 'number' ? raw : items.length);
        const nextId = prevId + 1;
        settings.id_counter = nextId;
        item = makeSceneItem(m.cam, globalSrc.uuid, nextId);
        // Insert right after the LAST existing cam item so cams stay grouped
        // and in mapping order, all preceding the overlay "...BS" in z-order.
        const CAM_ITEM_NAMES = ['Interviewee', 'Caster 1', 'Caster 2'];
        let insertIdx = 0;
        for (let i = 0; i < items.length; i++) {
          if (items[i] && CAM_ITEM_NAMES.indexOf(items[i].name) !== -1) insertIdx = i + 1;
        }
        items.splice(insertIdx, 0, item);
        applyTransform(item, rect);
        changes.push({ scene: sceneName, cam: m.cam, status: 'created', rect });
        continue;
      }
      if (!item) {
        // Mapped cam source absent from this scene (e.g. Between Matches has no
        // live cam, only a Replay media source) — nothing to bake.
        changes.push({ scene: sceneName, cam: m.cam, status: 'source-absent', rect });
        continue;
      }
      applyTransform(item, rect);
      changes.push({ scene: sceneName, cam: m.cam, status: 'baked', rect });
    }
  }
  return changes;
}

// Read a foreign OBS collection JSON and index its sources by name. Plain
// JSON.parse is fine — we only read values OUT of it, never re-serialize it.
function loadCarrySources(carryPath) {
  const text = fs.readFileSync(carryPath, 'utf8');
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    console.error(`ERROR: --carry-from file is not valid JSON (${carryPath}): ${e.message}`);
    console.error('Expected an OBS scene-collection JSON (e.g. ~/.config/obs-studio/basic/scenes/<Collection>.json).');
    process.exit(2);
  }
  const map = new Map();
  for (const s of (obj.sources || [])) {
    if (s && s.name && !map.has(s.name)) map.set(s.name, s);
  }
  return map;
}

function main() {
  assertReviverSourceSupport();
  const check = process.argv.includes('--check');
  const carryIdx = process.argv.indexOf('--carry-from');
  const carryPath = carryIdx !== -1 ? process.argv[carryIdx + 1] : null;
  if (carryIdx !== -1 && !carryPath) {
    console.error('ERROR: --carry-from requires a path to an OBS scene-collection JSON.');
    process.exit(2);
  }
  let carryByName = null;
  if (carryPath) {
    if (!fs.existsSync(carryPath)) {
      console.error(`ERROR: --carry-from file not found: ${carryPath}`);
      process.exit(2);
    }
    carryByName = loadCarrySources(carryPath);
    console.log(`Carryover source: ${carryPath} (${carryByName.size} named sources)`);
  }

  let anyStale = false;
  const problems = []; // scene-missing / rect-missing across all files

  for (const file of FILES) {
    const orig = fs.readFileSync(file, 'utf8');
    const obj = parseLossless(orig);
    const changes = processCollection(obj);
    let carryRecords = null;
    if (carryByName) carryRecords = applyCarryover(obj, carryByName);
    const out = stringifyLossless(obj);
    const stale = out !== orig;
    anyStale = anyStale || stale;

    const baked = changes.filter((c) => c.status === 'baked');
    const created = changes.filter((c) => c.status === 'created');
    const absent = changes.filter((c) => c.status === 'source-absent');
    const missing = changes.filter((c) => c.status === 'scene-missing' || c.status === 'rect-missing' || c.status === 'global-source-absent');
    const banReveal = changes.find((c) => c.status === 'ban-reveal-created' || c.status === 'ban-reveal-present');
    console.log(`\n${file}`);
    console.log(`  collection name -> "${COLLECTION_NAME_V2}"`);
    if (banReveal) {
      console.log(`  ban-reveal  ${banReveal.status === 'ban-reveal-created' ? 'CREATED scene + browser-source + scene_order entry' : 'already present (no-op)'}`);
    }
    for (const c of baked) {
      console.log(`  baked  ${c.scene} / ${c.cam}  pos ${c.rect.x},${c.rect.y}  bounds ${c.rect.w}x${c.rect.h}`);
    }
    for (const c of created) {
      console.log(`  create ${c.scene} / ${c.cam}  pos ${c.rect.x},${c.rect.y}  bounds ${c.rect.w}x${c.rect.h}  (new scene-item)`);
    }
    for (const c of absent) {
      console.log(`  skip   ${c.scene} / ${c.cam}  (source not present in scene; rect ${c.rect.w}x${c.rect.h} reserved)`);
    }
    if (carryRecords) {
      const carried = carryRecords.filter((r) => r.status === 'carried');
      const skippedEmpty = carryRecords.filter((r) => r.status === 'skipped-empty');
      const carryAbsent = carryRecords.filter((r) => r.status === 'absent' || r.status === 'target-absent');
      console.log(`  carryover: ${carried.length} carried, ${skippedEmpty.length} skipped-empty, ${carryAbsent.length} absent`);
      for (const r of carried) console.log(`    carried  ${r.name}.${r.key}`);
      for (const r of carryAbsent) console.log(`    absent   ${r.name}${r.key ? '.' + r.key : ' (source not in v2)'}`);
    }
    // A missing SCENE or missing RECT means the mapping no longer matches the
    // collection (e.g. a scene was renamed in OBS) — surface it loudly so it
    // can never silently no-op, and fail the run.
    for (const c of missing) {
      const what = c.status === 'scene-missing'
        ? `scene "${c.scene}" not found in collection (renamed or removed?)`
        : `no rect for ${c.scene} / ${c.cam} in CAM_LAYOUTS (bad SCENE_MAP index?)`;
      console.error(`  WARN   ${what}`);
      problems.push(`${file}: ${what}`);
    }
    console.log(`  ${stale ? 'STALE -> ' + (check ? 'would write' : 'writing') : 'up to date (no change)'}`);

    if (stale && !check) fs.writeFileSync(file, out);
  }

  if (problems.length) {
    console.error(`\nERROR: ${problems.length} mapping problem(s) — SCENE_MAP is out of sync with the collections:`);
    for (const p of problems) console.error('  - ' + p);
    process.exit(3);
  }

  if (check && anyStale) {
    console.error('\n--check: files are stale (would change). Run without --check to regenerate.');
    process.exit(1);
  }
  console.log('\nDone.');
}

// Only run when executed directly (node scripts/build-scene-collection-v2.mjs).
// Guarded so tests can import the pure helpers without writing any files.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { CANONICAL_SCENE_ORDER, OVERLAY_SOURCES, parseLossless, stringifyLossless, applyTransform, processCollection, loadCamLayouts, assertReviverSourceSupport, normalizeAssign, makeSceneItem, makeOverlayItem, ensureOverlayScene, ensureSceneAudio, applyCarryover, isNonEmptyCarry, loadCarrySources, SCENE_MAP, CARRY_SOURCES, BAN_REVEAL, MAP_POOL, FINAL_STATS, CAM_LAYOUTS, RawNum, COLLECTION_NAME_V2, OBS_BOUNDS_SCALE_OUTER, OBS_ALIGN_TOP_LEFT, OBS_ALIGN_CENTER, FILES };
