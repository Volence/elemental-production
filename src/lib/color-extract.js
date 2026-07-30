// Bucket scoring for team-color extraction from logos. Pulled out of
// App.jsx / Theming.jsx so the "vibrant beats big-but-gray" policy — and
// the pixel sampling it's calibrated against — is unit-testable and has
// exactly one implementation.
// A bucket: { r, g, b, count, satScore } (r/g/b are SUMS, satScore is
// summed per-pixel HSL saturation).
export const ELMT_ACCENT_FALLBACK = '#25aff4'; // hsl(200 90% 55%), the ELMT blue accent

const MIN_AVG_SATURATION = 0.15; // below this a bucket is "gray" — never a team color

// Walks a canvas ImageData.data RGBA buffer (Uint8ClampedArray-like: any
// indexable array of 0-255 values in RGBA order) and quantizes surviving
// pixels into 16-step RGB buckets, accumulating HSL saturation per bucket.
// Skips transparent pixels (alpha < 128) and near-white/near-black pixels
// (lightness outside [0.15, 0.85]) — those never carry usable team-color
// signal. This exact math is what MIN_AVG_SATURATION above is calibrated
// against; keep sampling and thresholding in this one module.
export function sampleBuckets(data) {
  const buckets = {};
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2 / 255;
    if (l > 0.85 || l < 0.15) continue;
    const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1)) / 255;
    const key = `${Math.round(r / 16) * 16},${Math.round(g / 16) * 16},${Math.round(b / 16) * 16}`;
    if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, count: 0, satScore: 0 };
    buckets[key].r += r; buckets[key].g += g; buckets[key].b += b;
    buckets[key].count++; buckets[key].satScore += s;
  }
  return buckets;
}

export function pickBestBucket(buckets) {
  let best = null, bestScore = 0;
  for (const b of Object.values(buckets)) {
    if (b.count === 0) continue; // guards hand-built/synthetic buckets; sampleBuckets never emits a zero-count bucket
    // Dark (l<0.15, filtered in sampleBuckets) or muted (avg sat below
    // MIN_AVG_SATURATION) brand marks intentionally lose to the ELMT
    // accent fallback below — an accepted trade-off, not a bug.
    if (b.satScore / b.count < MIN_AVG_SATURATION) continue; // reject near-gray
    const score = b.satScore * Math.sqrt(b.count);
    if (score > bestScore) { bestScore = score; best = b; }
  }
  if (!best) return ELMT_ACCENT_FALLBACK;
  const r = Math.round(best.r / best.count);
  const g = Math.round(best.g / best.count);
  const b2 = Math.round(best.b / best.count);
  return '#' + [r, g, b2].map((c) => c.toString(16).padStart(2, '0')).join('');
}
