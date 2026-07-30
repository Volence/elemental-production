import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parseLossless,
  stringifyLossless,
  applyTransform,
  processCollection,
  loadCamLayouts,
  SCENE_MAP,
  CAM_LAYOUTS,
  RawNum,
  COLLECTION_NAME_V2,
  OBS_BOUNDS_SCALE_INNER,
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
    expect(item.bounds_type).toBe(OBS_BOUNDS_SCALE_INNER); // 2 = OBS_BOUNDS_SCALE_INNER
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
        const rects = CAM_LAYOUTS[cfg.group][cfg.variant];
        for (const [camName, idx] of Object.entries(cfg.assign)) {
          const item = findItem(scene, camName);
          if (!item) continue; // e.g. Between Matches has no live cam source
          const rect = rects[idx];
          expect(item.pos).toEqual({ x: rect.x, y: rect.y });
          expect(item.bounds).toEqual({ x: rect.w, y: rect.h });
          expect(item.bounds_type).toBe(OBS_BOUNDS_SCALE_INNER);
          expect(item.alignment).toBe(OBS_ALIGN_TOP_LEFT);
          expect(item.bounds_alignment).toBe(OBS_ALIGN_CENTER);
          expect(item.locked).toBe(true);
        }
      }
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
