// Neon-style ELMT pinwheel. Exact petal geometry copied verbatim from the
// website's TeamBrandingGuide (org.ai extraction, viewBox 130 130 740 740).
// p-group petals take color1 (team 1), s-group take color2 (team 2) — same
// mapping the site uses (RED+GREEN groups -> primary, BLUE+ORANGE -> secondary).

// PETALS order: p,p,s,s,p,p,s,s (RED, BLUE, GREEN, ORANGE quadrant pairs).
var PETALS = [
  // RED group -> PRIMARY (top area)
  { d: 'M 366.488 385.625 C 354.914 370.113 325.266 362.828 287.316 359.312 C 319.309 312.957 366.570 277.551 422.035 260.062 C 385.609 291.207 361.617 329.793 366.488 385.625 Z', color: 'p' },
  { d: 'M 534.289 326.828 C 494.590 366.621 475.922 405.578 468.449 456.109 C 461.191 452.020 449.672 444.570 438.422 432.309 C 434.559 428.102 430.730 423.320 427.121 417.922 C 408.570 390.148 406.730 362.340 406.609 350.922 C 404.129 309.559 435.070 275.551 499.141 248.840 C 502.910 247.270 506.801 245.719 510.809 244.199 C 548.922 227.840 573.871 198.531 592.012 162.5 C 605.039 237.762 579.961 288.828 534.289 326.828 Z', color: 'p' },
  // BLUE group -> SECONDARY (right area)
  { d: 'M 757.566 474.812 C 710.516 419.156 651.734 381.766 565.039 387.805 C 589.227 370.977 600.930 326.781 607.016 270.242 C 688.922 306.477 748.062 383.441 757.566 474.812 Z', color: 's' },
  { d: 'M 545.941 427.953 C 620.676 414.828 671.387 440.086 709.125 486.082 C 748.633 526.059 787.320 544.863 837.5 552.383 C 832.047 562.215 820.559 579.777 799.570 594.008 C 772 612.691 744.379 614.543 733.039 614.664 C 689.547 617.309 654.246 582.215 627.070 509.727 C 610.824 471.352 581.719 446.219 545.941 427.953 Z', color: 's' },
  // GREEN group -> PRIMARY (bottom area)
  { d: 'M 715.137 641.781 C 714.160 643.195 713.176 644.602 712.176 646 C 683.199 686.438 642.441 718.172 594.785 736.406 L 594.777 736.406 C 591.906 737.508 589.031 738.551 586.105 739.543 C 620.160 708.156 641.891 669.391 637.121 614.805 C 648.723 630.352 677.754 637.969 715.137 641.781 Z', color: 'p' },
  { d: 'M 413.312 837.5 C 400.281 762.238 425.363 711.168 471.035 673.164 C 510.734 633.379 529.406 594.422 536.875 543.887 C 546.637 549.379 564.078 560.945 578.203 582.086 C 596.758 609.848 598.598 637.664 598.719 649.082 C 601.344 692.883 566.496 728.430 494.512 755.797 C 456.410 772.160 431.449 801.473 413.312 837.5 Z', color: 'p' },
  // ORANGE group -> SECONDARY (left area)
  { d: 'M 435.969 617.031 C 412.020 633.688 399.746 675.898 393.070 730.441 C 319.762 697.262 265.043 631.316 248.430 551.762 L 248.430 551.754 C 247.586 547.715 246.840 543.641 246.195 539.531 C 293.496 590.188 352.363 622.855 435.969 617.031 Z', color: 's' },
  { d: 'M 454.059 572.477 C 379.324 585.602 328.613 560.340 290.875 514.348 C 251.367 474.371 212.680 455.562 162.5 448.043 C 167.953 438.215 179.441 420.648 200.430 406.422 C 228 387.738 255.621 385.883 266.961 385.762 C 310.453 383.121 345.754 418.211 372.930 490.703 C 389.176 529.078 418.281 554.211 454.059 572.477 Z', color: 's' },
];

// Brand-mode routing: petal PAIR n (spatial quadrant top,right,bottom,left)
// draws colors[BRAND_PAIR_ORDER[n]] where colors is the canonical brand
// palette [red, gold, green, blue]. Chosen by rendering against org.png:
// top→red(0), right→blue(3), bottom→green(2), left→gold(1).
var BRAND_PAIR_ORDER = [0, 3, 2, 1];

// Build the <svg> markup for the pinwheel. opts:
//   color1   (string, required unless `colors` given) — color for 'p' petals
//   color2   (string, required unless `colors` given) — color for 's' petals
//   colors   (array [c0,c1,c2,c3], optional) — BRAND mode. When present it
//            overrides color1/color2: callers pass the brand palette in its
//            canonical order [red, gold, green, blue] (same order as
//            theme-v2's --grad4) and the four spatial petal PAIRS are routed
//            (via BRAND_PAIR_ORDER) so the crest reproduces the real elmt.gg
//            mark — red top, blue right, green bottom, gold left (overlays/
//            org.png) — instead of a 2-team medallion. Existing color1/color2
//            callers (no `colors`) are unchanged.
//   size     (number, optional, default 62) — rendered width/height in px
//   hubText  (string, optional) — text drawn centered over a dark hub circle.
//            Interpolated raw into the SVG: callers must pass trusted,
//            pre-sanitized values (scores like '2·1'), never raw FACEIT data.
//   glow     (boolean, optional, default true) — drop-shadow glow on the svg
function pinwheelSVG(opts) {
  opts = opts || {};
  var color1 = opts.color1;
  var color2 = opts.color2;
  var colors = (opts.colors && opts.colors.length === 4) ? opts.colors : null;
  var size = opts.size || 62;
  var hubText = opts.hubText || '';
  var glow = opts.glow !== false;
  // Glow hues: two brand colors in brand mode (top+bottom = c0/c2 for a
  // multi-hue wash), else the two team colors.
  var glow1 = colors ? colors[0] : color1;
  var glow2 = colors ? colors[2] : color2;

  var paths = '';
  var i;
  for (i = 0; i < PETALS.length; i++) {
    var petal = PETALS[i];
    // Brand mode: petals form 4 spatial pairs (indices 2k,2k+1) laid out
    // top / right / bottom / left. Callers pass [red, gold, green, blue];
    // BRAND_PAIR_ORDER routes each pair to the palette slot that matches
    // org.png (red top, blue right, green bottom, gold left). Non-brand mode
    // keeps the classic p→color1 / s→color2 team mapping.
    var c = colors ? colors[BRAND_PAIR_ORDER[Math.floor(i / 2)]] : (petal.color === 'p' ? color1 : color2);
    paths += '<path d="' + petal.d + '" fill="' + c + '" fill-opacity="0.25" ' +
      'stroke="' + c + '" stroke-width="8" stroke-linejoin="round" />';
  }

  var hub = '';
  if (hubText) {
    hub = '<circle cx="500" cy="500" r="150" fill="rgba(10,10,16,0.85)" stroke="rgba(255,255,255,0.15)" stroke-width="2" />' +
      '<text x="500" y="500" text-anchor="middle" dominant-baseline="central" ' +
      'font-size="140" font-weight="700" fill="#ffffff" font-family="inherit">' + hubText + '</text>';
  }

  var style = '';
  if (glow) {
    style = ' style="filter: drop-shadow(0 0 4px ' + glow1 + ') drop-shadow(0 0 4px ' + glow2 + ');"';
  }

  return '<svg viewBox="130 130 740 740" width="' + size + '" height="' + size + '"' + style + '>' +
    paths + hub + '</svg>';
}

// CJS export guard so Node/Vitest can import this for tests; harmless in the
// browser since `module` is undefined there and this block never executes.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pinwheelSVG: pinwheelSVG };
}
