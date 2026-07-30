// Bucket scoring for team-color extraction from logos. Pulled out of
// App.jsx so the "vibrant beats big-but-gray" policy is unit-testable.
// A bucket: { r, g, b, count, satScore } (r/g/b are SUMS, satScore is
// summed per-pixel HSL saturation — see extractColorFromLogo).
export const ELMT_ACCENT_FALLBACK = '#25aff4'; // hsl(200 90% 55%), the ELMT blue accent

const MIN_AVG_SATURATION = 0.15; // below this a bucket is "gray" — never a team color

export function pickBestBucket(buckets) {
  let best = null, bestScore = 0;
  for (const b of Object.values(buckets)) {
    if (b.count === 0) continue;
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
