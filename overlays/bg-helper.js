// Applies the v2 petal-texture background to an element by URL (never base64).
function applyTextureBg(el) {
  el.classList.add('v2-texture-bg');
  el.style.setProperty('--texture-url', "url('./ELMT_BG_1920x1080.png')");
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applyTextureBg: applyTextureBg };
}
