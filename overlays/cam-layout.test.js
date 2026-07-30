import { describe, it, expect } from 'vitest';
import { CAM_LAYOUTS } from './cam-layout.js';

// A rect is a plain {x,y,w,h} object with numeric fields — the shape both
// camFrame() and Task 9's scene-collection generator depend on.
function assertRectShape(rect) {
  expect(rect).toBeTruthy();
  expect(typeof rect.x).toBe('number');
  expect(typeof rect.y).toBe('number');
  expect(typeof rect.w).toBe('number');
  expect(typeof rect.h).toBe('number');
}

// Every rect must fit within the 1920x1080 canvas — an off-canvas rect would
// mean a cam source sits partly off-stream once bounds-scaled behind it.
function assertWithinCanvas(rect) {
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.w).toBeLessThanOrEqual(1920);
  expect(rect.y + rect.h).toBeLessThanOrEqual(1080);
}

describe('CAM_LAYOUTS shape', () => {
  const allGroups = ['desk', 'flythrough', 'wide', 'interview'];

  it('has the four expected layout groups', () => {
    allGroups.forEach((g) => expect(CAM_LAYOUTS[g]).toBeTruthy());
  });

  it('desk.dual has exactly 2 rects with numeric x/y/w/h', () => {
    expect(CAM_LAYOUTS.desk.dual).toHaveLength(2);
    CAM_LAYOUTS.desk.dual.forEach(assertRectShape);
  });

  it('every group has a single: array with exactly 1 rect', () => {
    allGroups.forEach((g) => {
      expect(CAM_LAYOUTS[g].single).toHaveLength(1);
      assertRectShape(CAM_LAYOUTS[g].single[0]);
    });
  });

  it('flythrough preserves the legacy OBS-measured dual coords', () => {
    const [a, b] = CAM_LAYOUTS.flythrough.dual;
    expect(a).toEqual({ x: 353, y: 270, w: 501, h: 282 });
    expect(b).toEqual({ x: 1074, y: 270, w: 501, h: 282 });
  });

  it('every rect across every group/variant sits within the 1920x1080 canvas', () => {
    allGroups.forEach((g) => {
      Object.keys(CAM_LAYOUTS[g]).forEach((variant) => {
        CAM_LAYOUTS[g][variant].forEach(assertWithinCanvas);
      });
    });
  });
});
