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
});
