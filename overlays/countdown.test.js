import { describe, it, expect } from 'vitest';
import { getRemaining, formatTime } from './countdown.js';

describe('getRemaining', () => {
  it('running: returns duration minus elapsed-since-startedAt', () => {
    var now = 1000000;
    var state = { running: true, startedAt: now - 5000, duration: 30 };
    // 5s elapsed -> 25s left
    expect(getRemaining(state, now)).toBe(25);
  });

  it('running: ceils partial seconds remaining', () => {
    var now = 1000000;
    var state = { running: true, startedAt: now - 4200, duration: 30 };
    // 4.2s elapsed -> 25.8s left -> ceil -> 26
    expect(getRemaining(state, now)).toBe(26);
  });

  it('running: clamps to 0 when expired (elapsed exceeds duration)', () => {
    var now = 1000000;
    var state = { running: true, startedAt: now - 60000, duration: 30 };
    expect(getRemaining(state, now)).toBe(0);
  });

  it('running but missing startedAt: falls back to duration, clamped', () => {
    var now = 1000000;
    var state = { running: true, startedAt: null, duration: 42 };
    expect(getRemaining(state, now)).toBe(42);
  });

  it('paused: returns the stored remaining value, ignoring startedAt/duration', () => {
    var now = 1000000;
    var state = { running: false, remaining: 17, duration: 999, startedAt: now - 500000 };
    expect(getRemaining(state, now)).toBe(17);
  });

  it('paused: clamps negative stored remaining to 0', () => {
    var now = 1000000;
    var state = { running: false, remaining: -5 };
    expect(getRemaining(state, now)).toBe(0);
  });

  it('paused: missing remaining defaults to 0', () => {
    var now = 1000000;
    var state = { running: false };
    expect(getRemaining(state, now)).toBe(0);
  });

  it('missing/undefined countdown state returns 0', () => {
    expect(getRemaining(undefined, Date.now())).toBe(0);
    expect(getRemaining(null, Date.now())).toBe(0);
  });
});

describe('formatTime', () => {
  it('formats zero-padded MM:SS', () => {
    expect(formatTime(65)).toBe('01:05');
  });

  it('pads single-digit minutes and seconds', () => {
    expect(formatTime(5)).toBe('00:05');
  });

  it('formats zero as 00:00 (majority behavior — see reconciliation note)', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  it('formats large minute counts without truncation', () => {
    expect(formatTime(3661)).toBe('61:01');
  });

  it('floors fractional seconds', () => {
    expect(formatTime(65.9)).toBe('01:05');
  });

  it('treats negative input as 0', () => {
    expect(formatTime(-5)).toBe('00:00');
  });
});
