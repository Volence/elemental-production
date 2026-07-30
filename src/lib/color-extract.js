// Bucket scoring for team-color extraction from logos. Pulled out of
// App.jsx / Theming.jsx so the "vibrant beats big-but-gray" policy — and
// the pixel sampling it's calibrated against — is unit-testable and has
// exactly one implementation.
// A bucket: { r, g, b, count, satScore } (r/g/b are SUMS, satScore is
// summed per-pixel HSL saturation).
export const ELMT_ACCENT_FALLBACK = '#25aff4'; // hsl(200 90% 55%), the ELMT blue accent

const MIN_AVG_SATURATION = 0.15; // below this a bucket is "gray" — never a team color

// Legible silver band (channel/lightness 0-255) for the gray-logo fallback:
// a logo with no vibrant color reads as neutral silver, not the ELMT blue.
const SILVER_MIN = 0x8a; // 138
const SILVER_MAX = 0xc8; // 200

const clamp255 = (n) => Math.max(0, Math.min(255, n));
const toHex = (r, g, b) => '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');

// Average a bucket's summed RGB into a neutral silver: shift all channels by
// the same delta so the overall lightness lands inside [SILVER_MIN, SILVER_MAX]
// while preserving the gray's faint hue tilt (no channel is clamped away
// unless it overflows 0-255).
function neutralSilver(bucket) {
  let r = bucket.r / bucket.count;
  let g = bucket.g / bucket.count;
  let b = bucket.b / bucket.count;
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  const target = Math.max(SILVER_MIN, Math.min(SILVER_MAX, lightness));
  const delta = target - lightness;
  return toHex(clamp255(Math.round(r + delta)), clamp255(Math.round(g + delta)), clamp255(Math.round(b + delta)));
}

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
  let grayBest = null, grayBestCount = 0; // dominant near-gray bucket (by count)
  for (const b of Object.values(buckets)) {
    if (b.count === 0) continue; // guards hand-built/synthetic buckets; sampleBuckets never emits a zero-count bucket
    // Dark (l<0.15, filtered in sampleBuckets) or muted (avg sat below
    // MIN_AVG_SATURATION) brand marks don't win the vibrant pick — but a
    // logo that is ALL gray still deserves a neutral color, not the ELMT
    // accent (see the gray-logo fallback below).
    if (b.satScore / b.count < MIN_AVG_SATURATION) {
      if (b.count > grayBestCount) { grayBestCount = b.count; grayBest = b; }
      continue; // reject near-gray for the vibrant pick
    }
    const score = b.satScore * Math.sqrt(b.count);
    if (score > bestScore) { bestScore = score; best = b; }
  }
  if (best) {
    const r = Math.round(best.r / best.count);
    const g = Math.round(best.g / best.count);
    const b2 = Math.round(best.b / best.count);
    return toHex(r, g, b2);
  }
  // No vibrant bucket. If the logo has gray pixels (just no saturated ones),
  // derive a legible silver from the dominant gray bucket so a gray/mono logo
  // reads as silver — not the ELMT blue. ELMT_ACCENT_FALLBACK is now reserved
  // for the truly empty (no-buckets) / error paths.
  if (grayBest) return neutralSilver(grayBest);
  return ELMT_ACCENT_FALLBACK;
}
