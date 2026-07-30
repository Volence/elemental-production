import { describe, it, expect } from 'vitest';
import { camMaskDataUri, applyCutoutMask } from './bg-helper.js';

// Minimal stub matching the el.style.setProperty/removeProperty surface
// applyCutoutMask actually touches — no DOM required.
function makeStyleStub() {
  var calls = { set: [], removed: [] };
  var el = {
    style: {
      setProperty: function (name, value) { calls.set.push([name, value]); },
      removeProperty: function (name) { calls.removed.push(name); }
    }
  };
  return { el: el, calls: calls };
}

function decodeSvg(uri) {
  var prefix = 'data:image/svg+xml;charset=utf-8,';
  expect(uri.indexOf(prefix)).toBe(0);
  return decodeURIComponent(uri.slice(prefix.length));
}

describe('camMaskDataUri', () => {
  it('encodes a full-canvas white base rect plus one black rect per input rect', () => {
    var rects = [
      { x: 330, y: 120, w: 580, h: 362 },
      { x: 1010, y: 120, w: 580, h: 362 }
    ];
    var svg = decodeSvg(camMaskDataUri(rects));

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">');
    expect(svg).toContain('<rect width="1920" height="1080" fill="white"/>');
    expect((svg.match(/fill="black"/g) || []).length).toBe(2);
    expect(svg).toContain('<rect x="330" y="120" width="580" height="362" fill="black"/>');
    expect(svg).toContain('<rect x="1010" y="120" width="580" height="362" fill="black"/>');
  });

  it('produces a white-only mask (no black rects) for an empty rect list', () => {
    var svg = decodeSvg(camMaskDataUri([]));
    expect(svg).toContain('fill="white"');
    expect(svg).not.toContain('fill="black"');
  });

  it('handles a single rect', () => {
    var svg = decodeSvg(camMaskDataUri([{ x: 610, y: 110, w: 700, h: 437 }]));
    expect((svg.match(/fill="black"/g) || []).length).toBe(1);
    expect(svg).toContain('<rect x="610" y="110" width="700" height="437" fill="black"/>');
  });
});

describe('applyCutoutMask', () => {
  it('sets both -webkit and standard mask longhands with luminance forced, never the shorthand', () => {
    var stub = makeStyleStub();
    applyCutoutMask(stub.el, [{ x: 330, y: 120, w: 580, h: 362 }]);

    var names = stub.calls.set.map(function (c) { return c[0]; });
    expect(names).toContain('mask-image');
    expect(names).toContain('-webkit-mask-image');
    expect(names).toContain('mask-size');
    expect(names).toContain('-webkit-mask-size');
    expect(names).toContain('mask-mode');
    expect(names).toContain('-webkit-mask-source-type');
    expect(names).not.toContain('mask');

    var byName = {};
    stub.calls.set.forEach(function (c) { byName[c[0]] = c[1]; });
    expect(byName['mask-mode']).toBe('luminance');
    expect(byName['-webkit-mask-source-type']).toBe('luminance');
    expect(byName['mask-size']).toBe('100% 100%');
    expect(byName['-webkit-mask-size']).toBe('100% 100%');
    expect(byName['mask-image']).toContain('url("data:image/svg+xml');
    expect(byName['-webkit-mask-image']).toBe(byName['mask-image']);

    expect(stub.calls.removed).toEqual([]);
  });

  it('clears every mask property via removeProperty for an empty rects list', () => {
    var stub = makeStyleStub();
    applyCutoutMask(stub.el, []);

    expect(stub.calls.set).toEqual([]);
    expect(stub.calls.removed).toEqual(
      expect.arrayContaining([
        'mask-image',
        '-webkit-mask-image',
        'mask-size',
        '-webkit-mask-size',
        'mask-mode',
        '-webkit-mask-source-type'
      ])
    );
  });

  it('clears every mask property for null/undefined rects', () => {
    var stubNull = makeStyleStub();
    applyCutoutMask(stubNull.el, null);
    expect(stubNull.calls.removed.length).toBe(6);

    var stubUndef = makeStyleStub();
    applyCutoutMask(stubUndef.el, undefined);
    expect(stubUndef.calls.removed.length).toBe(6);
  });

  it('no-ops safely when el is missing', () => {
    expect(() => applyCutoutMask(null, [{ x: 0, y: 0, w: 1, h: 1 }])).not.toThrow();
  });
});
