import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onEvent, dispatchEvent, trailingDebounce } from './obs.js';

describe('trailingDebounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces a burst into a single trailing call', () => {
    const fn = vi.fn();
    const run = trailingDebounce(fn, 500);
    // A collection import fires SceneListChanged dozens of times in a row
    for (let i = 0; i < 20; i++) run();
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs again for a burst that arrives after the window closed', () => {
    const fn = vi.fn();
    const run = trailingDebounce(fn, 500);
    run();
    vi.advanceTimersByTime(500);
    run();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('passes the newest arguments through', () => {
    const fn = vi.fn();
    const run = trailingDebounce(fn, 100);
    run('old');
    run('new');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('new');
  });

  it('cancel() drops a pending run', () => {
    const fn = vi.fn();
    const run = trailingDebounce(fn, 100);
    run();
    run.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('dispatchEvent', () => {
  it('delivers the payload to the registered handler', () => {
    const seen = [];
    onEvent('testSceneList', (d) => seen.push(d));
    dispatchEvent('testSceneList', { sceneName: 'Gameplay' });
    expect(seen).toEqual([{ sceneName: 'Gameplay' }]);
  });

  it('is a no-op for an event nobody registered for', () => {
    expect(() => dispatchEvent('testNobodyListens', {})).not.toThrow();
  });

  it('swallows a throwing handler (a bad handler must not kill the socket listener)', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    onEvent('testThrows', () => { throw new Error('boom'); });
    expect(() => dispatchEvent('testThrows', {})).not.toThrow();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('swallows a rejected async handler', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    onEvent('testRejects', async () => { throw new Error('async boom'); });
    dispatchEvent('testRejects', {});
    await new Promise(r => setTimeout(r, 0));
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
