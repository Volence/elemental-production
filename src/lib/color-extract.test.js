import { describe, it, expect } from 'vitest';
import { pickBestBucket, sampleBuckets, ELMT_ACCENT_FALLBACK } from './color-extract.js';

const bucket = (r, g, b, count, satAvg) => ({ r: r * count, g: g * count, b: b * count, count, satScore: satAvg * count });

describe('pickBestBucket', () => {
  it('prefers a saturated bucket over a larger gray one', () => {
    const buckets = { gray: bucket(128, 128, 128, 900, 0.02), red: bucket(220, 40, 40, 120, 0.75) };
    expect(pickBestBucket(buckets)).toBe('#dc2828');
  });
  it('returns the fallback accent when every bucket is near-gray', () => {
    const buckets = { a: bucket(120, 120, 125, 500, 0.03), b: bucket(90, 90, 90, 300, 0.01) };
    expect(pickBestBucket(buckets)).toBe(ELMT_ACCENT_FALLBACK);
  });
  it('returns the fallback accent for empty input', () => {
    expect(pickBestBucket({})).toBe(ELMT_ACCENT_FALLBACK);
  });
  it('keeps a bucket whose average saturation sits exactly at the 0.15 threshold', () => {
    const buckets = { at: bucket(200, 50, 50, 100, 0.15) };
    expect(pickBestBucket(buckets)).toBe('#c83232');
  });
  it('rejects a bucket whose average saturation is just below the 0.15 threshold', () => {
    const buckets = { below: bucket(200, 50, 50, 100, 0.149) };
    expect(pickBestBucket(buckets)).toBe(ELMT_ACCENT_FALLBACK);
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
