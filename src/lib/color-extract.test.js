import { describe, it, expect } from 'vitest';
import { pickBestBucket, sampleBuckets, ELMT_ACCENT_FALLBACK } from './color-extract.js';

const bucket = (r, g, b, count, satAvg) => ({ r: r * count, g: g * count, b: b * count, count, satScore: satAvg * count });

describe('pickBestBucket', () => {
  it('prefers a saturated bucket over a larger gray one', () => {
    const buckets = { gray: bucket(128, 128, 128, 900, 0.02), red: bucket(220, 40, 40, 120, 0.75) };
    expect(pickBestBucket(buckets)).toBe('#dc2828');
  });
  it('returns a neutral silver (not the blue accent) when every bucket is near-gray', () => {
    const buckets = { a: bucket(120, 120, 125, 500, 0.03), b: bucket(90, 90, 90, 300, 0.01) };
    const out = pickBestBucket(buckets);
    // dominant gray bucket 'a' (count 500) -> lightness 122.5 shifted +15.5 into band
    expect(out).toBe('#88888d');
    expect(out).not.toBe(ELMT_ACCENT_FALLBACK);
  });
  it('clamps a pure mid-gray to the bottom of the silver band', () => {
    // avg gray 128 -> lightness 128 < 138 -> shifted to #8a8a8a
    expect(pickBestBucket({ g: bucket(128, 128, 128, 400, 0.02) })).toBe('#8a8a8a');
  });
  it('keeps a gray-fallback result inside the legible band with a near-neutral hue', () => {
    const out = pickBestBucket({ g: bucket(60, 60, 66, 300, 0.05) }); // dark gray
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(out.slice(i, i + 2), 16));
    const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
    expect(lightness).toBeGreaterThanOrEqual(0x8a);
    expect(lightness).toBeLessThanOrEqual(0xc8);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(20); // stays gray, not tinted loud
  });
  it('returns the fallback accent for empty input (no buckets / error path)', () => {
    expect(pickBestBucket({})).toBe(ELMT_ACCENT_FALLBACK);
  });
  it('returns the fallback accent when the only buckets are synthetic zero-count (error guard)', () => {
    expect(pickBestBucket({ z: { r: 100, g: 100, b: 100, count: 0, satScore: 0 } })).toBe(ELMT_ACCENT_FALLBACK);
  });
  it('keeps a bucket whose average saturation sits exactly at the 0.15 threshold', () => {
    const buckets = { at: bucket(200, 50, 50, 100, 0.15) };
    expect(pickBestBucket(buckets)).toBe('#c83232');
  });
  it('rejects a just-below-0.15 bucket from the VIBRANT pick (feeds the neutral fallback instead of the raw color)', () => {
    const buckets = { below: bucket(200, 50, 50, 100, 0.149) };
    const out = pickBestBucket(buckets);
    // The sat gate still rejects it as a team color: it never returns the raw
    // vibrant avg '#c83232'. Being the only (dominant) bucket, it now flows
    // through the lightness-clamped neutral path rather than the blue accent.
    expect(out).not.toBe('#c83232');
    expect(out).not.toBe(ELMT_ACCENT_FALLBACK);
  });
});

describe('sampleBuckets', () => {
  it('buckets a saturated red pixel', () => {
    const data = [255, 0, 0, 255]; // pure red, opaque
    const buckets = sampleBuckets(data);
    const keys = Object.keys(buckets);
    expect(keys).toHaveLength(1);
    const b = buckets[keys[0]];
    expect(b.count).toBe(1);
    expect(b.r).toBe(255);
    expect(b.g).toBe(0);
    expect(b.b).toBe(0);
    expect(b.satScore).toBeCloseTo(1, 5);
  });
  it('skips transparent pixels', () => {
    const data = [10, 20, 30, 0]; // alpha 0 — below the 128 cut
    expect(sampleBuckets(data)).toEqual({});
  });
  it('skips near-white and near-black pixels', () => {
    const data = [
      250, 250, 250, 255, // near-white, l > 0.85
      5, 5, 5, 255,        // near-black, l < 0.15
    ];
    expect(sampleBuckets(data)).toEqual({});
  });
});
