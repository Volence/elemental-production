import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parseLossless,
  stringifyLossless,
  applyTransform,
  processCollection,
  loadCamLayouts,
  assertReviverSourceSupport,
  normalizeAssign,
  ensureOverlayScene,
  applyCarryover,
  isNonEmptyCarry,
  SCENE_MAP,
  CARRY_SOURCES,
  BAN_REVEAL,
  CAM_LAYOUTS,
  RawNum,
  COLLECTION_NAME_V2,
  OBS_BOUNDS_SCALE_OUTER,
  OBS_ALIGN_TOP_LEFT,
  OBS_ALIGN_CENTER,
  FILES,
} from './build-scene-collection-v2.mjs';

const OVERLAYS_DIR = fileURLToPath(new URL('../overlays/', import.meta.url));

function readCollection(file) {
  return { text: fs.readFileSync(file, 'utf8') };
}
function findScene(obj, name) {
  return (obj.sources || []).find((s) => s && s.id === 'scene' && s.name === name);
}
function findItem(scene, camName) {
  return ((scene.settings && scene.settings.items) || []).find((it) => it && it.name === camName);
}
// Unwrap a RawNum (or number) to a plain JS number for assertions.
function num(v) {
  return v instanceof RawNum ? Number(v.raw) : v;
}

describe('cam-layout bridge', () => {
  it('loads CAM_LAYOUTS from the CJS-guarded ES5 file', () => {
    const layouts = loadCamLayouts();
    expect(Object.keys(layouts).sort()).toEqual(['desk', 'flythrough', 'interview', 'wide']);
    expect(layouts.desk.dual).toHaveLength(2);
    // Same object the generator captured at module load.
    expect(CAM_LAYOUTS.desk.dual[0]).toEqual(layouts.desk.dual[0]);
  });
});

describe('applyTransform math', () => {
  it('writes pos/bounds/bounds_type/alignment from a rect', () => {
    const rect = { x: 330, y: 120, w: 580, h: 362 };
    const item = { name: 'Caster 1', pos: { x: 9, y: 9 }, scale: { x: 0.5, y: 0.5 }, bounds: { x: 0, y: 0 }, bounds_type: 0, alignment: 5, bounds_alignment: 0, locked: false };
    applyTransform(item, rect);
    expect(item.pos).toEqual({ x: 330, y: 120 });
    expect(num(item.bounds.x)).toBe(580);
    expect(num(item.bounds.y)).toBe(362);
    expect(item.bounds_type).toBe(OBS_BOUNDS_SCALE_OUTER); // 3 = OBS_BOUNDS_SCALE_OUTER (full-bleed, overflow masked by overlay)
    expect(item.alignment).toBe(OBS_ALIGN_TOP_LEFT); // 5 = top-left → pos is the box corner
    expect(item.bounds_alignment).toBe(OBS_ALIGN_CENTER); // 0 = content centered in box
    expect(item.locked).toBe(true);
  });

  it('resets scale to a neutral 1.0 float literal (bounds override scale)', () => {
    const item = { name: 'x', pos: {}, scale: { x: 0.2, y: 0.2 }, bounds: {}, bounds_type: 0 };
    applyTransform(item, { x: 0, y: 0, w: 100, h: 100 });
    expect(item.scale.x).toBeInstanceOf(RawNum);
    expect(item.scale.x.raw).toBe('1.0');
    expect(num(item.scale.x)).toBe(1);
  });
});

describe('guardrails', () => {
  it('reviver context.source is supported on this runtime (Node >= 21)', () => {
    // The assert exits the process on failure; on a supported runtime it is a
    // no-op. We assert it does NOT throw/exit here (Node 24 in CI).
    expect(() => assertReviverSourceSupport()).not.toThrow();
  });

  it('reports scene-missing when a mapped scene is absent (renamed scene guard)', () => {
    const obj = { name: 'x', sources: [] }; // no scenes at all
    const changes = processCollection(obj);
    const missing = changes.filter((c) => c.status === 'scene-missing');
    // Every SCENE_MAP entry should be flagged missing, none baked.
    expect(missing.length).toBe(Object.keys(SCENE_MAP).length);
    expect(changes.some((c) => c.status === 'baked')).toBe(false);
  });
});

describe('lossless serializer', () => {
  it('round-trips both committed collections byte-for-byte (preserves float literals)', () => {
    for (const file of FILES) {
      const { text } = readCollection(file);
      expect(stringifyLossless(parseLossless(text))).toBe(text);
    }
  });
});

describe('regenerated collections', () => {
  const files = FILES.map((f) => ({ file: f, obj: JSON.parse(readCollection(f).text) }));

  it('both JSONs parse and are renamed to the v2 collection', () => {
    for (const { obj } of files) {
      expect(obj.name).toBe(COLLECTION_NAME_V2);
      expect(Array.isArray(obj.sources)).toBe(true);
    }
  });

  it('is idempotent — re-processing a committed file yields identical bytes', () => {
    for (const file of FILES) {
      const { text } = readCollection(file);
      const obj = parseLossless(text);
      processCollection(obj);
      expect(stringifyLossless(obj)).toBe(text);
    }
  });

  it('bakes every mapped cam item onto its canonical rect', () => {
    for (const { obj } of files) {
      for (const [sceneName, cfg] of Object.entries(SCENE_MAP)) {
        const scene = findScene(obj, sceneName);
        expect(scene, `scene ${sceneName} exists`).toBeTruthy();
        for (const m of normalizeAssign(cfg)) {
          const item = findItem(scene, m.cam);
          if (!item) continue; // e.g. Between Matches has no live cam source
          const rect = CAM_LAYOUTS[m.group][m.variant][m.idx];
          expect(item.pos).toEqual({ x: rect.x, y: rect.y });
          expect(item.bounds).toEqual({ x: rect.w, y: rect.h });
          expect(item.bounds_type).toBe(OBS_BOUNDS_SCALE_OUTER);
          expect(item.alignment).toBe(OBS_ALIGN_TOP_LEFT);
          expect(item.bounds_alignment).toBe(OBS_ALIGN_CENTER);
          expect(item.locked).toBe(true);
        }
      }
    }
  });

  it('Interview scene has Caster 1/Caster 2 corner items at the canonical rects, behind the overlay BS', () => {
    for (const { obj } of files) {
      const scene = findScene(obj, 'Interview');
      const items = scene.settings.items;
      const [r0, r1] = CAM_LAYOUTS.interview.casters;
      const c1 = findItem(scene, 'Caster 1');
      const c2 = findItem(scene, 'Caster 2');
      expect(c1, 'Caster 1 baked into Interview').toBeTruthy();
      expect(c2, 'Caster 2 baked into Interview').toBeTruthy();
      expect(c1.pos).toEqual({ x: r0.x, y: r0.y });
      expect(c1.bounds).toEqual({ x: r0.w, y: r0.h });
      expect(c2.pos).toEqual({ x: r1.x, y: r1.y });
      expect(c2.bounds).toEqual({ x: r1.w, y: r1.h });
      // Cams must precede the overlay BS in z-order (earlier index = further back).
      const idxOf = (n) => items.findIndex((it) => it.name === n);
      expect(idxOf('Caster 1')).toBeLessThan(idxOf('Interview BS'));
      expect(idxOf('Caster 2')).toBeLessThan(idxOf('Interview BS'));
      // Wired to the shared global cam sources (unique ids within the scene).
      const globalC1 = obj.sources.find((s) => s.name === 'Caster 1' && s.id === 'browser_source');
      expect(c1.source_uuid).toBe(globalC1.uuid);
      const ids = items.map((it) => it.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('has a Ban Reveal scene + browser-source right after Map Pick', () => {
    for (const { obj } of files) {
      const scene = findScene(obj, 'Ban Reveal');
      expect(scene, 'Ban Reveal scene exists').toBeTruthy();
      const bs = obj.sources.find((s) => s.name === 'Ban Reveal BS' && s.id === 'browser_source');
      expect(bs).toBeTruthy();
      expect(bs.settings.url).toBe('http://localhost:3001/overlays/hero-bans.html');
      expect(bs.settings.width).toBe(1920);
      expect(bs.settings.height).toBe(1080);
      expect(bs.uuid).toBe(BAN_REVEAL.bsUuid);
      expect(scene.uuid).toBe(BAN_REVEAL.sceneUuid);
      // The scene holds the BS as a full-frame item.
      const item = scene.settings.items.find((it) => it.name === 'Ban Reveal BS');
      expect(item.source_uuid).toBe(bs.uuid);
      expect(item.bounds).toEqual({ x: 1920, y: 1080 });
      // scene_order (owner QA batch 3): the owner's canonical show-flow
      // order — Casters second, Map Pool BEFORE Map Pick, then Ban Reveal.
      const order = obj.scene_order.map((o) => o.name);
      expect(order.slice(0, 6)).toEqual([
        'Starting', 'Casters', 'Map Pool', 'Map Pick', 'Ban Reveal', 'Map Intro',
      ]);
    }
  });

  it('leaves non-caster cam scenes untouched (no full-frame bake on Map Pick/Intro/Gameplay/Series Winner)', () => {
    for (const { obj } of files) {
      for (const sceneName of ['Map Pick', 'Map Intro', 'Gameplay', 'Series Winner']) {
        const scene = findScene(obj, sceneName);
        const item = findItem(scene, 'Caster 1');
        if (item) expect(item.bounds_type).toBe(0); // never given a v2 bounds box
      }
    }
  });

  it('every non-empty browser-source overlay URL resolves to a file in overlays/', () => {
    for (const { obj } of files) {
      const browsers = obj.sources.filter((s) => s && s.id === 'browser_source');
      const checked = [];
      for (const src of browsers) {
        const url = (src.settings && src.settings.url) || '';
        if (!url) continue; // cam sources are intentionally blank (producer fills)
        const path = url.replace(/^https?:\/\/[^/]+\//, ''); // strip host → overlays/foo.html
        expect(path.startsWith('overlays/'), `${src.name} url under overlays/`).toBe(true);
        const abs = OVERLAYS_DIR + path.slice('overlays/'.length);
        expect(fs.existsSync(abs), `${src.name} -> ${path} exists`).toBe(true);
        checked.push(path);
      }
      expect(checked.length).toBeGreaterThan(10);
    }
  });
});

describe('ensureOverlayScene (2c, generalized in owner QA batch 3)', () => {
  // A minimal collection with a Map Pick scene but NO Ban Reveal.
  function bareCollection() {
    return {
      name: 'x',
      scene_order: [{ name: 'Starting' }, { name: 'Map Pick' }, { name: 'Map Intro' }],
      sources: [
        { name: 'Map Pick BS', id: 'browser_source', uuid: 'a-mp', settings: { url: 'x' } },
        { name: 'Starting', id: 'scene', uuid: 'e-s', settings: { items: [] } },
        { name: 'Map Pick', id: 'scene', uuid: 'e-mp', settings: { items: [] } },
        { name: 'Map Intro', id: 'scene', uuid: 'e-mi', settings: { items: [] } },
      ],
    };
  }

  it('creates the scene + browser-source + scene_order entry when absent', () => {
    const obj = bareCollection();
    const r = ensureOverlayScene(obj, BAN_REVEAL);
    expect(r.status).toBe('ban-reveal-created');
    const scene = obj.sources.find((s) => s.id === 'scene' && s.name === 'Ban Reveal');
    const bs = obj.sources.find((s) => s.id === 'browser_source' && s.name === 'Ban Reveal BS');
    expect(scene).toBeTruthy();
    expect(bs).toBeTruthy();
    expect(bs.settings.url).toContain('hero-bans.html');
    // Placed right after Map Pick in scene_order AND in the sources scene list.
    const order = obj.scene_order.map((o) => o.name);
    expect(order[order.indexOf('Map Pick') + 1]).toBe('Ban Reveal');
    const sceneNames = obj.sources.filter((s) => s.id === 'scene').map((s) => s.name);
    expect(sceneNames[sceneNames.indexOf('Map Pick') + 1]).toBe('Ban Reveal');
  });

  it('is idempotent — a second call is a no-op (no duplicates)', () => {
    const obj = bareCollection();
    ensureOverlayScene(obj, BAN_REVEAL);
    const afterFirst = JSON.stringify(obj);
    const r2 = ensureOverlayScene(obj, BAN_REVEAL);
    expect(r2.status).toBe('ban-reveal-present');
    expect(JSON.stringify(obj)).toBe(afterFirst);
    expect(obj.sources.filter((s) => s.name === 'Ban Reveal').length).toBe(1);
    expect(obj.scene_order.filter((o) => o.name === 'Ban Reveal').length).toBe(1);
  });
});

describe('applyCarryover (2d)', () => {
  function v2Collection() {
    return {
      sources: [
        { name: 'Caster 1', id: 'browser_source', settings: { url: '' } },
        { name: 'Caster 2', id: 'browser_source', settings: { url: 'http://existing/keep' } },
        { name: 'Interviewee', id: 'browser_source', settings: { url: '' } },
        { name: 'Replay', id: 'ffmpeg_source', settings: { local_file: '', looping: false } },
        { name: 'Background Music', id: 'ffmpeg_source', settings: { local_file: '', playlist: [] } },
        { name: 'Map Flythrough', id: 'ffmpeg_source', settings: { local_file: '' } }, // present in v2, absent from carry
      ],
    };
  }
  // Foreign (producer's live) collection to carry FROM.
  function carryMap() {
    return new Map([
      ['Caster 1', { settings: { url: 'http://cam/one' } }],
      ['Caster 2', { settings: { url: '' } }], // empty -> must NOT clobber
      ['Interviewee', { settings: { url: 'http://cam/iv', width: 1920 } }],
      ['Replay', { settings: { local_file: '/media/replay.mkv', is_local_file: true } }],
      ['Background Music', { settings: { local_file: '', playlist: [{ value: '/m/a.mp3' }] } }],
      // Map Flythrough / Map Music absent from carry entirely.
    ]);
  }

  it('carries non-empty values, never clobbers a non-empty v2 value with an empty carry', () => {
    const obj = v2Collection();
    const recs = applyCarryover(obj, carryMap());
    const get = (n) => obj.sources.find((s) => s.name === n).settings;
    expect(get('Caster 1').url).toBe('http://cam/one'); // carried
    expect(get('Caster 2').url).toBe('http://existing/keep'); // empty carry skipped
    expect(get('Interviewee').url).toBe('http://cam/iv'); // carried
    expect(get('Replay').local_file).toBe('/media/replay.mkv'); // carried
    expect(get('Replay').is_local_file).toBe(true); // carried (present)
    expect(get('Background Music').playlist).toEqual([{ value: '/m/a.mp3' }]); // carried
    expect(get('Background Music').local_file).toBe(''); // empty carry skipped

    const status = (n, k) => recs.find((r) => r.name === n && r.key === k).status;
    expect(status('Caster 1', 'url')).toBe('carried');
    expect(status('Caster 2', 'url')).toBe('skipped-empty');
    expect(status('Background Music', 'local_file')).toBe('skipped-empty');
    // A carry source that's entirely absent reports its keys as absent.
    expect(recs.some((r) => r.name === 'Map Flythrough' && r.status === 'absent')).toBe(true);
  });

  it('reports target-absent when a CARRY_SOURCES name is missing from v2', () => {
    const obj = { sources: [] };
    const recs = applyCarryover(obj, carryMap());
    // Every configured source is missing from this empty v2.
    for (const name of Object.keys(CARRY_SOURCES)) {
      expect(recs.some((r) => r.name === name && r.status === 'target-absent')).toBe(true);
    }
  });

  it('isNonEmptyCarry: blanks/empty-arrays skipped, non-blank strings/arrays/bools kept', () => {
    expect(isNonEmptyCarry('')).toBe(false);
    expect(isNonEmptyCarry('   ')).toBe(false);
    expect(isNonEmptyCarry('/x')).toBe(true);
    expect(isNonEmptyCarry([])).toBe(false);
    expect(isNonEmptyCarry([1])).toBe(true);
    expect(isNonEmptyCarry(false)).toBe(true);
    expect(isNonEmptyCarry(undefined)).toBe(false);
    expect(isNonEmptyCarry(null)).toBe(false);
  });
});
