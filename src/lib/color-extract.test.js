import { describe, it, expect } from 'vitest';
import { pickBestBucket, ELMT_ACCENT_FALLBACK } from './color-extract.js';

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
});
