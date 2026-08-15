import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BROWSER_SOURCES } from './browser-sources.js';

const here = dirname(fileURLToPath(import.meta.url));
const collection = JSON.parse(
  readFileSync(join(here, '..', 'data', 'obs-scene-collection.json'), 'utf8')
);

/** Every overlay browser source shipped in the scene collection, by input name. */
function overlaySourcesFromCollection() {
  const out = [];
  for (const src of collection.sources || []) {
    if (src.id !== 'browser_source') continue;
    const url = (src.settings && src.settings.url) || '';
    if (!url.includes('/overlays/')) continue; // skips the empty-url caster cams
    out.push({ name: src.name, file: url.split('/overlays/')[1] });
  }
  return out;
}

describe('BROWSER_SOURCES', () => {
  it('covers every /overlays/ browser source in the shipped scene collection', () => {
    const names = new Set(BROWSER_SOURCES.map(([name]) => name));
    const missing = overlaySourcesFromCollection()
      .map(s => s.name)
      .filter(name => !names.has(name));
    expect(missing).toEqual([]);
  });

  it('points each source at the same overlay file the scene collection uses', () => {
    const byName = new Map(BROWSER_SOURCES);
    const mismatched = overlaySourcesFromCollection()
      .filter(s => byName.has(s.name) && byName.get(s.name) !== s.file)
      .map(s => `${s.name}: ${byName.get(s.name)} != ${s.file}`);
    expect(mismatched).toEqual([]);
  });

  it('has no duplicate input names', () => {
    const names = BROWSER_SOURCES.map(([name]) => name);
    expect(names.length).toBe(new Set(names).size);
  });
});
