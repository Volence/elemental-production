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
const SCENE_MAP = {
  'Casters':            { group: 'desk',       variant: 'dual',   assign: { 'Caster 1': 0, 'Caster 2': 1 } },
  'Casters Lobby':      { group: 'desk',       variant: 'dual',   assign: { 'Caster 1': 0, 'Caster 2': 1 } },
  'Casters Scoreboard': { group: 'desk',       variant: 'dual',   assign: { 'Caster 1': 0, 'Caster 2': 1 } },
  'Map Score':          { group: 'desk',       variant: 'dual',   assign: { 'Caster 1': 0, 'Caster 2': 1 } },
  'Casters Flythrough': { group: 'flythrough', variant: 'dual',   assign: { 'Caster 1': 0, 'Caster 2': 1 } },
  'Between Matches':    { group: 'wide',       variant: 'single', assign: { 'Caster 1': 0 } },
  'Interview':          { group: 'interview',  variant: 'single', assign: { 'Interviewee': 0 } },
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

function processCollection(obj) {
  const changes = [];
  obj.name = COLLECTION_NAME_V2;

  const scenes = (obj.sources || []).filter((s) => s && s.id === 'scene');
  const byName = new Map(scenes.map((s) => [s.name, s]));

  for (const [sceneName, cfg] of Object.entries(SCENE_MAP)) {
    const scene = byName.get(sceneName);
    if (!scene) {
      changes.push({ scene: sceneName, cam: null, status: 'scene-missing' });
      continue;
    }
    const rects = ((CAM_LAYOUTS[cfg.group] || {})[cfg.variant]) || [];
    const items = (scene.settings && scene.settings.items) || [];
    for (const [camName, rectIdx] of Object.entries(cfg.assign)) {
      const rect = rects[rectIdx];
      const item = items.find((it) => it && it.name === camName);
      if (!rect) {
        changes.push({ scene: sceneName, cam: camName, status: 'rect-missing' });
        continue;
      }
      if (!item) {
        // Mapped cam source absent from this scene (e.g. Between Matches has no
        // live cam, only a Replay media source) — nothing to bake.
        changes.push({ scene: sceneName, cam: camName, status: 'source-absent', rect });
        continue;
      }
      applyTransform(item, rect);
      changes.push({ scene: sceneName, cam: camName, status: 'baked', rect });
    }
  }
  return changes;
}

function main() {
  assertReviverSourceSupport();
  const check = process.argv.includes('--check');
  let anyStale = false;
  const problems = []; // scene-missing / rect-missing across all files

  for (const file of FILES) {
    const orig = fs.readFileSync(file, 'utf8');
    const obj = parseLossless(orig);
    const changes = processCollection(obj);
    const out = stringifyLossless(obj);
    const stale = out !== orig;
    anyStale = anyStale || stale;

    const baked = changes.filter((c) => c.status === 'baked');
    const absent = changes.filter((c) => c.status === 'source-absent');
    const missing = changes.filter((c) => c.status === 'scene-missing' || c.status === 'rect-missing');
    console.log(`\n${file}`);
    console.log(`  collection name -> "${COLLECTION_NAME_V2}"`);
    for (const c of baked) {
      console.log(`  baked  ${c.scene} / ${c.cam}  pos ${c.rect.x},${c.rect.y}  bounds ${c.rect.w}x${c.rect.h}`);
    }
    for (const c of absent) {
      console.log(`  skip   ${c.scene} / ${c.cam}  (source not present in scene; rect ${c.rect.w}x${c.rect.h} reserved)`);
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

export { parseLossless, stringifyLossless, applyTransform, processCollection, loadCamLayouts, assertReviverSourceSupport, SCENE_MAP, CAM_LAYOUTS, RawNum, COLLECTION_NAME_V2, OBS_BOUNDS_SCALE_OUTER, OBS_ALIGN_TOP_LEFT, OBS_ALIGN_CENTER, FILES };
