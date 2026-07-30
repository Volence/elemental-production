// Applies the v2 petal-texture background to an element by URL (never base64).
function applyTextureBg(el) {
  el.classList.add('v2-texture-bg');
  el.style.setProperty('--texture-url', "url('./ELMT_BG_1920x1080.png')");
}

// Builds a data: SVG mask image for a cam-cutout layer: a full-canvas white
// rect (mask default = keep, per CSS luminance masking) with one BLACK rect
// per active cam rect punched on top (mask = hole). 1920x1080 native size
// matches the canvas 1:1 so `mask-size:100% 100%` never distorts it. Pure —
// callers (applyCutoutMask below) decide whether an empty rects list should
// even reach here.
function camMaskDataUri(rects) {
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">' +
    '<rect width="1920" height="1080" fill="white"/>';
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    svg += '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="black"/>';
  }
  svg += '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// Re-points a cutout layer element's mask to the given rect set. Callers pass
// the persistent element itself (not an id) so this stays reusable across
// scenes with different node ids — touch a custom property on a persistent
// shell node, don't rebuild the node. No rects (layout with frames off, or a
// ?bg=transparent-style path where the element doesn't exist yet) -> clear
// every mask property -> the texture (if present) covers the full canvas
// with no holes.
//
// mask-mode MUST be forced to 'luminance' (+ the legacy -webkit-mask-
// source-type equivalent) — verified against a real Chromium build while
// implementing this: an image mask source's default mode per the current
// CSS Masking spec is 'alpha', not luminance, so a mask image whose
// white/black rects are BOTH fully opaque (alpha 1 everywhere, the whole
// point of "white keep / black hole") masks NOTHING under the default mode —
// every pixel stays fully visible, no cutout at all. Explicit luminance mode
// is what makes white=visible/black=hidden work. Always set as individual
// longhands (mask-image/-size/-mode), never the `mask` shorthand — the
// shorthand resets mask-mode to its initial value (alpha) even when you
// don't mention it, silently reintroducing this exact bug.
function applyCutoutMask(el, rects) {
  if (!el) return;
  if (!rects || rects.length === 0) {
    el.style.removeProperty('mask-image');
    el.style.removeProperty('-webkit-mask-image');
    el.style.removeProperty('mask-size');
    el.style.removeProperty('-webkit-mask-size');
    el.style.removeProperty('mask-mode');
    el.style.removeProperty('-webkit-mask-source-type');
    return;
  }
  var maskUrl = 'url("' + camMaskDataUri(rects) + '")';
  el.style.setProperty('mask-image', maskUrl);
  el.style.setProperty('-webkit-mask-image', maskUrl);
  el.style.setProperty('mask-size', '100% 100%');
  el.style.setProperty('-webkit-mask-size', '100% 100%');
  el.style.setProperty('mask-mode', 'luminance');
  el.style.setProperty('-webkit-mask-source-type', 'luminance');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    applyTextureBg: applyTextureBg,
    camMaskDataUri: camMaskDataUri,
    applyCutoutMask: applyCutoutMask
  };
}
