import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { findLocalHeroRender } from './hero-render-resolver.js';

describe('findLocalHeroRender', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-renders-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('finds a local .png for a plain key', () => {
    fs.writeFileSync(path.join(dir, 'dva.png'), 'fake');
    expect(findLocalHeroRender('dva', dir)).toBe('dva.png');
  });

  it('finds a local .png for a hyphenated key', () => {
    fs.writeFileSync(path.join(dir, 'soldier-76.png'), 'fake');
    expect(findLocalHeroRender('soldier-76', dir)).toBe('soldier-76.png');
  });

  it('prefers .png over .jpg when both exist', () => {
    fs.writeFileSync(path.join(dir, 'lucio.png'), 'fake-png');
    fs.writeFileSync(path.join(dir, 'lucio.jpg'), 'fake-jpg');
    expect(findLocalHeroRender('lucio', dir)).toBe('lucio.png');
  });

  it('prefers .webp over .jpg when both exist', () => {
    fs.writeFileSync(path.join(dir, 'lucio.webp'), 'fake-webp');
    fs.writeFileSync(path.join(dir, 'lucio.jpg'), 'fake-jpg');
    expect(findLocalHeroRender('lucio', dir)).toBe('lucio.webp');
  });

  it('prefers .png over .webp when both exist', () => {
    fs.writeFileSync(path.join(dir, 'lucio.png'), 'fake-png');
    fs.writeFileSync(path.join(dir, 'lucio.webp'), 'fake-webp');
    expect(findLocalHeroRender('lucio', dir)).toBe('lucio.png');
  });

  it('returns null when no local file exists', () => {
    expect(findLocalHeroRender('genji', dir)).toBeNull();
  });

  it('returns null for an unreadable/missing directory instead of throwing', () => {
    expect(findLocalHeroRender('genji', path.join(dir, 'does-not-exist'))).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(findLocalHeroRender(null, dir)).toBeNull();
    expect(findLocalHeroRender(undefined, dir)).toBeNull();
    expect(findLocalHeroRender(42, dir)).toBeNull();
    expect(findLocalHeroRender({}, dir)).toBeNull();
  });

  it('returns null for an empty string key', () => {
    expect(findLocalHeroRender('', dir)).toBeNull();
  });

  it('returns null for a traversal-looking key', () => {
    fs.writeFileSync(path.join(dir, 'secret.png'), 'fake');
    expect(findLocalHeroRender('../secret', dir)).toBeNull();
    expect(findLocalHeroRender('..', dir)).toBeNull();
    expect(findLocalHeroRender('a/b', dir)).toBeNull();
    expect(findLocalHeroRender('a\\b', dir)).toBeNull();
  });
});
