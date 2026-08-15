import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_SCENES } from './scenes.js';
import { CANONICAL_SCENE_ORDER } from '../../scripts/build-scene-collection-v2.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const collection = JSON.parse(
  readFileSync(join(repoRoot, 'data', 'obs-scene-collection.json'), 'utf8')
);

describe('DEFAULT_SCENES', () => {
  it('matches the generator\'s canonical scene order', () => {
    expect(DEFAULT_SCENES).toEqual(CANONICAL_SCENE_ORDER);
  });

  it('matches the shipped scene collection\'s scene_order', () => {
    const shipped = (collection.scene_order || []).map(s => s.name);
    expect(DEFAULT_SCENES).toEqual(shipped);
  });
});
