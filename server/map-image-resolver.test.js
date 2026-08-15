import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizeMapName, findLocalMapImage } from './map-image-resolver.js';

describe('normalizeMapName', () => {
  it('resolves King’s Row (curly apostrophe, as returned by OverFast) to kings-row', () => {
    expect(normalizeMapName('King’s Row')).toBe('kings-row');
  });

  it('resolves King\'s Row (straight apostrophe) to kings-row too', () => {
    expect(normalizeMapName("King's Row")).toBe('kings-row');
  });

  it('strips accents from Paraíso -> paraiso', () => {
    expect(normalizeMapName('Paraíso')).toBe('paraiso');
  });

  it('normalizes a plain name unchanged apart from lowercasing', () => {
    expect(normalizeMapName('Numbani')).toBe('numbani');
  });

  it('collapses punctuation/whitespace runs into single hyphens', () => {
    expect(normalizeMapName('Watchpoint: Gibraltar')).toBe('watchpoint-gibraltar');
  });

  it('handles empty/nullish input without throwing', () => {
    expect(normalizeMapName('')).toBe('');
    expect(normalizeMapName(undefined)).toBe('');
    expect(normalizeMapName(null)).toBe('');
  });
});

describe('findLocalMapImage', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'map-images-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('finds a local .png for King’s Row via the normalized filename', () => {
    fs.writeFileSync(path.join(dir, 'kings-row.png'), 'fake');
    expect(findLocalMapImage('King’s Row', dir)).toBe('kings-row.png');
  });

  it('finds a local .jpg for an accented name', () => {
    fs.writeFileSync(path.join(dir, 'paraiso.jpg'), 'fake');
    expect(findLocalMapImage('Paraíso', dir)).toBe('paraiso.jpg');
  });

  it('finds a local .webp (shipped image pack format, same as hero renders)', () => {
    fs.writeFileSync(path.join(dir, 'neon-junction.webp'), 'fake');
    expect(findLocalMapImage('Neon Junction', dir)).toBe('neon-junction.webp');
  });

  // Load-bearing ordering (mirrors SUPPORTED_HERO_RENDER_EXTENSIONS): shipped
  // pack images are WebP, so a producer's jpg drop-in must outrank them.
  it('prefers a .jpg drop-in over a shipped .webp when both exist', () => {
    fs.writeFileSync(path.join(dir, 'kings-row.webp'), 'fake-webp');
    fs.writeFileSync(path.join(dir, 'kings-row.jpg'), 'fake-jpg');
    expect(findLocalMapImage('King’s Row', dir)).toBe('kings-row.jpg');
  });

  it('returns null when no local file exists', () => {
    expect(findLocalMapImage('Oasis', dir)).toBeNull();
  });

  it('returns null for an unreadable/missing directory instead of throwing', () => {
    expect(findLocalMapImage('Oasis', path.join(dir, 'does-not-exist'))).toBeNull();
  });
});
