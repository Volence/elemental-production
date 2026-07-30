import { describe, it, expect } from 'vitest';
import { pinwheelSVG } from './pinwheel.js';

describe('pinwheelSVG', () => {
  it('renders 8 petals with p-group in color1 and s-group in color2', () => {
    const svg = pinwheelSVG({ color1: '#ff0000', color2: '#0000ff' });
    const strokes = svg.match(/stroke="#ff0000"/g) || [];
    const strokes2 = svg.match(/stroke="#0000ff"/g) || [];
    expect(strokes.length).toBe(4);
    expect(strokes2.length).toBe(4);
    expect(svg).toContain('viewBox="130 130 740 740"');
  });
  it('supports hub content and size', () => {
    const svg = pinwheelSVG({ color1: '#f00', color2: '#00f', size: 62, hubText: '2·1' });
    expect(svg).toContain('2·1');
    expect(svg).toContain('width="62"');
  });
  it('escapes nothing weird into markup (no undefined)', () => {
    expect(pinwheelSVG({ color1: '#f00', color2: '#00f' })).not.toContain('undefined');
  });
  it('brand mode: each of the 4 colors strokes exactly 2 petals', () => {
    const svg = pinwheelSVG({ colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] });
    expect((svg.match(/stroke="#ff0000"/g) || []).length).toBe(2);
    expect((svg.match(/stroke="#00ff00"/g) || []).length).toBe(2);
    expect((svg.match(/stroke="#0000ff"/g) || []).length).toBe(2);
    expect((svg.match(/stroke="#ffff00"/g) || []).length).toBe(2);
  });
  it('brand mode ignores color1/color2 and needs no undefined', () => {
    const svg = pinwheelSVG({ colors: ['#a00', '#0a0', '#00a', '#aa0'] });
    expect(svg).not.toContain('undefined');
    // glow uses brand colors, not the (absent) color1/color2
    expect(svg).toContain('drop-shadow(0 0 4px #a00)');
  });
  it('falls back to color1/color2 when colors is not exactly 4 entries', () => {
    const svg = pinwheelSVG({ color1: '#ff0000', color2: '#0000ff', colors: ['#111', '#222', '#333'] });
    expect((svg.match(/stroke="#ff0000"/g) || []).length).toBe(4);
    expect((svg.match(/stroke="#0000ff"/g) || []).length).toBe(4);
  });
});
